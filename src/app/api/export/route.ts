import { NextRequest, NextResponse } from "next/server";
import { access, snapshot } from "@/lib/workspace";
import { buildWorkbookBytes } from "@/modules/DashboardRenderer/browserExcel";
export async function GET(request: NextRequest) {
  try {
    const auth = await access(); if (!auth) return new NextResponse("Unauthorized", { status: 401 });
    const tenant = request.nextUrl.searchParams.get("tenant") ?? ""; const entity = request.nextUrl.searchParams.get("entity") ?? "";
    if (!auth.memberships.some(row => row.tenant_id === tenant)) return new NextResponse("Forbidden", { status: 403 });
    const data = await snapshot(tenant, entity, new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date()), 0);
    const bytes = buildWorkbookBytes({ "Receivables page 1": data.invoices.map(row => ({ Invoice: row.number, Customer: row.customer, "Gross AED": row.gross, "Open AED": row.open, "Due date": row.due_date, Settlement: row.settlement })),
      Scope: [{ Tenant: tenant, Entity: entity, "Retrieved at": data.fetched_at, "Aging date": data.as_of, "Gross AED all invoices": data.totals.gross, "Open AED all invoices": data.totals.open, "Unapplied AED": data.totals.unapplied, "Invoice rows exported": data.invoices.length, "Full dataset": "No; first 50 invoice records" }] });
    return new NextResponse(new Uint8Array(bytes).buffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="O2C-receivables-page-1.xlsx"', "Cache-Control": "private, no-store" } });
  } catch { return new NextResponse("Export unavailable", { status: 503 }); }
}
