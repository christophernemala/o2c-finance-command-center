"use client";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

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
 * Toast for the result of a server action (?message=…&nonce=…). It is announced once in a polite live region,
 * and the flags are removed from the address bar so a refresh doesn't repeat it.
 * `id` names this occurrence (the action's nonce), so the same text returning later shows again.
 * Danger toasts stay until dismissed, so recovery instructions can be read in full; others hide after 6 s.
 * The live region is rendered empty first and filled after hydration, so screen readers announce the change.
 */
const subscribeNever = () => () => {};
export function Toast({ message, id, tone = "info" }: { message?: string; id?: string; tone?: "info" | "success" | "danger" }) {
  const occurrence = message ? `${id ?? ""}\u0000${message}` : null;
  // Remember which occurrence was dismissed (or timed out); a new one shows without resetting state in an effect.
  const [hidden, setHidden] = useState<string | null>(null);
  const hydrated = useSyncExternalStore(subscribeNever, () => true, () => false);
  useEffect(() => {
    if (!occurrence) return;
    const url = new URL(window.location.href);
    if (url.searchParams.has("message")) { url.searchParams.delete("message"); url.searchParams.delete("nonce"); window.history.replaceState(null, "", url); }
    if (tone === "danger") return;
    const timer = window.setTimeout(() => setHidden(occurrence), 6000);
    return () => window.clearTimeout(timer);
  }, [occurrence, tone]);
  return <div className="ds-toast-region" role="status" aria-live="polite">
    {hydrated && occurrence && hidden !== occurrence && <div className={`ds-toast ds-toast-${tone}`}><span>{message}</span><button type="button" aria-label="Dismiss" onClick={() => setHidden(occurrence)}>×</button></div>}
  </div>;
}
