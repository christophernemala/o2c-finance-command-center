import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/postgres/server";
import { sameOrigin, boundedFormRequest } from "@/lib/request-security";
import { verifiedWorkspace } from "@/lib/auth-flow";
import { createLoginLimiter, loginLimiterConfig, trustedLoginIp, openReservation, reservationCookie } from "@/lib/login-limiter";
export async function POST(request: NextRequest) {
  if (!sameOrigin(request.headers)) return new NextResponse("Forbidden", { status: 403 });
  const body = await boundedFormRequest(request, 1024);
  if (body instanceof Response) return body;
  const destination = new URL("/auth/verify", request.headers.get("origin")!);
  const finish = () => {
    const response = NextResponse.redirect(destination, { status: 303, headers: { "Cache-Control": "no-store" } });
    if (destination.pathname !== "/auth/verify") response.cookies.delete(reservationCookie);
    return response;
  };
  try {
    const settings = loginLimiterConfig(); if (!settings) throw new Error("Protection unavailable");
    const client = await createClient(); const { data: { user }, error } = await client.auth.getUser();
    if (error || !user?.email || !user.email_confirmed_at || user.purpose !== "login") { destination.pathname = "/login"; return finish(); }
    const form = await body.formData(); const code = form.get("code"); const factor = form.get("factor");
    if (typeof code !== "string" || !/^[0-9]{6}$/.test(code) || typeof factor !== "string") throw new Error("Invalid code");
    const factors = await client.auth.mfa.listFactors();
    if (factors.error || !factors.data.totp.some(row => row.id === factor && row.status === "verified")) throw new Error("Invalid factor");
    const limiter = createLoginLimiter(settings); const attempt = await limiter.reserve(user.email, trustedLoginIp(request.headers));
    if (!attempt.allowed) return new NextResponse("Too many verification attempts. Try again later.", { status: 429, headers: { "Retry-After": String(attempt.retryAfter), "Cache-Control": "no-store" } });
    const verification = await client.auth.mfa.challengeAndVerify({ factorId: factor, code });
    if (verification.error) throw new Error("Invalid code");
    const access = await verifiedWorkspace(client);
    if (access.state !== "authorized") { await client.auth.signOut({ scope: "local" }); destination.pathname = "/login"; destination.searchParams.set("error", "invalid"); return finish(); }
    try { await limiter.succeed(attempt.ticket); } catch { /* Conservative reservation expiry. */ }
    const original = openReservation(request.cookies.get(reservationCookie)?.value, settings.secret);
    if (original) { try { await limiter.succeed(original); } catch { /* Conservative expiry. */ } }
    destination.pathname = "/dashboard"; destination.searchParams.set("tenant", access.tenantId);
  } catch { destination.searchParams.set("error", "invalid"); }
  return finish();
}
