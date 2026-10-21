import { SocialSignin } from "@/components/social-signin";
import Link from "next/link";
import { redirect } from "next/navigation";
import { postgresConfig } from "@/lib/postgres/config";
import { createClient } from "@/lib/postgres/server";
import { CinematicAuthShell } from "@/components/cinematic-auth-shell";
import { encryptionKey } from "@/lib/auth/crypto";
import { loginLimiterConfig } from "@/lib/login-limiter";
import { LoginForm } from "@/components/login-form";
import { authenticationAssurance } from "@/lib/auth-flow";
export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };
export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const settings = postgresConfig(); const params = await searchParams;
  const available = !!settings && !!encryptionKey() && !!loginLimiterConfig();
  if (settings && encryptionKey()) { const client = await createClient(); const { data: { user } } = await client.auth.getUser(); if (user) redirect(user.purpose === "invitation" ? "/signup" : await authenticationAssurance(client) === "mfa" ? "/auth/verify" : "/"); }
  const errors: Record<string, string> = {
    invalid: "Incorrect email or password.",
    oauth: "Provider sign-in could not be completed. Use a connected account or open your workspace invitation first.",
    pending: "Your identity is verified, but workspace access still needs administrator approval.",
    limited: "Too many sign-in attempts. Please wait before trying again.",
  };
  return <CinematicAuthShell>
    <h2 className="cinematic-welcome">Welcome back</h2>
    {!available && <div className="mt-5 rounded-lg border border-line bg-surface p-4" role="status"><p className="font-semibold">{settings ? "Sign-in protection unavailable" : "Workspace connection unavailable"}</p><p className="mt-2 text-sm leading-6 text-muted">{settings ? "Your administrator needs to restore sign-in protection before access is available." : "Your administrator needs to connect the finance workspace and sign-in protection before access is available."}</p></div>}
    {params.message === "activated" && <p role="status" className="mt-5 rounded-lg bg-success-soft p-4 text-success">Your account is ready. Sign in to continue.</p>}
    <div className="mt-6"><SocialSignin available={available}/></div><div className="auth-divider">or use your work email</div>
    <LoginForm key={params.error ?? "ready"} available={available} error={params.error ? errors[params.error] ?? "Sign-in is unavailable. Try again when the connection is restored." : undefined}/>
    <p className="mt-5 text-center text-sm"><Link href="/login/code" className="font-semibold text-link underline underline-offset-4">Email me a sign-in code</Link></p>
    <p className="mt-6 text-center text-sm text-muted">New to the workspace? <Link href="/signup" className="font-semibold text-link underline underline-offset-4">Sign up</Link></p>
    <p className="mt-4 text-center text-xs leading-5 text-muted">Workspace access is granted by your administrator.<br/>Contact them for an invitation or account recovery.</p>
  </CinematicAuthShell>;
}
