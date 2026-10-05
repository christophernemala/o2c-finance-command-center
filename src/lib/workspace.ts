import "server-only";
import { createClient } from "./supabase/server";
import type { Entity, Membership, Snapshot } from "@/types/workspace";
import { amount, aggregateAmount } from "./money";
import { validateCashflowRun } from "./cashflow";
export async function access() {
  const client = await createClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return null;
  const membership = await client.rpc("workspace_access");
  if (membership.error || !Array.isArray(membership.data)) throw new Error("Membership lookup unavailable");
  return { client, user, memberships: membership.data as Membership[] };
}
export async function entities(tenantId: string) {
  const client = await createClient();
  const result = await client.rpc("workspace_entities", { p_tenant: tenantId });
  if (result.error || !Array.isArray(result.data)) throw new Error("Entity lookup unavailable");
  return result.data as Entity[];
}
export function validateSnapshot(value: unknown, tenant: string, entity: string): Snapshot {
  if (!value || typeof value !== "object") throw new Error("Invalid snapshot");
  const data = value as Snapshot;
  if (data.tenant_id !== tenant || data.entity_id !== entity || !data.totals || !data.fetched_at || !data.as_of) throw new Error("Scope mismatch");
  for (const key of ["invoices", "receipts", "bank_lines", "approvals", "customers", "ecl_runs", "agent_runs", "imports", "audit"] as const) {
    if (!Array.isArray(data[key])) throw new Error("Invalid snapshot records");
  }
  data.invoices.forEach(row => { amount(row.gross); amount(row.open); });
  data.receipts.forEach(row => { amount(row.amount); amount(row.residual); });
  data.bank_lines.forEach(row => amount(row.amount)); data.approvals.forEach(row => amount(row.amount));
  data.ecl_runs.forEach(row => amount(row.allowance));
  if (!data.insights || !Array.isArray(data.insights.charts) || data.insights.charts.length !== 6) throw new Error("Insights migration required");
  for (const chart of data.insights.charts) {
    if (!chart || typeof chart.key !== "string" || typeof chart.title !== "string" || typeof chart.description !== "string"
      || !["AED", "records"].includes(chart.unit) || !Array.isArray(chart.series) || chart.series.length > 10) throw new Error("Invalid chart");
    for (const row of chart.series) {
      if (!row || typeof row.label !== "string") throw new Error("Invalid chart label");
      if (chart.unit === "AED") aggregateAmount(row.value);
      else if (typeof row.value !== "string" || !/^\d{1,20}$/.test(row.value)) throw new Error("Invalid record count");
    }
  }
  if (data.insights.forecast !== null) validateCashflowRun(data.insights.forecast, tenant, entity);
  for (const key of ["gross", "open", "overdue", "unapplied"] as const) aggregateAmount(data.totals[key]);
  if (data.totals.allowance !== null) amount(data.totals.allowance);
  if (data.totals.dso_days !== null && !/^\d+(\.\d{1,2})?$/.test(data.totals.dso_days)) throw new Error("Invalid DSO");
  if (data.totals.cei_percent !== null && !/^(100(\.0{1,2})?|\d{1,2}(\.\d{1,2})?)$/.test(data.totals.cei_percent)) throw new Error("Invalid CEI");
  return data;
}
export async function snapshot(tenant: string, entity: string, asOf: string, page: number) {
  const client = await createClient();
  const result = await client.rpc("workspace_snapshot", { p_tenant: tenant, p_entity: entity, p_as_of: asOf, p_page: page });
  if (result.error) throw new Error("Snapshot unavailable");
  return validateSnapshot(result.data, tenant, entity);
}
