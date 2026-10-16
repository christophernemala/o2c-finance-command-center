import { sessionCookieOptions } from "@/lib/auth/cookie-options";
import { NextRequest,NextResponse } from "next/server";
import { sameOrigin,boundedFormRequest } from "@/lib/request-security";
import { authSiteOrigin } from "@/lib/auth-flow";
import { createLoginLimiter,loginLimiterConfig,trustedLoginIp } from "@/lib/login-limiter";
import { databasePool } from "@/lib/postgres/pool";
import { postgresConfig } from "@/lib/postgres/config";
import { registrationSchema,requestRegistration,registrationReceipt } from "@/lib/auth/registration";
export async function POST(request:NextRequest){
 if(!sameOrigin(request.headers))return new NextResponse("Forbidden",{status:403});
 const body=await boundedFormRequest(request,16_384);if(body instanceof Response)return body;
 const origin=authSiteOrigin();if(!origin || request.headers.get("origin")!==origin)return new NextResponse("Registration unavailable",{status:503});
 const destination=new URL("/signup",origin);const settings=loginLimiterConfig();let received=false;
 try{
  if(!settings || !postgresConfig())throw new Error("Unavailable");
  const parsed=registrationSchema.safeParse(Object.fromEntries(await body.formData()));
  if(!parsed.success){destination.searchParams.set("error","details");return NextResponse.redirect(destination,303);}
  const attempt=await createLoginLimiter(settings).reserve(parsed.data.email,trustedLoginIp(request.headers));
  if(!attempt.allowed)return new NextResponse("Too many registration attempts",{status:429,headers:{"Retry-After":String(attempt.retryAfter),"Cache-Control":"no-store"}});
  await requestRegistration(databasePool(),parsed.data);destination.searchParams.set("message","requested");received=true;
 }catch{destination.searchParams.set("error","unavailable");}
 const response=NextResponse.redirect(destination,{status:303,headers:{"Cache-Control":"no-store"}});
 if(received && settings)response.cookies.set(sessionCookieOptions().secure?"__Host-o2c-registration-receipt":"o2c-registration-receipt",registrationReceipt(settings.secret),{...sessionCookieOptions(),maxAge:600});
 return response;
}
