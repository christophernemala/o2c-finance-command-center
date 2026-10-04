"use client";
import { useEffect, useState, type ReactNode } from "react";
export function MutationForm({ children, upload = false }: { children: ReactNode; upload?: boolean }) {
  const [pending, setPending] = useState(false);
  useEffect(() => { const reset = () => setPending(false); window.addEventListener("pageshow", reset); return () => window.removeEventListener("pageshow", reset); }, []);
  return <form action="/api/commands" method="post" encType={upload ? "multipart/form-data" : "application/x-www-form-urlencoded"} onSubmit={event => { if (pending) event.preventDefault(); else setPending(true); }} aria-busy={pending}>
    <fieldset className="min-w-0 space-y-4 border-0 p-0">{children}</fieldset>
    {pending && <p className="mt-3 text-sm text-muted" role="status">Waiting for server confirmation. Refresh the workspace to check the recorded outcome if the connection is interrupted.</p>}
  </form>;
}
