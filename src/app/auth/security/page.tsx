import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/postgres/server";
import { authenticationAssurance } from "@/lib/auth-flow";
import { AuthShell } from "@/components/auth-shell";
import { MutationForm } from "@/components/mutation-form";
export const dynamic = "force-dynamic";
export const metadata = { title: "Account security" };
export default async function Security({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const client = await createClient(); const { data: { user }, error } = await client.auth.getUser();
  if (error || !user || user.purpose !== "login") redirect("/login");
  const assurance = await authenticationAssurance(client);
  if (assurance === "mfa") redirect("/auth/verify");
  if (assurance !== "ready") throw new Error("Authentication unavailable");
  const params = await searchParams;
  const factors = await client.auth.mfa.listFactors(); if (factors.error) throw new Error("Security settings unavailable");
  const verified = factors.data.totp.some(factor => factor.status === "verified");
  // Read an existing pending factor; a GET never creates or changes security settings.
  const pending = factors.data.totp.some(factor => factor.status === "unverified") ? await client.auth.mfa.pendingFactor() : null;
  return <AuthShell><h1 className="text-3xl font-semibold">Account security</h1>
    {params.error && <p role="alert" className="mt-5 text-danger">The authenticator could not be verified. Try the current code.</p>}
    {verified ? <p role="status" className="mt-5 text-success">Authenticator verification is enabled for your account. You’ll need its code when you sign in.</p>
      : pending?.data ? <><p className="mt-5 leading-6 text-muted">In your authenticator app, add a new account using this setup key. Keep it private.</p>
        <code className="mt-4 block break-all rounded bg-surface-muted p-4">{pending.data.secret}</code>
        <p className="mt-3 text-sm text-muted">Use a time-based code with 6 digits and a 30-second period.</p>
        <MutationForm action="/api/auth/enroll"><input type="hidden" name="intent" value="verify"/><input type="hidden" name="factor" value={pending.data.id}/>
          <label className="mt-5">Authenticator code<input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required/></label><button className="button mt-5 w-full">Verify and enable</button></MutationForm></>
      : <><p className="mt-5 leading-6 text-muted">Add an authenticator app to protect your work account with a second factor.</p>
        <MutationForm action="/api/auth/enroll"><input type="hidden" name="intent" value="enroll"/><button className="button mt-5 w-full">Set up authenticator</button></MutationForm></>}
    <Link href="/" className="mt-6 block text-link">Return to workspace</Link>
  </AuthShell>;
}
