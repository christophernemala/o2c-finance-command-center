export interface WorklistRow {
  customer_id: string; customer: string; account: string; overdue: string; open: string; overdue_invoices: number; oldest_days: number;
  disputed_invoices: number; broken_promises: number; open_promises: number; on_hold: boolean; contacts: number; credit_limit: string | null;
  last_message: "pending" | "approved" | "rejected" | "sending" | "sent" | "failed" | null;
}
export interface CustomerAccount {
  customer: { id: string; name: string; account: string };
  invoices: { id: string; number: string; issued_at: string; due_date: string; gross: string; open: string; days_overdue: number; dispute: string }[];
  contacts: { id: string; name: string; email: string; role: "ar" | "ap" | "finance" | "other"; is_primary: boolean }[];
  promises: { id: string; invoice_id: string | null; amount: string; promised_date: string; status: "open" | "kept" | "cancelled" | "broken"; resolvable: boolean; note: string | null }[];
  hold: { id: string; reason: string; placed_by_kind: "agent" | "human"; placed_by: string; placed_at: string } | null;
  credit_limit: { id: string; limit: string; decided_at: string } | null;
  pending_limit: { id: string; limit: string; reason: string; maker: string } | null;
  messages: { id: string; tone: "reminder" | "firm" | "final_notice"; subject: string; body: string; to: string; total_overdue: string; invoice_ids: string[];
    attach_statement: boolean; status: "pending" | "approved" | "rejected" | "sending" | "sent" | "failed"; maker: string; checker: string | null;
    agent_run_id: string | null; error: string | null; created_at: string; sent_at: string | null }[];
}
export const remarkReasons = ["promised", "payment_sent", "partial_payment", "dispute", "no_answer", "wrong_contact", "escalated", "other"] as const;
export const remarkChannels = ["call", "email", "meeting", "sms", "whatsapp", "other"] as const;
export type RemarkReason = typeof remarkReasons[number];
export type RemarkChannel = typeof remarkChannels[number];
export interface CallListRow {
  customer_id: string; customer: string; account: string; overdue: string; oldest_days: number; broken_promises: number; on_hold: boolean;
  contacts: number; score: string; why: string; last_note: string | null;
}
export interface FollowUp {
  customer_id: string; customer: string; account: string; due: string; days_late: number; last_reason: RemarkReason; last_note: string; owner: string; remark_id: string;
}
export interface LicenceAlert {
  id: string; customer_id: string; customer: string; account: string; licence_number: string; authority: string; expiry_date: string; days_left: number; expired: boolean;
}
export interface CustomerRemarks {
  remarks: { id: string; invoice_id: string | null; reason: RemarkReason; channel: RemarkChannel; note: string; next_follow_up: string | null; promise_id: string | null; created_by: string; created_at: string }[];
  licences: { id: string; licence_number: string; authority: string; expiry_date: string }[];
}
export interface LoggedRemark {
  customer: string; account: string; invoice: string | null; reason: RemarkReason; channel: RemarkChannel; note: string; next_follow_up: string | null;
  promise_amount: string | null; promise_date: string | null; created_by: string; created_at: string;
}
export const breakdownDimensions = ["category", "region", "customer"] as const;
export type BreakdownDimension = typeof breakdownDimensions[number];
export interface BreakdownAmounts { open: string; current: string; d1_30: string; d31_60: string; d61_90: string; d90_plus: string; disputed: string }
export interface Breakdown {
  dimension: BreakdownDimension; as_of: string; category: string | null; region: string | null;
  total: BreakdownAmounts & { customers: number; invoices: number };
  rows: (BreakdownAmounts & { label: string; account: string | null; customer_id: string | null; customers: number; invoices: number; share_percent: string | null })[];
}
export interface Segments { categories: string[]; regions: string[]; unassigned: number; customers: number }
export const noteReasons = ["short_payment", "bank_charges", "pricing", "discount", "returns", "damaged", "late_payment_fee", "other"] as const;
export type NoteReason = typeof noteReasons[number];
export interface AdjustmentNote {
  id: string; kind: "credit" | "debit"; customer_id: string; customer: string; account: string; invoice_id: string | null; invoice: string | null;
  invoice_open: string | null; invoice_current: boolean; amount: string; reason: NoteReason; memo: string; reference: string; due_date: string | null;
  status: "pending" | "approved" | "rejected" | "posted"; maker: string; checker: string | null; poster: string | null; agent_run_id: string | null;
  version: number; created_at: string; decided_at: string | null; posted_at: string | null;
}
export interface ShortPayment { invoice_id: string; invoice: string; customer_id: string; customer: string; account: string; gross: string; open: string; paid: string }
