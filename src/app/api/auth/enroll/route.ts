import { NextRequest, NextResponse } from "next/server";
import { sameOrigin, boundedFormRequest } from "@/lib/request-security";
import { createClient } from "@/lib/postgres/server";
import { authenticationAssurance } from "@/lib/auth-flow";
import { createLoginLimiter, loginLimiterConfig, trustedLoginIp } from "@/lib/login-limiter";
export async function POST(request: NextRequest) {
  if (!sameOrigin(request.headers)) return new NextResponse("Forbidden", { status: 403 });
  const body = await boundedFormRequest(request, 1024); if (body instanceof Response) return body;
  const destination = new URL("/auth/security", request.headers.get("origin")!);
  const finish = () => NextResponse.redirect(destination, { status: 303, headers: { "Cache-Control": "no-store" } });
  try {
    const client = await createClient(); const { data: { user }, error } = await client.auth.getUser();
    if (error || !user || user.purpose !== "login") { destination.pathname = "/login"; return finish(); }
    if (await authenticationAssurance(client) !== "ready") { destination.pathname = "/auth/verify"; return finish(); }
    const settings = loginLimiterConfig(); if (!settings) throw new Error("Protection unavailable");
    const attempt = await createLoginLimiter(settings).reserve(user.email, trustedLoginIp(request.headers));
    if (!attempt.allowed) return new NextResponse("Too many attempts", { status: 429, headers: { "Retry-After": String(attempt.retryAfter), "Cache-Control": "no-store" } });
    const form = await body.formData();
    if (form.get("intent") === "enroll") {
      const factor = await client.auth.mfa.enroll(); if (factor.error) throw factor.error;
    } else if (form.get("intent") === "verify") {
      const code = form.get("code"); const factorId = form.get("factor");
      if (typeof code !== "string" || !/^\d{6}$/.test(code) || typeof factorId !== "string") throw new Error("Invalid code");
      const verified = await client.auth.mfa.challengeAndVerify({ code, factorId, enrollment: true }); if (verified.error) throw verified.error;
      destination.searchParams.set("message", "enabled");
    } else throw new Error("Invalid request");
    try { await createLoginLimiter(settings).succeed(attempt.ticket); } catch { /* Conservative expiry. */ }
  } catch { destination.searchParams.set("error", "invalid"); }
  return finish();
}
