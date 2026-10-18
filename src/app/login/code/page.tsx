import Link from 'next/link';
import { cookies } from 'next/headers';
import { AuthShell } from '@/components/auth-shell';
import { MutationForm } from '@/components/mutation-form';
import { postgresConfig } from '@/lib/postgres/config';
import { encryptionKey,validToken } from '@/lib/auth/crypto';
import { loginLimiterConfig } from '@/lib/login-limiter';
import { emailDeliverySettings } from '@/lib/auth/email-delivery';
import { emailCodeCookie } from '@/lib/auth/email-code';
import { sessionCookieOptions } from '@/lib/auth/cookie-options';
export const dynamic='force-dynamic';
export const metadata={title:'Email sign-in code'};
export default async function EmailCode({searchParams}:{searchParams:Promise<{step?:string;error?:string}>}){
 const params=await searchParams;const available=!!postgresConfig()&&!!encryptionKey()&&!!loginLimiterConfig()&&!!emailDeliverySettings();
 const verifying=params.step==='verify'&&validToken((await cookies()).get(emailCodeCookie(sessionCookieOptions().secure))?.value);
 return <AuthShell><h1 className="text-3xl tracking-tight">{verifying?'Check your email':'Sign in with an email code'}</h1>
 <p className="mt-3 leading-6 text-muted">{verifying?'If this email belongs to an active account, a six-digit code has been sent. Check your inbox and spam folder. Use it here within 10 minutes.':'Use the email address of your existing workspace account. No password is needed for this sign-in method.'}</p>
 {!available&&<p role="status" className="mt-5 rounded-xl border border-line p-4">Email sign-in is unavailable until your administrator configures the email sender and sign-in protection. You can use password sign-in.</p>}
 {params.error&&<p role="alert" className="mt-5 rounded-xl border border-line p-4">{params.error==='invalid'?'The email or code is invalid, expired, or has reached its attempt limit. Request a new code if needed.':'Email sign-in could not be completed. Try again later or use password sign-in.'}</p>}
 <div className="mt-6"><MutationForm action="/api/auth/email-code"><fieldset disabled={!available} className="space-y-4 border-0 p-0"><input type="hidden" name="intent" value={verifying?'verify':'request'}/>
 {verifying?<label className="block text-sm font-medium">Six-digit code<input name="code" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} className="mt-2 h-12 w-full rounded-xl border border-line bg-surface px-4 font-mono text-xl tracking-widest"/></label>:<label className="block text-sm font-medium">Account email<input name="email" type="email" autoComplete="email" required maxLength={254} className="mt-2 h-12 w-full rounded-xl border border-line bg-surface px-4"/></label>}
 <button type="submit" className="button w-full">{verifying?'Verify code and sign in':'Email my sign-in code'}</button></fieldset></MutationForm></div>
 {verifying&&<p className="mt-5 text-center text-sm"><Link href="/login/code" className="text-link underline underline-offset-4">Request another code</Link></p>}
 <p className="mt-5 text-center text-sm"><Link href="/login" className="text-link underline underline-offset-4">Use password sign-in</Link></p></AuthShell>;
}
