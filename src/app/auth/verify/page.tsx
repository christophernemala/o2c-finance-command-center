import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { createClient } from "@/lib/supabase/server";
import { verifiedWorkspace } from "@/lib/auth-flow";
import { MutationForm } from "@/components/mutation-form";
export const dynamic = "force-dynamic";
export default async function Verify({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const client = await createClient(); const { data: { user } } = await client.auth.getUser();
  if (!user) redirect("/login");
  const access = await verifiedWorkspace(client);
  if (access.state === "authorized") redirect(`/dashboard?tenant=${access.tenantId}`);
  const factors = await client.auth.mfa.listFactors();
  const factor = factors.data?.totp.find(row => row.status === "verified");
  const params = await searchParams;
  return <AuthShell><h1 className="text-3xl font-semibold">Verify your sign-in</h1>
    <p className="mt-3 leading-6 text-muted">Enter the current six-digit code from your enrolled authenticator app. Codes are verified by your identity provider.</p>
    {params.error && <p role="alert" className="mt-5 rounded-lg bg-danger-soft p-4 text-danger">The code could not be verified. Use the current code and try again.</p>}
    {factor ? <MutationForm action="/api/auth/mfa"><div className="mt-6 space-y-5"><input type="hidden" name="factor" value={factor.id}/>
      <label>Authenticator code<input name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required className="text-center text-2xl tracking-[.35em]" aria-describedby="code-guidance"/></label>
      <p id="code-guidance" className="text-sm text-muted">Use your authenticator’s countdown. If a code expires, enter its next code. Authenticator codes are not sent by email.</p>
      <button className="button w-full">Verify and continue</button></div></MutationForm>
      : <p role="status" className="mt-5 text-warning">An enrolled authenticator is unavailable. Contact your administrator to recover your second factor.</p>}
    <form method="post" action="/api/auth" className="mt-5"><input type="hidden" name="intent" value="logout"/><button className="button secondary w-full">Back to login</button></form>
  </AuthShell>;
}
