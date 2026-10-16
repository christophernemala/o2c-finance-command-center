import { aggregateAmount } from "./money";
import type { CallListRow, FollowUp, LicenceAlert, LoggedRemark, WorklistRow } from "@/types/collections";
export interface DailyPack { as_of: string; entity: string; callList: CallListRow[]; followUps: FollowUp[]; licences: LicenceAlert[]; remarks: LoggedRemark[]; worklist: WorklistRow[] }
const reasonLabel: Record<string, string> = { promised: "Promised to pay", payment_sent: "Says payment sent", partial_payment: "Partial payment", dispute: "Dispute raised",
  no_answer: "No answer", wrong_contact: "Wrong contact", escalated: "Escalated", other: "Other" };
const list = <T>(value: unknown, name: string): T[] => { if (!Array.isArray(value)) throw new Error(`Invalid ${name}`); return value as T[]; };
/** Validate the database rows at the boundary; amounts stay decimal strings and are checked, never converted. */
export function validateDailyPack(input: { as_of: string; entity: string; callList: unknown; followUps: unknown; licences: unknown; remarks: unknown; worklist: unknown }): DailyPack {
  const pack = { as_of: input.as_of, entity: input.entity, callList: list<CallListRow>(input.callList, "call list"), followUps: list<FollowUp>(input.followUps, "follow-ups"),
    licences: list<LicenceAlert>(input.licences, "licence alerts"), remarks: list<LoggedRemark>(input.remarks, "remarks"), worklist: list<WorklistRow>(input.worklist, "worklist") };
  pack.callList.forEach(row => { aggregateAmount(row.overdue); aggregateAmount(row.score); });
  pack.worklist.forEach(row => { aggregateAmount(row.overdue); aggregateAmount(row.open); });
  pack.remarks.forEach(row => { if (row.promise_amount !== null) aggregateAmount(row.promise_amount); });
  return pack;
}
const dubai = (iso: string) => new Date(iso).toLocaleString("en-AE", { timeZone: "Asia/Dubai", dateStyle: "short", timeStyle: "short" });
export function dailyPackWorkbook(pack: DailyPack): Record<string, Record<string, unknown>[]> {
  return {
    Summary: [
      { Item: "Legal entity", Value: pack.entity }, { Item: "Business date (Asia/Dubai)", Value: pack.as_of },
      { Item: "Customers to call", Value: String(pack.callList.length) }, { Item: "Follow-ups due", Value: String(pack.followUps.length) },
      { Item: "Remarks logged today", Value: String(pack.remarks.length) }, { Item: "Trade licences expired or expiring in 30 days", Value: String(pack.licences.length) },
      { Item: "Call list score", Value: "Overdue AED x (1 + min(oldest days, 360) / 90) x (1 + min(broken promises, 3) x 0.5)" },
    ],
    "Call list": pack.callList.map((row, index) => ({ Rank: String(index + 1), Customer: row.customer, Account: row.account, "Overdue AED": row.overdue,
      "Oldest (days)": String(row.oldest_days), "Broken promises": String(row.broken_promises), "On hold": row.on_hold ? "Yes" : "No", Score: row.score, Why: row.why, "Last note": row.last_note ?? "" })),
    "Follow-ups due": pack.followUps.map(row => ({ Customer: row.customer, Account: row.account, Due: row.due, "Days late": String(row.days_late), "Last outcome": reasonLabel[row.last_reason] ?? row.last_reason, "Last note": row.last_note })),
    "Remarks today": pack.remarks.map(row => ({ Time: dubai(row.created_at), Customer: row.customer, Account: row.account, Invoice: row.invoice ?? "", Channel: row.channel,
      Outcome: reasonLabel[row.reason] ?? row.reason, Note: row.note, "Next follow-up": row.next_follow_up ?? "", "Promise AED": row.promise_amount ?? "", "Promise date": row.promise_date ?? "" })),
    "Trade licences": pack.licences.map(row => ({ Customer: row.customer, Account: row.account, Licence: row.licence_number, Authority: row.authority, Expiry: row.expiry_date,
      Status: row.expired ? `Expired ${-row.days_left} days ago` : `${row.days_left} days left` })),
    Worklist: pack.worklist.map(row => ({ Customer: row.customer, Account: row.account, "Overdue AED": row.overdue, "Open AED": row.open, "Overdue invoices": String(row.overdue_invoices),
      "Oldest (days)": String(row.oldest_days ?? 0), "Disputed invoices": String(row.disputed_invoices), "Broken promises": String(row.broken_promises), "On hold": row.on_hold ? "Yes" : "No" })),
  };
}
