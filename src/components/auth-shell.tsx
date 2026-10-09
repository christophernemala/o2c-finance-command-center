import type { ReactNode } from "react";
import { Layers3, ShieldCheck } from "lucide-react";

export function AuthShell({ children }: { children: ReactNode }) {
  return <main id="main" className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
    <section className="login-art relative flex flex-col justify-between overflow-hidden px-6 py-6 sm:px-12 lg:px-16 lg:py-10">
      <header className="auth-brand relative z-10 w-fit max-w-full text-ink" aria-label="O2C finance command center">
        <div className="flex items-center gap-4"><span className="auth-mark relative inline-flex shrink-0 rounded-2xl bg-surface p-3 text-link"><Layers3 size={28} aria-hidden="true"/></span><div className="min-w-0"><p className="auth-wordmark text-4xl leading-none font-black tracking-tighter">O2C</p><p className="mt-2 text-[10px] leading-5 font-medium uppercase tracking-[.2em] text-muted">Finance command center</p></div></div>
      </header>
      <div className="relative my-12 hidden max-w-lg lg:block"><p className="mb-5 text-xs font-semibold uppercase tracking-[.2em] text-link">Your financial operations, connected</p><h1 className="text-4xl leading-tight font-semibold tracking-tight xl:text-5xl">Clarity for every<br/>receivable.<br/><span className="text-link">Control at every step.</span></h1><p className="mt-6 max-w-md text-base leading-7 text-muted">One workspace to investigate balances, review cash application, and make accountable financial decisions.</p>
        <div className="mt-10 space-y-3 border-t border-line pt-8">{["Tenant-scoped financial data", "Independent approval before posting", "Exact AED amounts and traceable actions"].map(text => <p className="auth-feature flex items-center gap-3 rounded-2xl border border-line bg-surface/70 p-4 text-sm text-ink" key={text}><ShieldCheck size={20} className="shrink-0 text-success" aria-hidden="true"/>{text}</p>)}</div>
      </div>
      <p className="relative hidden text-xs text-muted lg:block">Finance operations with a clear audit trail — Built for finance teams</p>
    </section>
    <section className="flex flex-col bg-canvas px-4 py-6 sm:px-10 lg:px-12 lg:py-10"><div className="auth-card mx-auto my-auto w-full max-w-md px-6 py-8 sm:p-10">{children}</div><p className="mt-6 text-center text-xs text-muted">Finance operations with a clear audit trail.</p></section>
  </main>;
}
