import { NextRequest,NextResponse } from "next/server";
import { authSiteOrigin,authenticationAssurance } from "@/lib/auth-flow";
import { oidc,oidcConfiguration,validateProviderClaims,oidcCookieName } from "@/lib/auth/oidc";
import { validToken,tokenHash } from "@/lib/auth/crypto";
import { createClient } from "@/lib/postgres/server";
import { databasePool } from "@/lib/postgres/pool";
import { transaction } from "@/lib/postgres/transaction";
import { sessionCookieOptions } from "@/lib/auth/cookie-options";
export async function GET(request:NextRequest,{params}:{params:Promise<{provider:string}>}){
 const {provider}=await params;if(provider!=="google" && provider!=="microsoft")return new NextResponse("Not found",{status:404});
 const origin=authSiteOrigin();if(!origin)return new NextResponse("Sign-in unavailable",{status:503});
 const target=new URL("/login?error=oauth",origin);
 try{
  const state=request.nextUrl.searchParams.get("state"),cookie=request.cookies.get(oidcCookieName(provider,sessionCookieOptions().secure))?.value;
  if(!validToken(state) || state!==cookie || request.nextUrl.search.length>8192)throw new Error("Invalid state");
  const flow=await transaction(databasePool(),async c=>(await c.query<{verifier:string;nonce:string;link_session_hash:string|null}>("delete from auth.oauth_flows where state_hash=$1 and provider=$2 and expires_at>now() returning verifier,nonce,link_session_hash",[tokenHash(state),provider])).rows[0]);
  if(!flow)throw new Error("Expired sign-in");
  const {config,settings}=await oidcConfiguration(provider);
  const callback=new URL(`/api/auth/oidc/${provider}/callback`,origin);callback.search=request.nextUrl.search;
  const tokens=await oidc.authorizationCodeGrant(config,callback,{pkceCodeVerifier:flow.verifier,expectedState:state,expectedNonce:flow.nonce,idTokenExpected:true});
  const claims=tokens.claims();if(!claims)throw new Error("Missing identity");
  const external=validateProviderClaims(provider,claims,settings.issuer);
  const client=await createClient();const signed=await client.auth.signInWithExternal(external,flow.link_session_hash);
  if(signed.error){target.pathname="/signup";target.search="?error=link";}
  else{target.pathname=await authenticationAssurance(client)==="mfa"?"/auth/verify":"/";target.search="";}
 }catch{/* Do not expose provider tokens, errors or profile data in URLs. */}
 const response=NextResponse.redirect(target,{status:303,headers:{"Cache-Control":"no-store"}});response.cookies.set(oidcCookieName(provider,sessionCookieOptions().secure),"",{...sessionCookieOptions(),maxAge:0});return response;
}
