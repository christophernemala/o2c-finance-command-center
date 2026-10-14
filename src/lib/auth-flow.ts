import type { AuthService } from "./auth/service";
interface WorkspaceClient { auth: AuthService; rpc(name: "workspace_access"): Promise<{ data: unknown; error: unknown }> }

export function authSiteOrigin(env: Record<string, string | undefined> = process.env): string | null {
  try {
    // Vercel injects this hostname; never derive callback origins from request headers.
    const preview = env.VERCEL === "1" && env.VERCEL_ENV === "preview";
    if (preview && !/^[a-z0-9][a-z0-9-]*\.vercel\.app$/.test(env.VERCEL_URL ?? "")) return null;
    const url = new URL(preview ? `https://${env.VERCEL_URL}` : env.AUTH_SITE_URL ?? "");
    const local = url.protocol === "http:" && url.hostname === "127.0.0.1"
      && (env.NODE_ENV === "development" || env.AUTH_LOGIN_IP_SOURCE === "loopback") && env.VERCEL !== "1";
    if ((!local && url.protocol !== "https:") || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch { return null; }
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Never derive financial access from email, provider claims, or signup metadata. */
export async function authenticationAssurance(client: Pick<WorkspaceClient, "auth">): Promise<"ready" | "mfa" | "unavailable"> {
  const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data?.currentLevel || !data.nextLevel) return "unavailable";
  return data.nextLevel === "aal2" && data.currentLevel !== "aal2" ? "mfa" : "ready";
}
export async function verifiedWorkspace(client: WorkspaceClient): Promise<{ state: "authorized"; tenantId: string } | { state: "invalid" | "pending" | "unavailable" | "mfa" }> {
  const result = await client.auth.getUser();
  if (result.error || !result.data.user || !result.data.user.email_confirmed_at || result.data.user.purpose !== "login") return { state: "invalid" };
  const assurance = await authenticationAssurance(client);
  if (assurance !== "ready") return { state: assurance };
  const membership = await client.rpc("workspace_access");
  if (membership.error || !Array.isArray(membership.data)) return { state: "unavailable" };
  const tenant = membership.data[0]?.tenant_id;
  return typeof tenant === "string" && UUID.test(tenant) ? { state: "authorized", tenantId: tenant } : { state: "pending" };
}
