import { after,NextRequest,NextResponse } from 'next/server';
import { z } from 'zod';
import { cookies } from 'next/headers';
import { sameOrigin,boundedFormRequest } from '@/lib/request-security';
import { authSiteOrigin,authenticationAssurance,verifiedWorkspace } from '@/lib/auth-flow';
import { createLoginLimiter,loginLimiterConfig,trustedLoginIp,sealValue,openValue } from '@/lib/login-limiter';
import { postgresConfig } from '@/lib/postgres/config';
import { databasePool } from '@/lib/postgres/pool';
import { createClient } from '@/lib/postgres/server';
import { newToken,encryptionKey,validToken } from '@/lib/auth/crypto';
import { requestEmailCode,deliverEmailCode,emailCodeCookie } from '@/lib/auth/email-code';
import { emailDeliverySettings,sendEmailCode } from '@/lib/auth/email-delivery';
import { sessionCookieOptions } from '@/lib/auth/cookie-options';
export async function POST(request:NextRequest){
 if(!sameOrigin(request.headers))return new NextResponse('Forbidden',{status:403});
 const body=await boundedFormRequest(request,4096);if(body instanceof Response)return body;
 const origin=authSiteOrigin();if(!origin||request.headers.get('origin')!==origin)return new NextResponse('Sign-in unavailable',{status:503});
 const destination=new URL('/login/code',origin);const options=sessionCookieOptions();const name=emailCodeCookie(options.secure);const accountCookie=`${name}-account`;
 const settings=loginLimiterConfig();
 if(!settings||!postgresConfig()||!encryptionKey())return new NextResponse('Sign-in protection unavailable',{status:503,headers:{'Cache-Control':'no-store'}});
 try{
  const form=await body.formData();
  if(form.get('intent')==='request'){
   if(!emailDeliverySettings())return new NextResponse('Email sign-in requires a configured email sender. Use password sign-in.',{status:503,headers:{'Cache-Control':'no-store'}});
   const parsed=z.string().trim().toLowerCase().email().max(254).safeParse(form.get('email'));
   if(!parsed.success){destination.searchParams.set('error','invalid');return NextResponse.redirect(destination,303);}
   const attempt=await createLoginLimiter(settings).reserve(parsed.data,trustedLoginIp(request.headers));
   if(!attempt.allowed)return new NextResponse('Too many code requests. Try again later.',{status:429,headers:{'Retry-After':String(attempt.retryAfter),'Cache-Control':'no-store'}});
   const binding=newToken();
   // Delivery runs after the response, so registered and unknown addresses answer in the same time and the same way.
   // A failed send is logged and its code deleted, so no undelivered code stays usable.
   const pool=databasePool();
   await requestEmailCode(pool,parsed.data,binding,settings.secret,async(to,code)=>{after(()=>deliverEmailCode(pool,binding,()=>sendEmailCode(to,code)));});
   destination.searchParams.set('step','verify');const response=NextResponse.redirect(destination,{status:303,headers:{'Cache-Control':'no-store'}});
   response.cookies.set(name,binding,{...options,maxAge:600});response.cookies.set(accountCookie,sealValue(`${binding}:${parsed.data}`,settings.secret),{...options,maxAge:600});return response;
  }
  if(form.get('intent')!=='verify')return new NextResponse('Invalid request',{status:400});
  const jar=await cookies();const binding=jar.get(name)?.value;const code=form.get('code');destination.searchParams.set('step','verify');
  // The account cookie is sealed together with this challenge's binding, so it cannot be paired with another challenge.
  const sealed=openValue(jar.get(accountCookie)?.value,settings.secret);const email=binding&&sealed?.startsWith(`${binding}:`)?sealed.slice(binding.length+1):null;
  if(!validToken(binding)||!email||typeof code!=='string'||!/^\d{6}$/.test(code)){destination.searchParams.set('error','invalid');return NextResponse.redirect(destination,303);}
  // Every guess spends the account's sign-in budget, shared with code requests and passwords, so new codes do not reset it.
  const limiter=createLoginLimiter(settings);const guess=await limiter.reserve(email,trustedLoginIp(request.headers));
  if(!guess.allowed)return new NextResponse('Too many sign-in attempts. Try again later.',{status:429,headers:{'Retry-After':String(guess.retryAfter),'Cache-Control':'no-store'}});
  const client=await createClient();const result=await client.auth.signInWithEmailCode(binding,code,settings.secret);
  if(!result.error){try{await limiter.succeed(guess.ticket);}catch{/* Conservative reservation expiry. */}}
  if(result.error){destination.searchParams.set('error','invalid');return NextResponse.redirect(destination,{status:303,headers:{'Cache-Control':'no-store'}});}
  const assurance=await authenticationAssurance(client);
  if(assurance==='mfa'){destination.pathname='/auth/verify';destination.search='';}
  else if(assurance==='ready'){
   const workspace=await verifiedWorkspace(client);
   if(workspace.state==='authorized'){destination.pathname='/dashboard';destination.search='';destination.searchParams.set('tenant',workspace.tenantId);}
   else{await client.auth.signOut();destination.pathname='/login';destination.search='?error=pending';}
  }else{await client.auth.signOut();throw Error('Unavailable');}
  const response=NextResponse.redirect(destination,{status:303,headers:{'Cache-Control':'no-store'}});response.cookies.set(name,'',{...options,maxAge:0});response.cookies.set(accountCookie,'',{...options,maxAge:0});return response;
 }catch{destination.searchParams.set('error','unavailable');return NextResponse.redirect(destination,{status:303,headers:{'Cache-Control':'no-store'}});}
}
