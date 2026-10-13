import { NextResponse } from "next/server";
/** Legacy provider callbacks cannot create sessions in the standalone deployment. */
export function GET() {
  return new NextResponse("This sign-in connection has been retired. Use your invited email account.", { status: 410, headers: { "Cache-Control": "no-store" } });
}
