import { randomUUID } from "node:crypto";
import type { Snapshot } from "@/types/workspace";
import { noteReasons, type AdjustmentNote, type ShortPayment } from "@/types/collections";
import { Panel, Empty, Money, Badge } from "./ui";
import { MutationForm } from "./mutation-form";

export const noteReasonLabel = { short_payment: "Short payment", bank_charges: "Bank charges", pricing: "Pricing correction", discount: "Discount", returns: "Returned goods",
  damaged: "Damaged goods", late_payment_fee: "Late payment fee", other: "Other" } as const;
const when = (value: string | null) => value ? new Date(value).toLocaleString("en-AE", { timeZone: "Asia/Dubai", dateStyle: "medium", timeStyle: "short" }) : "";

/** Credit and debit notes: the record of a document issued in the source system, not the tax document itself. */
export function NotesView({ data, notes, shortPayments, userId }: { data: Snapshot; notes: AdjustmentNote[]; shortPayments: ShortPayment[]; userId: string }) {
  const maker = ["maker", "admin"].includes(data.role); const checker = ["approver", "admin"].includes(data.role);
  const Scope = ({ id }: { id: string }) => <><input type="hidden" name="tenant" value={data.tenant_id}/><input type="hidden" name="entity" value={data.entity_id}/><input type="hidden" name="id" value={id}/></>;
  const open = notes.filter(note => note.status === "pending" || note.status === "approved");
  const done = notes.filter(note => note.status === "posted" || note.status === "rejected");
  return <div className="space-y-6">
    <div role="note" className="rounded-xl border border-line bg-info-soft p-4 text-sm text-info">
      <p className="font-semibold">Ledger adjustments, not tax documents</p>
      <p className="mt-1">Each note records a credit or debit note issued in your ERP or invoicing system, using that document&apos;s number as the reference. This application does not issue VAT credit notes or e-invoices.</p>
    </div>

    <Panel title="Awaiting decision or posting" subtitle="A different approver decides; posting is a separate step. A credit note reduces one invoice; a debit note adds a new receivable.">
      {open.length ? <ul className="divide-y divide-line">{open.map(note => <NoteRow key={note.id} note={note} userId={userId} checker={checker} canPost={data.role !== "viewer"} Scope={Scope}/>)}</ul>
        : <Empty title="Nothing waiting">Proposed notes appear here until an approver decides and someone posts them.</Empty>}
    </Panel>

    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-2">
      <Panel title="Short payments" subtitle="Invoices with a payment allocated and an open remainder of AED 50.00 or less, not disputed, with no note pending.">
        {shortPayments.length ? <ul className="divide-y divide-line">{shortPayments.map(row => <li key={row.invoice_id} className="flex flex-wrap items-start justify-between gap-3 px-6 py-3 text-sm">
          <div className="min-w-0"><p className="font-medium">{row.customer} <span className="money text-xs text-muted">{row.invoice}</span></p><p className="mt-1 text-xs text-muted">Paid <Money value={row.paid}/> of <Money value={row.gross}/></p></div>
          <div className="text-right"><Money value={row.open}/><p className="text-xs text-muted">remaining</p></div>
          {maker && <details className="w-full"><summary className="cursor-pointer text-xs text-link">Propose a credit note for the remainder</summary>
            <MutationForm action="/api/notes"><Scope id={randomUUID()}/><input type="hidden" name="intent" value="note_propose"/><input type="hidden" name="kind" value="credit"/>
              <input type="hidden" name="customer" value={row.customer_id}/><input type="hidden" name="invoice" value={row.invoice_id}/><input type="hidden" name="due" value=""/><input type="hidden" name="amount" value={row.open}/>
              <div className="grid gap-3 sm:grid-cols-2"><label>Reason<select name="reason" defaultValue="bank_charges"><option value="bank_charges">Bank charges</option><option value="short_payment">Short payment</option></select></label>
                <label>Credit note number<input name="reference" required maxLength={60} placeholder="From your ERP"/></label></div>
              <label>Memo<input name="memo" required minLength={10} maxLength={1000} defaultValue={`Remainder of ${row.invoice} after payment`}/></label><button className="button secondary">Submit for approval</button></MutationForm></details>}</li>)}</ul>
          : <Empty title="No short payments">Invoices appear here when a payment leaves a small remainder.</Empty>}
      </Panel>

      <Panel title="Record a note" subtitle="Enter a note already issued in your source system.">
        {maker ? <div className="p-6"><MutationForm action="/api/notes"><Scope id={randomUUID()}/><input type="hidden" name="intent" value="note_propose"/>
          <div className="grid gap-3 sm:grid-cols-2"><label>Type<select name="kind" defaultValue="credit"><option value="credit">Credit note</option><option value="debit">Debit note</option></select></label>
            <label>Customer<select name="customer" required>{data.customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name} ({customer.account})</option>)}</select></label></div>
          <div className="grid gap-3 sm:grid-cols-2"><label>Invoice (required for a credit note)<select name="invoice" defaultValue=""><option value="">None</option>{data.invoices.filter(invoice => invoice.lifecycle === "posted").map(invoice => <option key={invoice.id} value={invoice.id}>{invoice.number} · {invoice.customer}</option>)}</select></label>
            <label>Amount (AED)<input name="amount" required inputMode="decimal" pattern="(0|[1-9][0-9]{0,12})(\.[0-9]{1,2})?"/></label></div>
          <div className="grid gap-3 sm:grid-cols-3"><label>Reason<select name="reason" defaultValue="pricing">{noteReasons.map(reason => <option key={reason} value={reason}>{noteReasonLabel[reason]}</option>)}</select></label>
            <label>Note number<input name="reference" required maxLength={60}/></label><label>Due date (debit note)<input name="due" type="date"/></label></div>
          <label>Memo<textarea name="memo" required minLength={10} maxLength={1000} rows={3}/></label>
          <p className="text-xs text-muted">The invoice list shows the current page of receivables. A credit note may not exceed the invoice&apos;s open amount, checked again at approval and posting.</p>
          <button className="button">Submit for approval</button></MutationForm></div>
          : <Empty title="Makers record notes">Your role can review notes. A maker or admin records them.</Empty>}
      </Panel>
    </div>

    <Panel title="Posted and rejected" subtitle="The last 100 notes.">
      {done.length ? <ul className="divide-y divide-line">{done.map(note => <NoteRow key={note.id} note={note} userId={userId} checker={false} canPost={false} Scope={Scope}/>)}</ul>
        : <Empty title="No history yet">Posted and rejected notes are kept here.</Empty>}
    </Panel>
  </div>;
}

function NoteRow({ note, userId, checker, canPost, Scope }: { note: AdjustmentNote; userId: string; checker: boolean; canPost: boolean; Scope: (props: { id: string }) => React.ReactNode }) {
  const decide = (decision: "approved" | "rejected") => <MutationForm key={decision} action="/api/notes"><Scope id={note.id}/><input type="hidden" name="intent" value="note_decide"/><input type="hidden" name="version" value={note.version}/>
    <input type="hidden" name="decision" value={decision}/><button className={decision === "approved" ? "button" : "button secondary"}>{decision === "approved" ? "Approve" : "Reject"}</button></MutationForm>;
  return <li className="space-y-2 px-6 py-4 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="font-medium">{note.kind === "credit" ? "Credit note" : "Debit note"} <span className="money">{note.reference}</span> · <Money value={note.amount}/></p>
      <Badge value={note.status === "posted" ? "posted" : note.status === "rejected" ? "rejected" : "pending"} label={note.status}/></div>
    <p className="text-xs text-muted">{note.customer} ({note.account}){note.invoice ? <> · against <span className="money">{note.invoice}</span>{note.invoice_open !== null && <> (open <Money value={note.invoice_open}/>)</>}</> : null}
      {note.due_date ? ` · due ${note.due_date.split("-").reverse().join("/")}` : ""} · {noteReasonLabel[note.reason]} · {note.agent_run_id ? "proposed by the cash application agent" : note.maker === userId ? "proposed by you" : "proposed by a team member"} · {when(note.created_at)}</p>
    <p>{note.memo}</p>
    {!note.invoice_current && note.status !== "posted" && <p className="text-xs text-danger">The invoice changed after this note was proposed. Reject it and record a new one.</p>}
    {note.status === "pending" && (checker && note.maker !== userId ? <div className="flex gap-2">{decide("approved")}{decide("rejected")}</div>
      : <p className="text-xs text-muted">Waiting for an approver other than the maker.</p>)}
    {note.status === "approved" && canPost && <MutationForm action="/api/notes"><Scope id={note.id}/><input type="hidden" name="intent" value="note_post"/><input type="hidden" name="version" value={note.version}/>
      <button className="button">Post {note.kind === "credit" ? "credit" : "debit"} note</button></MutationForm>}
  </li>;
}
