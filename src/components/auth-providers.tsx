import type { AuthProvider } from "@/lib/auth-flow";

function ProviderIcon({ provider }: { provider: AuthProvider }) {
  if (provider === "azure") return <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path fill="#f25022" d="M0 0h9v9H0z"/><path fill="#7fba00" d="M11 0h9v9h-9z"/><path fill="#00a4ef" d="M0 11h9v9H0z"/><path fill="#ffb900" d="M11 11h9v9h-9z"/></svg>;
  return <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285f4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z"/><path fill="#34a853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.97-3.38.97-2.6 0-4.81-1.76-5.6-4.13H3.06v2.59A10 10 0 0 0 12 22Z"/><path fill="#fbbc05" d="M6.4 13.92A6 6 0 0 1 6.08 12c0-.67.11-1.31.32-1.92V7.49H3.06A10 10 0 0 0 2 12c0 1.61.38 3.14 1.06 4.51l3.34-2.59Z"/><path fill="#ea4335" d="M12 5.95c1.47 0 2.79.51 3.82 1.51l2.87-2.87A9.61 9.61 0 0 0 12 2a10 10 0 0 0-8.94 5.49l3.34 2.59c.79-2.37 3-4.13 5.6-4.13Z"/></svg>;
}
export function AuthProviders({ available, providers, intent = "signin" }: { available: boolean; providers: Record<AuthProvider, boolean>; intent?: "signin" | "signup" }) {
  return <div className="mt-6 space-y-3">
    {(["google", "azure"] as const).map(provider => {
      const name = provider === "google" ? "Google" : "Microsoft";
      return <form key={provider} method="post" action="/api/auth/oauth"><input type="hidden" name="provider" value={provider}/><input type="hidden" name="intent" value={intent}/><button className="button secondary w-full" disabled={!available || !providers[provider]} aria-describedby={!providers[provider] ? "provider-availability" : undefined}><ProviderIcon provider={provider}/>Continue with {name}</button></form>;
    })}
    {(!providers.google || !providers.azure) && <p id="provider-availability" className="text-xs leading-5 text-muted">{!providers.google && !providers.azure ? "Google and Microsoft sign-in" : !providers.google ? "Google sign-in" : "Microsoft sign-in"} will be available once your workspace administrator connects {(!providers.google && !providers.azure) ? "these providers" : "this provider"}.</p>}
  </div>;
}
