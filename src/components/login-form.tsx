"use client";
import { useState } from "react";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { MutationForm } from "./mutation-form";
export function LoginForm({ available, error }: { available: boolean; error?: string }) {
  const [message, setMessage] = useState(error);
  const [showPassword, setShowPassword] = useState(false);
  return <div className="mt-6" onInput={() => setMessage(undefined)}>
    {message && <p className="mb-5 rounded-lg bg-danger-soft p-4 text-danger" role="alert">{message}</p>}
    <MutationForm action="/api/auth"><div className="space-y-5">
      <label>Work email<input name="email" type="email" required autoComplete="username" maxLength={254} placeholder="you@company.com" disabled={!available}/></label>
      <div className="login-password"><label htmlFor="login-password">Password</label><div className="login-password-input"><input id="login-password" name="password" type={showPassword ? "text" : "password"} required autoComplete="current-password" maxLength={256} disabled={!available}/><button type="button" className="login-password-toggle" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} disabled={!available} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={18} aria-hidden="true"/> : <Eye size={18} aria-hidden="true"/>}</button></div></div>
      <button className="button w-full" disabled={!available}>Sign in <ArrowRight size={16} aria-hidden="true"/></button>
    </div></MutationForm>
  </div>;
}
