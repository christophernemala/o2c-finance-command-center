import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseConfig } from "@/lib/supabase/config";
import { authSiteOrigin } from "@/lib/auth-flow";
import { loginLimiterConfig } from "@/lib/login-limiter";

export async function GET(request: NextRequest) {
  const origin = authSiteOrigin();
  if (!origin) return new NextResponse(null, { status: 303, headers: { Location: "/signup?error=unavailable", "Cache-Control": "no-store" } });
  const destination = new URL("/signup", origin);
  const token = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  if (!supabaseConfig() || !loginLimiterConfig()) destination.searchParams.set("error", "unavailable");
  else if (type !== "invite" || !token || !/^[A-Za-z0-9_-]{20,256}$/.test(token)) destination.searchParams.set("error", "invite");
  else {
    const client = await createClient();
    try {
      const { error } = await client.auth.verifyOtp({ type: "invite", token_hash: token });
      if (error) destination.searchParams.set("error", "invite");
    } catch { destination.searchParams.set("error", "unavailable"); }
  }
  return NextResponse.redirect(destination, { status: 303, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
