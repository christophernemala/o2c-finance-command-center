import { ArrowRight, Layers3, LockKeyhole, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { supabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { ThemeButton } from "@/components/theme-button";
import { loginLimiterConfig } from "@/lib/login-limiter";
export const dynamic = "force-dynamic";
export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const settings = supabaseConfig(); const params = await searchParams;
  const available = !!settings && !!loginLimiterConfig();
  if (settings) { const client = await createClient(); const { data: { user } } = await client.auth.getUser(); if (user) redirect("/"); }
  return <main id="main" className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
    <section className="login-art relative flex flex-col justify-between overflow-hidden px-8 py-10 sm:px-16 lg:px-20">
      <div className="relative flex items-center gap-3 text-xl font-semibold"><Layers3 size={26}/><span>o2c<span className="ml-2 text-sm font-normal text-slate-300">finance command center</span></span></div>
      <div className="relative my-16 max-w-lg"><p className="mb-5 text-xs font-semibold uppercase tracking-[.2em] text-violet-200">Your financial operations, connected</p><h1 className="text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">Clarity for every<br/>receivable.<br/><span className="text-violet-200">Control at every step.</span></h1><p className="mt-6 max-w-md text-base leading-7 text-slate-300">One workspace to investigate balances, review cash application, and make accountable financial decisions.</p>
      <div className="mt-10 space-y-5 border-t border-white/20 pt-8">{["Tenant-scoped financial data", "Independent approval before posting", "Exact AED amounts and traceable actions"].map(text => <p className="flex items-center gap-3 text-sm text-slate-200" key={text}><ShieldCheck size={18} className="text-violet-200"/>{text}</p>)}</div></div>
      <p className="relative text-xs text-slate-300">Built for finance teams · Christopher Nemala · Dubai</p>
    </section>
    <section className="flex flex-col bg-canvas px-8 py-10 sm:px-16"><div className="flex justify-end"><ThemeButton/></div><div className="mx-auto my-auto w-full max-w-sm py-16">
      <div className="mb-6 inline-flex rounded-xl bg-primary-soft p-3 text-primary"><LockKeyhole size={24}/></div><h2 className="text-3xl font-semibold tracking-tight">Welcome back</h2><p className="mt-3 leading-6 text-muted">Sign in with your invited work account to access your financial workspace.</p>
      {!available && <div className="mt-6 rounded-lg border border-line bg-surface p-4" role="status"><p className="font-semibold">Workspace connection unavailable</p><p className="mt-2 text-sm leading-6 text-muted">Your administrator needs to connect the finance workspace and sign-in protection before access is available.</p></div>}
      {params.error && <p className="mt-6 rounded-lg bg-danger-soft p-4 text-danger" role="alert">{params.error === "invalid" ? "Incorrect email or password." : "Sign-in is unavailable. Try again when the connection is restored."}</p>}
      <form method="post" action="/api/auth" className="mt-8 space-y-5"><label>Work email<input name="email" type="email" required autoComplete="username" maxLength={254} placeholder="you@company.com" disabled={!available}/></label><label>Password<input name="password" type="password" required autoComplete="current-password" maxLength={256} disabled={!available}/></label><button className="button w-full" disabled={!available}>Sign in <ArrowRight size={16}/></button></form>
      <p className="mt-6 text-center text-xs leading-5 text-muted">Access is granted by your workspace administrator.<br/>Contact them for an invitation or account recovery.</p>
    </div><p className="text-center text-xs text-muted">Finance operations with a clear audit trail.</p></section>
  </main>;
}
