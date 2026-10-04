import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseConfig } from "@/lib/supabase/config";
import { sameOrigin } from "@/lib/request-security";
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
    const email = String(form.get("email") ?? ""); const password = String(form.get("password") ?? "");
    if (email.length > 254 || password.length > 256 || !email.includes("@") || !password) { destination.searchParams.set("error", "invalid"); }
    else {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) destination.searchParams.set("error", "invalid"); else destination.pathname = "/";
    }
  }
  const response = NextResponse.redirect(destination, 303); response.headers.set("Cache-Control", "no-store"); return response;
}
