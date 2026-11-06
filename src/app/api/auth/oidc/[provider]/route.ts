import { NextRequest,NextResponse } from "next/server";
import { authSiteOrigin,authRequestOrigin } from "@/lib/auth-flow";
import { oidc,oidcSettings,oidcConfiguration,oidcCookieName } from "@/lib/auth/oidc";
import { sameOrigin,boundedFormRequest } from "@/lib/request-security";
import { createLoginLimiter,loginLimiterConfig,trustedLoginIp,oidcReservationCookie,sealReservation } from "@/lib/login-limiter";
import { createClient } from "@/lib/postgres/server";
import { databasePool } from "@/lib/postgres/pool";
import { transaction } from "@/lib/postgres/transaction";
import { sessionCookieOptions } from "@/lib/auth/cookie-options";
import { tokenHash } from "@/lib/auth/crypto";
import { cookies } from "next/headers";
export async function POST(request:NextRequest,{params}:{params:Promise<{provider:string}>}){
 if(!sameOrigin(request.headers))return new NextResponse("Forbidden",{status:403});
 const bounded=await boundedFormRequest(request,1024);if(bounded instanceof Response)return bounded;
 const {provider}=await params;if(provider!=="google" && provider!=="microsoft")return new NextResponse("Not found",{status:404});
 const origin=authSiteOrigin(),limit=loginLimiterConfig();
 if(!origin || !limit || !oidcSettings(provider) || !authRequestOrigin(request.headers.get("origin")))return new NextResponse("Identity provider unavailable",{status:503});
 // The redirect URI is registered for the stable origin only. The session cookie is host-only, so a signed-in user
 // linking a provider from a deployment URL is told to use the stable URL; never turn a link into a fresh sign-in.
 const requestOrigin=request.headers.get("origin")!;
 if(requestOrigin!==origin){
  // Check the session itself, not just the cookie: a stale cookie is an ordinary sign-in, not a link.
  let signedIn=false;try{signedIn=!!(await (await createClient()).auth.getUser()).data.user;}catch{signedIn=false;}
  return NextResponse.redirect(new URL(signedIn?"/auth/security?error=host":"/login",signedIn?requestOrigin:origin),{status:303,headers:{"Cache-Control":"no-store"}});
 }
 const failure=new URL("/login?error=oauth",origin);
 try{
  const ip=trustedLoginIp(request.headers);const attempt=await createLoginLimiter(limit).reserve(`oidc-${provider}-${ip}`,ip);
  if(!attempt.allowed)return new NextResponse("Too many sign-in attempts",{status:429,headers:{"Retry-After":String(attempt.retryAfter)}});
  const {config}=await oidcConfiguration(provider);const state=oidc.randomState(),nonce=oidc.randomNonce(),verifier=oidc.randomPKCECodeVerifier();
  const client=await createClient();const user=(await client.auth.getUser()).data.user;
  const options=sessionCookieOptions();const jar=await cookies();const token=jar.get(options.secure?"__Host-o2c-session":"o2c-session")?.value;
  const link=user && token ? {id:user.id,hash:tokenHash(token)}:null;
  await transaction(databasePool(),async c=>{
    await c.query("delete from auth.oauth_flows where expires_at<now()");
    await c.query("insert into auth.oauth_flows(state_hash,provider,verifier,nonce,link_user_id,link_session_hash,expires_at) values($1,$2,$3,$4,$5,$6,now()+interval '10 minutes')",[tokenHash(state),provider,verifier,nonce,link?.id??null,link?.hash??null]);
  });
  const url=oidc.buildAuthorizationUrl(config,{redirect_uri:`${origin}/api/auth/oidc/${provider}/callback`,scope:"openid email profile",state,nonce,code_challenge:await oidc.calculatePKCECodeChallenge(verifier),code_challenge_method:"S256",prompt:"select_account"});
  const response=NextResponse.redirect(url,303);response.cookies.set(oidcCookieName(provider,options.secure),state,{...options,maxAge:600});
  response.cookies.set(oidcReservationCookie,sealReservation(attempt.ticket,limit.secret),{httpOnly:true,secure:options.secure,sameSite:"lax",path:"/",maxAge:600});response.headers.set("Cache-Control","no-store");return response;
 }catch{return NextResponse.redirect(failure,{status:303,headers:{"Cache-Control":"no-store"}});}
}
