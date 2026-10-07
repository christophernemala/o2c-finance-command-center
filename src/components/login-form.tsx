"use client";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { MutationForm } from "./mutation-form";
export function LoginForm({ available, error }: { available: boolean; error?: string }) {
  const [message, setMessage] = useState(error);
  return <div className="mt-6" onInput={() => setMessage(undefined)}>
    {message && <p className="mb-5 rounded-lg bg-danger-soft p-4 text-danger" role="alert">{message}</p>}
    <MutationForm action="/api/auth"><div className="space-y-5">
      <label>Work email<input name="email" type="email" required autoComplete="username" maxLength={254} placeholder="you@company.com" disabled={!available}/></label>
      <label>Password<input name="password" type="password" required autoComplete="current-password" maxLength={256} disabled={!available}/></label>
      <button className="button w-full" disabled={!available}>Sign in <ArrowRight size={16} aria-hidden="true"/></button>
    </div></MutationForm>
  </div>;
}
