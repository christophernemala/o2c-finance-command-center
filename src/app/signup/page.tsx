import Link from "next/link";
import { ArrowRight, UserRoundPlus } from "lucide-react";
import { AuthShell } from "@/components/auth-shell";
import { AuthProviders } from "@/components/auth-providers";
import { supabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { authSiteOrigin, socialProviderAvailability } from "@/lib/auth-flow";
import { loginLimiterConfig } from "@/lib/login-limiter";
export const dynamic = "force-dynamic";
export default async function Signup({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams; const settings = supabaseConfig();
  const available = !!settings && !!loginLimiterConfig() && !!authSiteOrigin();
  const user = settings ? (await (await createClient()).auth.getUser()).data.user : null;
  const invited = !!user?.invited_at && !!user.email_confirmed_at;
  const providers = await socialProviderAvailability(settings);
  const errors: Record<string, string> = {
    invite: "Open a valid invitation from your workspace administrator to activate your account.",
    invalid: "Use at least 12 characters and make sure both passwords match.",
    limited: "Too many attempts. Please wait before trying again.",
  };
  return <AuthShell>
    <div className="mb-5 inline-flex rounded-xl bg-primary-soft p-3 text-primary"><UserRoundPlus size={24} aria-hidden="true"/></div><h2 className="text-3xl font-semibold tracking-tight">{invited ? "Create your password" : "Join your workspace"}</h2>
    <p className="mt-3 leading-6 text-muted">{invited ? "Finish activating your invited work account." : "Sign up with your invited work identity. Your administrator assigns your workspace access."}</p>
    {!available && <p role="status" className="mt-5 rounded-lg border border-line bg-surface p-4 text-sm leading-6">Account activation is unavailable until your administrator restores the sign-in connection and protection.</p>}
    {params.error && <p role="alert" className="mt-5 rounded-lg bg-danger-soft p-4 text-danger">{errors[params.error] ?? "Account activation is unavailable. Please try again when the connection is restored."}</p>}
    {invited ? <form method="post" action="/api/auth/signup" className="mt-6 space-y-5"><p className="break-words text-sm text-muted">Invited account: <span className="font-medium text-ink">{user!.email}</span></p><label>New password<input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={256} disabled={!available}/></label><label>Confirm password<input name="confirm" type="password" autoComplete="new-password" required minLength={12} maxLength={256} disabled={!available}/></label><p className="text-xs text-muted">Use at least 12 characters.</p><button className="button w-full" disabled={!available}>Activate account <ArrowRight size={16} aria-hidden="true"/></button></form> : <>
      <AuthProviders available={available} providers={providers} intent="signup"/>
      <div className="mt-6 rounded-xl border border-line bg-surface p-5"><h3 className="font-semibold">Sign up with work email</h3><p className="mt-2 text-sm leading-6 text-muted">Open the invitation sent to your work email to verify your identity and create your password. If you have not received one, contact your workspace administrator.</p></div>
    </>}
    <p className="mt-6 text-center text-sm text-muted">Already have an account? <Link href="/login" className="font-semibold text-link underline underline-offset-4">Sign in</Link></p>
  </AuthShell>;
}
