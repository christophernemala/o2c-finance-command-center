import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { redirect } from "next/navigation";
import { supabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { AuthShell } from "@/components/auth-shell";
import { AuthProviders } from "@/components/auth-providers";
import { authSiteOrigin, socialProviderAvailability } from "@/lib/auth-flow";
import { loginLimiterConfig } from "@/lib/login-limiter";
import { LoginForm } from "@/components/login-form";
import { authenticationAssurance } from "@/lib/auth-flow";
export const dynamic = "force-dynamic";
export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const settings = supabaseConfig(); const params = await searchParams;
  const available = !!settings && !!loginLimiterConfig();
  if (settings) { const client = await createClient(); const { data: { user } } = await client.auth.getUser(); if (user) redirect(await authenticationAssurance(client) === "mfa" ? "/auth/verify" : "/"); }
  const providers = await socialProviderAvailability(settings);
  const errors: Record<string, string> = {
    invalid: "Incorrect email or password.", oauth: "We could not complete sign-in. Please try again.",
    pending: "Your identity is verified, but workspace access still needs administrator approval.",
    limited: "Too many sign-in attempts. Please wait before trying again.",
    provider: "This sign-in provider is not available yet. Contact your workspace administrator.",
  };
  return <AuthShell>
    <div className="mb-5 inline-flex rounded-xl bg-primary-soft p-3 text-primary"><LockKeyhole size={24} aria-hidden="true"/></div><h2 className="text-3xl font-semibold tracking-tight">Welcome back</h2><p className="mt-3 leading-6 text-muted">Sign in with your invited work account to access your financial workspace.</p>
    {!available && <div className="mt-5 rounded-lg border border-line bg-surface p-4" role="status"><p className="font-semibold">{settings ? "Sign-in protection unavailable" : "Workspace connection unavailable"}</p><p className="mt-2 text-sm leading-6 text-muted">{settings ? "Your administrator needs to restore sign-in protection before access is available." : "Your administrator needs to connect the finance workspace and sign-in protection before access is available."}</p></div>}
    {params.message === "activated" && <p role="status" className="mt-5 rounded-lg bg-success-soft p-4 text-success">Your account is ready. Sign in to continue.</p>}
    <LoginForm key={params.error ?? "ready"} available={available} error={params.error ? errors[params.error] ?? "Sign-in is unavailable. Try again when the connection is restored." : undefined}/>
    <div className="my-6 flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-line"/><span>or continue with</span><span className="h-px flex-1 bg-line"/></div>
    <AuthProviders available={available && !!authSiteOrigin()} providers={providers}/>
    <p className="mt-6 text-center text-sm text-muted">New to the workspace? <Link href="/signup" className="font-semibold text-link underline underline-offset-4">Sign up</Link></p>
    <p className="mt-4 text-center text-xs leading-5 text-muted">Workspace access is granted by your administrator.<br/>Contact them for an invitation or account recovery.</p>
  </AuthShell>;
}
