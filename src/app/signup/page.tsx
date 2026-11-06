import { sessionCookieOptions } from "@/lib/auth/cookie-options";
import { cookies } from "next/headers";
import { validRegistrationReceipt } from "@/lib/auth/registration";
import { RegistrationForm } from "@/components/registration-form";
import { SocialSignin } from "@/components/social-signin";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { postgresConfig } from "@/lib/postgres/config";
import { createClient } from "@/lib/postgres/server";
import { authSiteOrigin } from "@/lib/auth-flow";
import { encryptionKey } from "@/lib/auth/crypto";
import { loginLimiterConfig } from "@/lib/login-limiter";
export const dynamic = "force-dynamic";
export const metadata = { title: "Register your finance workspace" };
export default async function Signup({ searchParams }: { searchParams: Promise<{ error?: string; message?:string }> }) {
  const params = await searchParams; const settings = postgresConfig();
  const available = !!settings && !!encryptionKey() && !!loginLimiterConfig() && !!authSiteOrigin();
  const user = settings && encryptionKey() ? (await (await createClient()).auth.getUser()).data.user : null;
  const received=params.message==="requested" && validRegistrationReceipt((await cookies()).get(sessionCookieOptions().secure?"__Host-o2c-registration-receipt":"o2c-registration-receipt")?.value,loginLimiterConfig()?.secret);
  const invited = !!user?.invited_at && user.purpose === "invitation";
  const errors: Record<string, string> = {
    details: "Complete all contact and company fields, use an international phone number, and acknowledge the privacy notice.",
    link: "This provider is not connected to an account yet. Open your administrator’s invitation, or sign in with your password and connect it in Account security.",
    invite: "Open a valid invitation from your workspace administrator to activate your account.",
    invalid: "Use at least 12 characters and make sure both passwords match.",
    limited: "Too many attempts. Please wait before trying again.",
  };
  return <AuthShell wide>
    <p className="eyebrow">Start with your finance team</p><h1 className="mt-3 text-3xl font-semibold tracking-tight">{invited ? "Activate your work account" : "A clearer view of your cash."}</h1>
    <p className="mt-3 leading-6 text-muted">{invited ? "Complete your account details and create a password, or activate with your work identity provider." : "Tell us about your team. We’ll use these details to review access to your O2C finance workspace."}</p>
    {!available && <p role="status" className="mt-5 rounded-lg border border-line bg-surface p-4 text-sm leading-6">Account activation is unavailable until your administrator restores the sign-in connection and protection.</p>}
    {params.error && <p role="alert" className="mt-5 rounded-lg bg-danger-soft p-4 text-danger">{errors[params.error] ?? "Account activation is unavailable. Please try again when the connection is restored."}</p>}
    {received ? <div role="status" className="mt-6 rounded-2xl border border-line bg-primary-soft p-6"><h3 className="font-semibold">Your request has been received</h3><p className="mt-3 text-sm leading-6 text-muted">An administrator will review your company and work contact details. Workspace access starts after an invitation is issued and activated.</p></div> : <>
      <div className="mt-6"><SocialSignin available={available}/></div><div className="auth-divider">{invited?"or activate with a password":"or register your team details"}</div>
      <RegistrationForm available={available} invitedEmail={invited?user!.email:undefined}/>
    </>}
    <p className="mt-6 text-center text-sm text-muted">Already have an account? <Link href="/login" className="font-semibold text-link underline underline-offset-4">Sign in</Link></p>
  </AuthShell>;
}
