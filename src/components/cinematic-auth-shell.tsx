import Link from "next/link";
import { getImageProps } from "next/image";
import type { ReactNode } from "react";
import { CinematicParticles } from "./cinematic-particles";

export function CinematicAuthShell({ children }: { children: ReactNode }) {
  const { props } = getImageProps({ src: "/images/o2c-binary-profile.webp", alt: "", width: 1122, height: 1402, sizes: "(min-width: 960px) 55vw, 100vw", priority: true });
  return <main id="main" className="cinematic-auth">
    <div className="cinematic-art">
      <img {...props} alt="" className="cinematic-profile" />
      <CinematicParticles />
      <p className="cinematic-art-caption">Intelligence in motion.<span>Human judgment at the center.</span></p>
    </div>
    <section className="cinematic-form-side" aria-label="Workspace sign in">
      <div className="cinematic-card">
        <header className="cinematic-brand"><div aria-label="O2C" className="cinematic-wordmark">O<span>2</span>C</div><p>Finance command center</p></header>
        <h1>Your finance team,<br />working in sync.</h1>
        <p className="cinematic-intro">Streamline receivables and cash matching, with AI agents to prepare proposals for your review.</p>
        {children}
      </div>
      <p className="cinematic-footer">Finance operations with a clear audit trail. · <Link href="/privacy">Privacy</Link></p>
    </section>
  </main>;
}
