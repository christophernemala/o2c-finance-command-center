import { apiLimit } from "@/lib/api-limiter";
import { NextRequest, NextResponse } from "next/server";
import { access, snapshot } from "@/lib/workspace";
import { buildWorkbookBytes } from "@/modules/DashboardRenderer/browserExcel";
import { receivablesReport } from "@/lib/receivables-report";
import { arPackWorkbook, validateArPack } from "@/lib/ar-pack";
import { entities } from "@/lib/workspace";
export async function GET(request: NextRequest) {
  try {
    const auth = await access(); if (!auth) return new NextResponse("Unauthorized", { status: 401 });
    const limited = await apiLimit(auth.user.id, "export"); if (limited) return limited;
    const tenant = request.nextUrl.searchParams.get("tenant") ?? ""; const entity = request.nextUrl.searchParams.get("entity") ?? "";
    if (!auth.memberships.some(row => row.tenant_id === tenant)) return new NextResponse("Forbidden", { status: 403 });
    const asOf = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date());
    let bytes: Uint8Array; let fileName = "O2C-receivables-report.xlsx";
    if (request.nextUrl.searchParams.get("report") === "pack") {
      const result = await auth.client.rpc("report_ar_pack", { p_tenant: tenant, p_entity: entity, p_as_of: asOf });
      if (result.error) return new NextResponse("Forbidden", { status: 403 });
      const name = (await entities(tenant)).find(row => row.id === entity)?.name ?? "Legal entity";
      bytes = buildWorkbookBytes(arPackWorkbook(validateArPack(result.data), name)); fileName = `O2C-AR-pack-${asOf}.xlsx`;
    } else bytes = buildWorkbookBytes(receivablesReport(await snapshot(tenant, entity, asOf, 0)));
    return new NextResponse(new Uint8Array(bytes).buffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${fileName}"`, "Cache-Control": "private, no-store" } });
  } catch { return new NextResponse("Export unavailable", { status: 503 }); }
}
