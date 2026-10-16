export interface WorklistRow {
  customer_id: string; customer: string; account: string; overdue: string; open: string; overdue_invoices: number; oldest_days: number;
  disputed_invoices: number; broken_promises: number; open_promises: number; on_hold: boolean; contacts: number; credit_limit: string | null;
  last_message: "pending" | "approved" | "rejected" | "sending" | "sent" | "failed" | null;
}
export interface CustomerAccount {
  customer: { id: string; name: string; account: string };
  invoices: { id: string; number: string; issued_at: string; due_date: string; gross: string; open: string; days_overdue: number; dispute: string }[];
  contacts: { id: string; name: string; email: string; role: "ar" | "ap" | "finance" | "other"; is_primary: boolean }[];
  promises: { id: string; invoice_id: string | null; amount: string; promised_date: string; status: "open" | "kept" | "cancelled" | "broken"; note: string | null }[];
  hold: { id: string; reason: string; placed_by_kind: "agent" | "human"; placed_by: string; placed_at: string } | null;
  credit_limit: { id: string; limit: string; decided_at: string } | null;
  pending_limit: { id: string; limit: string; reason: string; maker: string } | null;
  messages: { id: string; tone: "reminder" | "firm" | "final_notice"; subject: string; body: string; to: string; total_overdue: string; invoice_ids: string[];
    attach_statement: boolean; status: "pending" | "approved" | "rejected" | "sending" | "sent" | "failed"; maker: string; checker: string | null;
    agent_run_id: string | null; error: string | null; created_at: string; sent_at: string | null }[];
}
