export const workspaces = ["overview", "receivables", "reconciliation", "ecl", "approvals", "agents", "imports", "audit"] as const;
export type Workspace = typeof workspaces[number];
export type Role = "viewer" | "maker" | "approver" | "admin";
export interface Membership { tenant_id: string; tenant_name: string; role: Role }
export interface Entity { id: string; name: string; currency: "AED" }
export interface Invoice {
  id: string; number: string; customer: string; customer_id: string; due_date: string;
  gross: string; open: string; lifecycle: "posted" | "void"; settlement: string;
  dispute: "none" | "open" | "resolved"; collection: "normal" | "follow_up" | "promise_to_pay"; version: number;
}
export interface Receipt { id: string; reference: string; customer_id: string; amount: string; residual: string; version: number }
export interface BankLine { id: string; reference: string; booked_at: string; direction: "credit" | "debit"; amount: string; posted: boolean; version: number }
export interface Approval {
  id: string; kind: "receipt" | "allocation"; amount: string; maker: string;
  approver: string | null; status: "pending" | "approved" | "rejected" | "posted";
  invoice_id: string | null; receipt_id: string | null; bank_line_id: string | null;
  customer_id: string | null; evidence: string; created_at: string; version: number;
}
export interface Snapshot {
  tenant_id: string; entity_id: string; as_of: string; fetched_at: string; role: Role;
  invoices: Invoice[]; receipts: Receipt[]; bank_lines: BankLine[]; approvals: Approval[];
  customers: { id: string; name: string; account: string }[];
  ecl_runs: { id: string; model_version: string; exposure_snapshot: string; scenario: string; allowance: string; status: string; as_of: string }[];
  agent_runs: { id: string; name: string; status: string; operation_id: string | null; updated_at: string }[];
  imports: { id: string; file_name: string; status: string; rows: number; total: string; digest: string; created_at: string }[];
  audit: { id: string; actor: string; operation: string; record_id: string; at: string; detail: Record<string, unknown> }[];
  totals: { gross: string; open: string; unapplied: string; allowance: string | null; invoice_count: number; pending_count: number };
  page: number; has_more: boolean;
}
