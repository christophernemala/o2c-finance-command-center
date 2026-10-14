import { NextRequest, NextResponse } from "next/server";
import { sameOrigin } from "@/lib/request-security";
export function POST(request: NextRequest) {
  if (!sameOrigin(request.headers)) return new NextResponse("Forbidden", { status: 403 });
  return new NextResponse("This sign-in connection has been retired. Use your invited email account.", { status: 410, headers: { "Cache-Control": "no-store" } });
}
