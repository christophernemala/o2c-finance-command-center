import { NextRequest, NextResponse } from "next/server";
import { apiLimit } from "@/lib/api-limiter";
import { routeAccess } from "@/lib/workspace";
import { validateInvoiceMatches } from "@/lib/search";
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const noStore = { "Cache-Control": "private, no-store" };
export async function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
  const tenant = request.nextUrl.searchParams.get("tenant") ?? "";
  const entity = request.nextUrl.searchParams.get("entity") ?? "";
  if (query.length < 2) return NextResponse.json({ results: [] }, { headers: noStore });
  if (!uuid.test(tenant) || !uuid.test(entity)) return NextResponse.json({ error: "Invalid scope" }, { status: 400, headers: noStore });
  try {
    const auth = await routeAccess();
    if (auth === "mfa") return NextResponse.json({ error: "MFA required" }, { status: 401, headers: noStore });
    if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401, headers: noStore });
    if (!auth.memberships.some(row => row.tenant_id === tenant)) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: noStore });
    const limited = await apiLimit(auth.user.id, "search"); if (limited) return limited;
    const literalQuery = query.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
    const result = await auth.client.rpc("agent_invoices", {
      p_tenant: tenant, p_entity: entity,
      p_as_of: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date()),
      p_filter: "all", p_search: literalQuery, p_limit: 10, p_offset: 0,
    });
    if (result.error || !Array.isArray(result.data)) return NextResponse.json({ error: "Search unavailable" }, { status: 503, headers: noStore });
    const results = validateInvoiceMatches(result.data).map(({ id, number, customer, account, due_date, open }) => ({ id, number, customer, account, due_date, open }));
    return NextResponse.json({ results }, { headers: noStore });
  } catch {
    return NextResponse.json({ error: "Search unavailable" }, { status: 503, headers: noStore });
  }
}
