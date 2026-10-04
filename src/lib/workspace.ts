import "server-only";
import { createClient } from "./supabase/server";
import type { Entity, Membership, Snapshot } from "@/types/workspace";
import { amount, aggregateAmount } from "./money";
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
  for (const key of ["gross", "open", "unapplied"] as const) aggregateAmount(data.totals[key]);
  if (data.totals.allowance !== null) amount(data.totals.allowance);
  return data;
}
export async function snapshot(tenant: string, entity: string, asOf: string, page: number) {
  const client = await createClient();
  const result = await client.rpc("workspace_snapshot", { p_tenant: tenant, p_entity: entity, p_as_of: asOf, p_page: page });
  if (result.error) throw new Error("Snapshot unavailable");
  return validateSnapshot(result.data, tenant, entity);
}
