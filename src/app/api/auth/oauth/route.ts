import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseConfig } from "@/lib/supabase/config";
import { sameOrigin } from "@/lib/request-security";
import { authSiteOrigin, isAuthProvider, socialProviderAvailability } from "@/lib/auth-flow";
import { createLoginLimiter, loginLimiterConfig, trustedLoginIp, reservationCookie, sealReservation } from "@/lib/login-limiter";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request.headers)) return new NextResponse("Forbidden", { status: 403 });
  const length = Number(request.headers.get("content-length"));
  if (!Number.isInteger(length) || length < 1 || length > 1024) return new NextResponse("Request too large", { status: 413 });
  const origin = authSiteOrigin();
  if (!origin || request.headers.get("origin") !== origin) return new NextResponse("Sign-in connection unavailable", { status: 503 });
  const destination = new URL("/login", origin);
  const fail = (error: string) => { destination.searchParams.set("error", error); return NextResponse.redirect(destination, { status: 303, headers: { "Cache-Control": "no-store" } }); };
  const settings = supabaseConfig(); const limiterSettings = loginLimiterConfig();
  if (!settings || !limiterSettings) return fail("unavailable");
  try {
    const form = await request.formData();
    const provider = form.get("provider"); const intent = form.get("intent");
    if (!isAuthProvider(provider) || (intent !== "signin" && intent !== "signup")) return fail("oauth");
    const providers = await socialProviderAvailability(settings);
    if (!providers[provider]) return fail("provider");
    const attempt = await createLoginLimiter(limiterSettings).reserveIp(trustedLoginIp(request.headers));
    if (!attempt.allowed) return new NextResponse("Too many sign-in attempts. Please try again later.", { status: 429, headers: { "Retry-After": String(attempt.retryAfter), "Cache-Control": "no-store" } });
    const client = await createClient();
    const { data, error } = await client.auth.signInWithOAuth({ provider, options: {
      redirectTo: new URL("/auth/callback", origin).href, skipBrowserRedirect: true,
      ...(provider === "azure" ? { scopes: "email" } : {}),
      queryParams: { prompt: "select_account" },
    } });
    if (error || !data.url) return fail("oauth");
    const authorization = new URL(data.url);
    if (authorization.origin !== new URL(settings.url).origin || authorization.pathname !== "/auth/v1/authorize") return fail("oauth");
    const response = NextResponse.redirect(authorization, { status: 303, headers: { "Cache-Control": "no-store" } });
    response.cookies.set(reservationCookie, sealReservation(attempt.ticket, limiterSettings.secret), { httpOnly: true, secure: origin.startsWith("https:"), sameSite: "lax", path: "/", maxAge: 900 });
    return response;
  } catch { return fail("unavailable"); }
}
