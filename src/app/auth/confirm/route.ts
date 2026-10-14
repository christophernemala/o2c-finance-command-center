import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/postgres/server";
import { postgresConfig } from "@/lib/postgres/config";
import { authSiteOrigin } from "@/lib/auth-flow";
import { loginLimiterConfig } from "@/lib/login-limiter";
import { encryptionKey, validToken } from "@/lib/auth/crypto";
import { sameOrigin, boundedFormRequest } from "@/lib/request-security";

const privateHeaders = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
const configured = () => Boolean(postgresConfig() && encryptionKey() && loginLimiterConfig());
function destination(error?: "invite" | "unavailable") {
  const origin = authSiteOrigin();
  const path = `/signup${error ? `?error=${error}` : ""}`;
  return new NextResponse(null, { status: 303, headers: { ...privateHeaders, Location: origin ? new URL(path, origin).href : "/signup?error=unavailable" } });
}

// Mail scanners and chat previews may GET the link. They must not consume it.
export async function GET(request: NextRequest) {
  if (!authSiteOrigin() || !configured()) return destination("unavailable");
  const token = request.nextUrl.searchParams.get("token");
  if (request.nextUrl.searchParams.get("type") !== "invite" || !validToken(token)) return destination("invite");
  try {
    const client = await createClient();
    const result = await client.auth.validateInvitation(token);
    if (result.error) return destination("unavailable");
    if (!result.valid) return destination("invite");
    // validToken restricts the interpolated value to 43 base64url characters.
    return new NextResponse(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Activate your O2C account</title></head><body><main><h1>Activate your O2C account</h1><p>Continue to set your password. This invitation can be used once.</p><form method="post" action="/auth/confirm"><input type="hidden" name="type" value="invite"><input type="hidden" name="token" value="${token}"><button type="submit">Continue activation</button></form></main></body></html>`, { headers: { ...privateHeaders, "Content-Type": "text/html; charset=utf-8" } });
  } catch { return destination("unavailable"); }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request.headers)) return new NextResponse("Forbidden", { status: 403, headers: privateHeaders });
  if (!authSiteOrigin() || !configured()) return destination("unavailable");
  const body = await boundedFormRequest(request, 2048);
  if (body instanceof Response) {
    for (const [name, value] of Object.entries(privateHeaders)) body.headers.set(name, value);
    return body;
  }
  try {
    const form = await body.formData(); const token = form.get("token");
    if (form.get("type") !== "invite" || !validToken(token)) return destination("invite");
    const client = await createClient();
    const result = await client.auth.acceptInvitation(token);
    return destination(result.error ? "invite" : undefined);
  } catch { return destination("unavailable"); }
}
