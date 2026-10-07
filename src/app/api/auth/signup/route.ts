import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseConfig } from "@/lib/supabase/config";
import { sameOrigin } from "@/lib/request-security";
import { authSiteOrigin, verifiedWorkspace } from "@/lib/auth-flow";
import { signupPasswordSchema } from "@/lib/validation";
import { createLoginLimiter, loginLimiterConfig, trustedLoginIp } from "@/lib/login-limiter";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request.headers)) return new NextResponse("Forbidden", { status: 403 });
  const length = Number(request.headers.get("content-length"));
  if (!Number.isInteger(length) || length < 1 || length > 4096) return new NextResponse("Request too large", { status: 413 });
  const origin = authSiteOrigin();
  if (!origin || request.headers.get("origin") !== origin) return new NextResponse("Sign-in connection unavailable", { status: 503 });
  const destination = new URL("/signup", origin);
  const finish = () => NextResponse.redirect(destination, { status: 303, headers: { "Cache-Control": "no-store" } });
  const limiterSettings = loginLimiterConfig();
  if (!supabaseConfig() || !limiterSettings) { destination.searchParams.set("error", "unavailable"); return finish(); }
  try {
    const form = await request.formData();
    const password = signupPasswordSchema.safeParse({ password: form.get("password"), confirm: form.get("confirm") });
    if (!password.success) { destination.searchParams.set("error", "invalid"); return finish(); }
    const client = await createClient();
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user?.invited_at || !user.email_confirmed_at || !user.email) { destination.searchParams.set("error", "invite"); return finish(); }
    const limiter = createLoginLimiter(limiterSettings);
    const attempt = await limiter.reserve(user.email, trustedLoginIp(request.headers));
    if (!attempt.allowed) return new NextResponse("Too many activation attempts. Please try again later.", { status: 429, headers: { "Retry-After": String(attempt.retryAfter), "Cache-Control": "no-store" } });
    const result = await client.auth.updateUser({ password: password.data.password });
    if (result.error) { destination.searchParams.set("error", "invalid"); return finish(); }
    const access = await verifiedWorkspace(client);
    const signout = await client.auth.signOut({ scope: "local" });
    if (signout.error) throw new Error("Session cleanup unavailable");
    destination.pathname = "/login";
    if (access.state === "authorized") {
      try { await limiter.succeed(attempt.ticket); } catch { /* Reservation expires conservatively. */ }
      destination.searchParams.set("message", "activated");
    } else destination.searchParams.set("error", access.state === "pending" ? "pending" : "unavailable");
  } catch { destination.searchParams.set("error", "unavailable"); }
  return finish();
}
