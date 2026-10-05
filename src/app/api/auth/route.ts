import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseConfig } from "@/lib/supabase/config";
import { sameOrigin } from "@/lib/request-security";
import { createLoginLimiter, loginLimiterConfig, trustedLoginIp } from "@/lib/login-limiter";
import { credentialsSchema } from "@/lib/validation";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function POST(request: NextRequest) {
  if (!sameOrigin(request.headers)) return new NextResponse("Forbidden", { status: 403 });
  if (!request.headers.get("content-length") || Number(request.headers.get("content-length")) > 4096) return new NextResponse("Request too large", { status: 413 });
  const destination = new URL("/login", request.headers.get("origin")!);
  if (!supabaseConfig()) { destination.searchParams.set("error", "unavailable"); return NextResponse.redirect(destination, 303); }
  const form = await request.formData(); const client = await createClient();
  if (form.get("intent") === "logout") {
    const result = await client.auth.signOut();
    if (result.error) destination.searchParams.set("error", "unavailable");
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
  const response = NextResponse.redirect(destination, 303); response.headers.set("Cache-Control", "no-store"); return response;
}
