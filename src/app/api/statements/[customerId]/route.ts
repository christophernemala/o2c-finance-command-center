import { NextRequest } from "next/server";
import { z } from "zod";
import { access } from "@/lib/workspace";
import { apiLimit } from "@/lib/api-limiter";
import { dubaiDate } from "@/lib/ai/config";
import { statementPdf, validateStatement } from "@/lib/statements/pdf";
/** Open-items statement PDF for one customer, built from the ledger under the signed-in user's RLS scope. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ customerId: string }> }) {
  const auth = await access(); if (!auth) return new Response("Unauthorized", { status: 401 });
  const query = z.object({ tenant: z.uuid(), entity: z.uuid() }).safeParse(Object.fromEntries(request.nextUrl.searchParams));
  const customer = z.uuid().safeParse((await params).customerId);
  if (!query.success || !customer.success) return new Response("Invalid request", { status: 400 });
  const limited = await apiLimit(auth.user.id, "export"); if (limited) return limited;
  const result = await auth.client.rpc("customer_statement", { p_tenant: query.data.tenant, p_entity: query.data.entity, p_customer: customer.data, p_as_of: dubaiDate() });
  if (result.error) return new Response("Statement unavailable", { status: /Forbidden/.test(result.error.message) ? 403 : 404 });
  const data = validateStatement(result.data);
  const bytes = await statementPdf(data);
  return new Response(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="statement-${data.account.replace(/[^A-Za-z0-9-]/g, "_")}-${data.as_of}.pdf"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
