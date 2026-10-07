import { NextRequest, NextResponse } from "next/server";
import { access, snapshot } from "@/lib/workspace";
import { buildWorkbookBytes } from "@/modules/DashboardRenderer/browserExcel";
import { receivablesReport } from "@/lib/receivables-report";
export async function GET(request: NextRequest) {
  try {
    const auth = await access(); if (!auth) return new NextResponse("Unauthorized", { status: 401 });
    const tenant = request.nextUrl.searchParams.get("tenant") ?? ""; const entity = request.nextUrl.searchParams.get("entity") ?? "";
    if (!auth.memberships.some(row => row.tenant_id === tenant)) return new NextResponse("Forbidden", { status: 403 });
    const data = await snapshot(tenant, entity, new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date()), 0);
    const bytes = buildWorkbookBytes(receivablesReport(data));
    return new NextResponse(new Uint8Array(bytes).buffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="O2C-receivables-report.xlsx"', "Cache-Control": "private, no-store" } });
  } catch { return new NextResponse("Export unavailable", { status: 503 }); }
}
