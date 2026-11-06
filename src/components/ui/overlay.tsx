"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Sheet: a native <dialog>, so focus trapping, Escape and the backdrop come from the browser.
 * Bottom sheet below 640px, centred modal above (see .ds-sheet in globals.css).
 */
export function Sheet({ trigger, title, children, triggerClassName = "button secondary" }: { trigger: ReactNode; title: string; children: ReactNode; triggerClassName?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  return <>
    <button type="button" className={triggerClassName} onClick={() => dialog.current?.showModal()}>{trigger}</button>
    <dialog ref={dialog} className="ds-sheet" aria-label={title} onClick={event => { if (event.target === dialog.current) dialog.current?.close(); }}>
      <header><h2>{title}</h2><button type="button" className="ds-sheet-close" aria-label="Close" onClick={() => dialog.current?.close()}>×</button></header>
      <div className="ds-sheet-body">{children}</div>
    </dialog>
  </>;
}

/**
 * Toast for the result of a server action (?message=…). It is announced once in a polite live region,
 * and the flag is removed from the address bar so a refresh doesn't repeat it.
 */
export function Toast({ message, tone = "info" }: { message?: string; tone?: "info" | "success" | "danger" }) {
  // Remember which message was dismissed (or timed out); a different message shows again without resetting state in an effect.
  const [hidden, setHidden] = useState<string | null>(null);
  useEffect(() => {
    if (!message) return;
    const url = new URL(window.location.href);
    if (url.searchParams.has("message")) { url.searchParams.delete("message"); url.searchParams.delete("nonce"); window.history.replaceState(null, "", url); }
    const timer = window.setTimeout(() => setHidden(message), 6000);
    return () => window.clearTimeout(timer);
  }, [message]);
  return <div className="ds-toast-region" role="status" aria-live="polite">
    {message && hidden !== message && <div className={`ds-toast ds-toast-${tone}`}><span>{message}</span><button type="button" aria-label="Dismiss" onClick={() => setHidden(message)}>×</button></div>}
  </div>;
}
