import { NextResponse, type NextRequest } from "next/server";
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`;
  const headers = new Headers(request.headers); headers.set("x-nonce", nonce); headers.set("Content-Security-Policy", policy);
  // Reject malformed IDs before App Router streaming can commit a 200 response.
  const importId = request.nextUrl.pathname.match(/^\/imports\/([^/]+)\/?$/)?.[1];
  const invalidImport = importId !== undefined && !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(importId);
  const response = invalidImport
    ? new NextResponse("Import not found", { status: 404 })
    : NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy); response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
