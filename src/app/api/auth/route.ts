import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseConfig } from "@/lib/supabase/config";
import { sameOrigin } from "@/lib/request-security";
import { createLoginLimiter, loginLimiterConfig, trustedLoginIp, reservationCookie, sealReservation } from "@/lib/login-limiter";
import { credentialsSchema } from "@/lib/validation";
import { authenticationAssurance } from "@/lib/auth-flow";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function POST(request: NextRequest) {
  if (!sameOrigin(request.headers)) return new NextResponse("Forbidden", { status: 403 });
  const length = Number(request.headers.get("content-length"));
  if (!Number.isInteger(length) || length < 1 || length > 4096) return new NextResponse("Request too large", { status: 413 });
  const destination = new URL("/login", request.headers.get("origin")!);
  if (!supabaseConfig()) { destination.searchParams.set("error", "unavailable"); return NextResponse.redirect(destination, 303); }
  let form: FormData; let client: Awaited<ReturnType<typeof createClient>>;
  try { form = await request.formData(); client = await createClient(); }
  catch { destination.searchParams.set("error", "invalid"); return NextResponse.redirect(destination, { status: 303, headers: { "Cache-Control": "no-store" } }); }
  if (form.get("intent") === "logout") {
    try { const result = await client.auth.signOut(); if (result.error) destination.searchParams.set("error", "unavailable"); }
    catch { destination.searchParams.set("error", "unavailable"); }
  } else {
    const credentials = credentialsSchema.safeParse({ email: form.get("email"), password: form.get("password") });
    if (!credentials.success) { destination.searchParams.set("error", "invalid"); }
    else try {
      const { email, password } = credentials.data;
      const limiterSettings = loginLimiterConfig();
      if (!limiterSettings) throw new Error("Login protection unavailable");
      const limiter = createLoginLimiter(limiterSettings);
      const attempt = await limiter.reserve(email, trustedLoginIp(request.headers));
      if (!attempt.allowed) return new NextResponse('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign-in temporarily limited</title><main><h1>Sign-in temporarily limited</h1><p>Incorrect email or password. Try again later.</p><p><a href="/login">Return to sign-in</a></p></main></html>', {
        status: 429, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Retry-After": String(attempt.retryAfter) },
      });
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) destination.searchParams.set("error", "invalid");
      else {
        const assurance = await authenticationAssurance(client);
        if (assurance === "mfa") {
          destination.pathname = "/auth/verify"; const response = NextResponse.redirect(destination, { status: 303, headers: { "Cache-Control": "no-store" } });
          response.cookies.set(reservationCookie, sealReservation(attempt.ticket, limiterSettings.secret), { httpOnly: true, secure: destination.protocol === "https:", sameSite: "lax", path: "/", maxAge: 900 }); return response;
        }
        if (assurance !== "ready") { await client.auth.signOut({ scope: "local" }); throw new Error("Authentication assurance unavailable"); }
        const membership = await client.rpc("workspace_access");
        const first = Array.isArray(membership.data) ? membership.data[0] as { tenant_id?: unknown } | undefined : undefined;
        const tenant = typeof first?.tenant_id === "string" && UUID.test(first.tenant_id) ? first.tenant_id : null;
        if (membership.error || !tenant) {
          await client.auth.signOut();
          destination.searchParams.set("error", "invalid");
        } else {
          // Failure to release a successful slot remains conservative; no bypass.
          try { await limiter.succeed(attempt.ticket); } catch { /* Slot expires after 15 minutes. */ }
          destination.pathname = "/dashboard";
          destination.searchParams.set("tenant", tenant);
        }
      }
    } catch { destination.searchParams.set("error", "unavailable"); }
  }
  const response = NextResponse.redirect(destination, 303); response.headers.set("Cache-Control", "no-store"); response.cookies.delete(reservationCookie); return response;
}
