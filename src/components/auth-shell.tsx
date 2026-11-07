import Link from "next/link";
import { getImageProps } from "next/image";
import type { ReactNode } from "react";
import { Layers3, Lock } from "lucide-react";

import { authScenes, type AuthScene } from "./auth-scenes";

const BLANK = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

function Brand({ inverse = false }: { inverse?: boolean }) {
  return <div className={`auth-brand flex items-center gap-3 ${inverse ? "text-white" : "text-ink"}`} aria-label="O2C finance command center">
    <span className={`inline-flex shrink-0 rounded-[10px] p-2 ${inverse ? "bg-white/12 text-white ring-1 ring-white/25" : "bg-primary-soft text-primary"}`}><Layers3 size={20} aria-hidden="true"/></span>
    <span className="leading-tight"><span className="auth-wordmark block text-lg">O2C</span><span className={`block text-[10px] font-medium uppercase tracking-[.18em] ${inverse ? "text-white/70" : "text-muted"}`}>Finance command center</span></span>
  </div>;
}

/** Shared layout for every sign-in screen: a decorative photo panel (desktop only) and the form card. */
export function AuthShell({ children, wide = false, scene = "signin" }: { children: ReactNode; wide?: boolean; scene?: AuthScene }) {
  const art = authScenes[scene];
  const { props: photo } = getImageProps({ src: art.image, alt: "", fill: true, loading: "eager", sizes: "58vw" }); // no priority: its preload link would ignore the desktop-only media query
  return <main id="main" className="auth-layout">
    <section className="auth-photo" aria-hidden="true">
      {/* Only the desktop <source> has real URLs; below 1024 px the 1×1 placeholder is used, so phones never download the photo. */}
      <picture><source media="(min-width: 1024px)" srcSet={photo.srcSet} sizes={photo.sizes}/><img {...photo} src={BLANK} srcSet={undefined} sizes={undefined} alt="" className="auth-photo-image" style={{ ...photo.style, objectPosition: art.position }}/></picture>
      <div className="auth-photo-shade"/>
      <div className="auth-photo-content">
        <Brand inverse/>
        <div className="auth-photo-copy"><p className="auth-photo-eyebrow">{art.eyebrow}</p><p className="auth-photo-headline">{art.headline}</p><p className="auth-photo-body">{art.body}</p></div>
      </div>
    </section>
    <section className="auth-form-side">
      <div className="auth-mobile-brand"><Brand/></div>
      <div className={`auth-card ${wide ? "auth-card-wide" : ""}`}>{children}</div>
      <p className="auth-trust"><Lock size={12} aria-hidden="true"/> Authenticator MFA · Single-use email codes · <Link href="/privacy" className="underline underline-offset-2">Privacy</Link></p>
    </section>
  </main>;
}
