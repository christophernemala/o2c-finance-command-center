import Link from "next/link";
import { getImageProps } from "next/image";
import type { ReactNode } from "react";
import { Layers3, ShieldCheck } from "lucide-react";

import { AuthSceneDisclosure } from "./auth-scene-disclosure";

export function AuthShell({ children, wide=false }: { children: ReactNode; wide?: boolean }) {
  const { props: robotImageProps } = getImageProps({ src: "/images/finance-robot.png", alt: "", width: 2048, height: 1593, sizes: "(min-width: 1024px) 44vw, 100vw" });
  return <main id="main" className={`auth-layout ${wide?"auth-layout-wide":""}`}>
    <section className="login-art relative flex flex-col justify-between overflow-hidden px-6 py-6 sm:px-12 lg:px-16 lg:py-10">
      <header className="auth-brand relative z-10 w-fit max-w-full text-ink" aria-label="O2C finance command center">
        <div className="flex items-center gap-4"><span className="auth-mark relative inline-flex shrink-0 rounded-2xl bg-surface p-3 text-link"><Layers3 size={28} aria-hidden="true"/></span><div className="min-w-0"><p className="auth-wordmark text-4xl leading-none font-black tracking-tighter">O2C</p><p className="mt-2 text-[10px] leading-5 font-medium uppercase tracking-[.2em] text-muted">Finance command center</p></div></div>
      </header>
      <div className="auth-story relative"><p className="eyebrow">Receivables. Cash. Human judgment.</p><h2 className="auth-display mt-4">Your finance team,<br/><span className="text-link">working in sync.</span></h2><p className="mt-4 max-w-md text-base leading-7 text-muted">O2C brings receivables, cash matching, collection follow-ups and finance agents into one accountable workspace.</p><figure className="auth-hero-media"><img {...robotImageProps} alt="" className="auth-robot-image"/><figcaption>AI assistance. Human review.</figcaption></figure><AuthSceneDisclosure/>
        <div className="auth-capabilities">{["Investigate balances and overdue accounts", "Prepare collection drafts and cash proposals", "Review independently before sending or posting"].map(text=><p key={text}><ShieldCheck size={17} className="text-link" aria-hidden="true"/>{text}</p>)}</div>
      </div>
      <p className="relative hidden text-xs text-muted lg:block">Finance operations with a clear audit trail — Built for finance teams</p>
    </section>
    <section className="auth-form-side flex flex-col px-4 py-6 sm:px-8 lg:py-10"><div className={`auth-card mx-auto my-auto w-full ${wide?"max-w-2xl":"max-w-lg"} px-6 py-8 sm:p-9`}>{children}</div><p className="mt-6 text-center text-xs text-muted">Finance operations with a clear audit trail. · <Link href="/privacy" className="underline underline-offset-2">Privacy</Link></p></section>
  </main>;
}
