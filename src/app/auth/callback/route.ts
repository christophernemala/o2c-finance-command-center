import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseConfig } from "@/lib/supabase/config";
import { authSiteOrigin, verifiedWorkspace } from "@/lib/auth-flow";
import { loginLimiterConfig, createLoginLimiter, openReservation, reservationCookie } from "@/lib/login-limiter";

export async function GET(request: NextRequest) {
  const origin = authSiteOrigin();
  if (!origin) return new NextResponse(null, { status: 303, headers: { Location: "/login?error=unavailable", "Cache-Control": "no-store" } });
  const destination = new URL("/login", origin);
  const finish = () => {
    const response = NextResponse.redirect(destination, { status: 303, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
    if (destination.pathname !== "/auth/verify") response.cookies.delete(reservationCookie);
    return response;
  };
  const code = request.nextUrl.searchParams.get("code");
  if (!supabaseConfig() || !loginLimiterConfig()) { destination.searchParams.set("error", "unavailable"); return finish(); }
  if (!code || code.length > 4096 || request.nextUrl.searchParams.has("error")) { destination.searchParams.set("error", "oauth"); return finish(); }
  const client = await createClient();
  try {
    // The cookie-backed SDK verifies PKCE before establishing a session.
    const exchange = await client.auth.exchangeCodeForSession(code);
    if (exchange.error) { destination.searchParams.set("error", "oauth"); return finish(); }
    const access = await verifiedWorkspace(client);
    if (access.state === "mfa") destination.pathname = "/auth/verify";
    else if (access.state === "authorized") {
      const settings = loginLimiterConfig()!; const ticket = openReservation(request.cookies.get(reservationCookie)?.value, settings.secret);
      if (ticket) { try { await createLoginLimiter(settings).succeed(ticket); } catch { /* Conservative expiry. */ } }
      destination.pathname = "/dashboard"; destination.searchParams.set("tenant", access.tenantId);
    } else {
      await client.auth.signOut({ scope: "local" });
      destination.searchParams.set("error", access.state === "pending" ? "pending" : "unavailable");
    }
  } catch {
    try { await client.auth.signOut({ scope: "local" }); } catch { /* No workspace access is granted on an error. */ }
    destination.pathname = "/login"; destination.searchParams.delete("tenant"); destination.searchParams.set("error", "unavailable");
  }
  return finish();
}
