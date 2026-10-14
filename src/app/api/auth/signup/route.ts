import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/postgres/server";
import { postgresConfig } from "@/lib/postgres/config";
import { sameOrigin, boundedFormRequest } from "@/lib/request-security";
import { authSiteOrigin } from "@/lib/auth-flow";
import { signupPasswordSchema } from "@/lib/validation";
import { createLoginLimiter, loginLimiterConfig, trustedLoginIp } from "@/lib/login-limiter";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request.headers)) return new NextResponse("Forbidden", { status: 403 });
  const body = await boundedFormRequest(request, 4096);
  if (body instanceof Response) return body;
  const origin = authSiteOrigin();
  if (!origin || request.headers.get("origin") !== origin) return new NextResponse("Sign-in connection unavailable", { status: 503 });
  const destination = new URL("/signup", origin);
  const finish = () => NextResponse.redirect(destination, { status: 303, headers: { "Cache-Control": "no-store" } });
  const limiterSettings = loginLimiterConfig();
  if (!postgresConfig() || !limiterSettings) { destination.searchParams.set("error", "unavailable"); return finish(); }
  try {
    const form = await body.formData();
    const password = signupPasswordSchema.safeParse({ password: form.get("password"), confirm: form.get("confirm") });
    if (!password.success) { destination.searchParams.set("error", "invalid"); return finish(); }
    const client = await createClient();
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user?.invited_at || user.purpose !== "invitation" || !user.email) { destination.searchParams.set("error", "invite"); return finish(); }
    const limiter = createLoginLimiter(limiterSettings);
    const attempt = await limiter.reserve(user.email, trustedLoginIp(request.headers));
    if (!attempt.allowed) return new NextResponse("Too many activation attempts. Please try again later.", { status: 429, headers: { "Retry-After": String(attempt.retryAfter), "Cache-Control": "no-store" } });
    const result = await client.auth.updateUser({ password: password.data.password });
    if (result.error) { destination.searchParams.set("error", "invalid"); return finish(); }
    try { await limiter.succeed(attempt.ticket); } catch { /* Reservation expires conservatively. */ }
    destination.pathname = "/login";
    destination.searchParams.set("message", "activated");
  } catch { destination.searchParams.set("error", "unavailable"); }
  return finish();
}
