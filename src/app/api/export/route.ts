import { apiLimit } from "@/lib/api-limiter";
import { NextRequest, NextResponse } from "next/server";
import { routeAccess, snapshot } from "@/lib/workspace";
import { buildWorkbookBytes } from "@/modules/DashboardRenderer/browserExcel";
import { receivablesReport } from "@/lib/receivables-report";
import { arPackWorkbook, validateArPack } from "@/lib/ar-pack";
import { entities } from "@/lib/workspace";
import { dailyPackWorkbook, validateDailyPack } from "@/lib/daily-pack";
// Only an authorization refusal is a 403; anything else (an outage, a bad date) is a 503 so it is not mistaken for missing access.
const failure = (message: string) => {
  if (/Forbidden|Unauthenticated|Invalid entity scope/.test(message)) return new NextResponse("Forbidden", { status: 403 });
  console.error("Export failed", message); return new NextResponse("Export unavailable", { status: 503 });
};
export async function GET(request: NextRequest) {
  try {
    const auth = await routeAccess(); if (auth === "mfa") return NextResponse.redirect(new URL("/auth/verify", request.url), 303); if (!auth) return new NextResponse("Unauthorized", { status: 401 });
    const limited = await apiLimit(auth.user.id, "export"); if (limited) return limited;
    const tenant = request.nextUrl.searchParams.get("tenant") ?? ""; const entity = request.nextUrl.searchParams.get("entity") ?? "";
    if (!auth.memberships.some(row => row.tenant_id === tenant)) return new NextResponse("Forbidden", { status: 403 });
    const asOf = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date());
    let bytes: Uint8Array; let fileName = "O2C-receivables-report.xlsx";
    if (request.nextUrl.searchParams.get("report") === "pack") {
      const result = await auth.client.rpc("report_ar_pack", { p_tenant: tenant, p_entity: entity, p_as_of: asOf });
      if (result.error) return failure(result.error.message);
      const name = (await entities(tenant)).find(row => row.id === entity)?.name ?? "Legal entity";
      bytes = buildWorkbookBytes(arPackWorkbook(validateArPack(result.data), name)); fileName = `O2C-AR-pack-${asOf}.xlsx`;
    } else if (request.nextUrl.searchParams.get("report") === "daily") {
      const scope = { p_tenant: tenant, p_entity: entity };
      const [callList, followUps, licences, remarks, worklist, byCategory, byRegion] = await Promise.all([auth.client.rpc("daily_call_list", { ...scope, p_as_of: asOf, p_limit: 100 }),
        auth.client.rpc("my_follow_ups", { ...scope, p_as_of: asOf, p_all: true }), auth.client.rpc("licence_alerts", { ...scope, p_as_of: asOf, p_days: 30 }),
        auth.client.rpc("remarks_logged", { ...scope, p_date: asOf }), auth.client.rpc("collections_worklist", { ...scope, p_as_of: asOf }),
        auth.client.rpc("outstanding_breakdown", { ...scope, p_as_of: asOf, p_dimension: "category", p_category: null, p_region: null }),
        auth.client.rpc("outstanding_breakdown", { ...scope, p_as_of: asOf, p_dimension: "region", p_category: null, p_region: null })]);
      if ([callList, followUps, licences, remarks, worklist, byCategory, byRegion].some(result => result.error)) return failure([callList, followUps, licences, remarks, worklist, byCategory, byRegion].find(result => result.error)!.error!.message);
      const name = (await entities(tenant)).find(row => row.id === entity)?.name ?? "Legal entity";
      bytes = buildWorkbookBytes(dailyPackWorkbook(validateDailyPack({ as_of: asOf, entity: name, callList: callList.data, followUps: followUps.data, licences: licences.data, remarks: remarks.data, worklist: worklist.data, byCategory: byCategory.data, byRegion: byRegion.data })));
      fileName = `O2C-daily-collections-${asOf}.xlsx`;
    } else bytes = buildWorkbookBytes(receivablesReport(await snapshot(tenant, entity, asOf, 0)));
    return new NextResponse(new Uint8Array(bytes).buffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${fileName}"`, "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Export failed", error instanceof Error ? error.message : error);
    return new NextResponse("Export unavailable", { status: 503 });
  }
}
