import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseConfig } from "./lib/supabase/config";
export async function proxy(request: NextRequest) {
  const settings = supabaseConfig();
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const socialOrigins = settings && ["/login", "/signup", "/api/auth/oauth"].includes(request.nextUrl.pathname)
    ? ` ${new URL(settings.url).origin} https://accounts.google.com https://login.microsoftonline.com https://login.live.com` : "";
  const policy = `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://*.supabase.co; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'${socialOrigins}`;
  const requestHeaders = new Headers(request.headers); requestHeaders.set("x-nonce", nonce); requestHeaders.set("Content-Security-Policy", policy);
  let response = NextResponse.next({ request: { headers: requestHeaders } });
  function protect() { response.headers.set("Content-Security-Policy", policy); response.headers.set("Cache-Control", "private, no-store"); return response; }
  if (!settings) return protect();
  const supabase = createServerClient(settings.url, settings.key, { cookies: {
    getAll: () => request.cookies.getAll(),
    setAll(values) {
      values.forEach(({ name, value }) => request.cookies.set(name, value));
      requestHeaders.set("cookie", request.cookies.toString());
      response = NextResponse.next({ request: { headers: requestHeaders } });
      values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
    },
  } });
  try { await supabase.auth.getUser(); } catch { /* Protected callers independently verify identity and fail closed. */ }
  return protect();
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
