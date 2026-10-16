import Link from "next/link";
import { randomUUID } from "node:crypto";
import type { Snapshot } from "@/types/workspace";
import { remarkChannels, remarkReasons, type CallListRow, type CustomerAccount, type CustomerRemarks, type FollowUp, type LicenceAlert, type WorklistRow } from "@/types/collections";
import { addAmounts, formatAed } from "@/lib/money";
import { Panel, Empty, Money, Badge, KpiAmount } from "./ui";
import { MutationForm } from "./mutation-form";

const when = (value: string | null) => value ? new Date(value).toLocaleString("en-AE", { timeZone: "Asia/Dubai", dateStyle: "medium", timeStyle: "short" }) : "—";
const ddmmyyyy = (iso: string) => iso.split("-").reverse().join("/");
const toneFor = (days: number) => days > 90 ? "final_notice" : days > 30 ? "firm" : "reminder";
const toneLabel = { reminder: "Reminder", firm: "Firm", final_notice: "Final notice" } as const;
export const reasonLabel = { promised: "Promised to pay", payment_sent: "Says payment sent", partial_payment: "Partial payment", dispute: "Dispute raised",
  no_answer: "No answer", wrong_contact: "Wrong contact", escalated: "Escalated", other: "Other" } as const;
const channelLabel = { call: "Call", email: "Email", meeting: "Meeting", sms: "SMS", whatsapp: "WhatsApp", other: "Other" } as const;

export function CollectionsView({ data, worklist, account, emailReady, userId, callList, followUps, allFollowUps, licences, remarks }: { data: Snapshot; worklist: WorklistRow[];
  account: CustomerAccount | null; emailReady: boolean; userId: string; callList: CallListRow[]; followUps: FollowUp[]; allFollowUps: boolean; licences: LicenceAlert[]; remarks: CustomerRemarks | null }) {
  const href = (customer: string) => `/?${new URLSearchParams({ view: "collections", tenant: data.tenant_id, entity: data.entity_id, customer })}`;
  const followUpsHref = `/?${new URLSearchParams({ view: "collections", tenant: data.tenant_id, entity: data.entity_id, ...(allFollowUps ? {} : { followups: "all" }) })}`;
  const packHref = `/api/export?${new URLSearchParams({ report: "daily", tenant: data.tenant_id, entity: data.entity_id })}`;
  const totalText = addAmounts(worklist.map(row => row.overdue));
  return <div className="space-y-6">
    {!emailReady && <div role="status" className="rounded-xl border border-line bg-warning-soft p-4 text-sm text-warning"><p className="font-semibold">Email sending not configured</p><p className="mt-1">Set <code>RESEND_API_KEY</code> and <code>COLLECTIONS_FROM</code> on the server. Until then, approved messages stay queued; nothing is sent or simulated.</p></div>}
    <section aria-label="Collections summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi label="Overdue AR" value={<KpiAmount value={totalText}/>} note={`${worklist.length} customer${worklist.length === 1 ? "" : "s"}`}/>
      <Kpi label="Broken promises" value={worklist.reduce((sum, row) => sum + row.broken_promises, 0)}/>
      <Kpi label="On credit hold" value={worklist.filter(row => row.on_hold).length}/>
      <Kpi label="Without an AR contact" value={worklist.filter(row => row.contacts === 0).length} note="Cannot be emailed until a contact is added"/>
    </section>
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <Panel title="Today's call list" subtitle="Ranked by overdue AED, weighted by age and broken promises. Customers with a future follow-up, or a remark logged today, are left out."
        action={<a className="button secondary" href={packHref}>Daily pack (Excel)</a>}>
        {callList.length ? <ol className="divide-y divide-line">{callList.map((row, index) => <li key={row.customer_id} className="flex flex-wrap items-start justify-between gap-3 px-6 py-3 text-sm">
          <div className="min-w-0"><p><span className="money mr-2 text-muted">{index + 1}.</span><Link className="font-medium text-link underline-offset-2 hover:underline" href={href(row.customer_id)}>{row.customer}</Link> <span className="text-xs text-muted">{row.account}</span></p>
            <p className="mt-1 text-xs text-muted">{row.why}</p>{row.last_note && <p className="mt-1 truncate text-xs">Last note: {row.last_note}</p>}</div>
          <div className="text-right"><Money value={row.overdue}/><p className="money text-xs text-muted" title="Overdue AED × (1 + min(days, 360) ÷ 90) × (1 + min(broken promises, 3) × 0.5)">score {row.score}</p></div></li>)}</ol>
          : <Empty title="Nobody left to call today">Every overdue customer has a remark today or a follow-up date ahead.</Empty>}
      </Panel>
      <div className="space-y-6">
        <Panel title="Follow-ups due" subtitle={allFollowUps ? "Everyone's follow-up dates that have arrived." : "Follow-up dates you set that have arrived."} action={<a className="text-sm text-link underline-offset-2 hover:underline" href={followUpsHref}>{allFollowUps ? "Show mine" : "Show everyone's"}</a>}>
          {followUps.length ? <ul className="divide-y divide-line">{followUps.map(row => <li key={row.remark_id} className="flex flex-wrap items-start justify-between gap-2 px-6 py-3 text-sm">
            <div className="min-w-0"><Link className="font-medium text-link underline-offset-2 hover:underline" href={href(row.customer_id)}>{row.customer}</Link><p className="mt-1 truncate text-xs text-muted">{reasonLabel[row.last_reason]} · {row.last_note}</p></div>
            <Badge value={row.days_late > 0 ? "review" : "info"} label={row.days_late > 0 ? `${row.days_late}d late` : "Due today"}/></li>)}</ul>
            : <Empty title="No follow-ups due">Set a next follow-up date when you log a remark, and it appears here on that day.</Empty>}
        </Panel>
        <Panel title="Trade licences" subtitle="Expired, or expiring within 30 days.">
          {licences.length ? <ul className="divide-y divide-line">{licences.map(row => <li key={row.id} className="flex flex-wrap items-start justify-between gap-2 px-6 py-3 text-sm">
            <div className="min-w-0"><Link className="font-medium text-link underline-offset-2 hover:underline" href={href(row.customer_id)}>{row.customer}</Link><p className="money mt-1 text-xs text-muted">{row.authority} {row.licence_number} · expires {ddmmyyyy(row.expiry_date)}</p></div>
            <Badge value={row.expired ? "failed" : "review"} label={row.expired ? `Expired ${-row.days_left}d ago` : `${row.days_left}d left`}/></li>)}</ul>
            : <Empty title="No licence alerts">Record customers' trade licences on their account to be warned before they expire.</Empty>}
        </Panel>
      </div>
    </div>
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <Panel title="Worklist" subtitle={`Customers with overdue invoices as of ${data.as_of}, ranked by overdue AED.`}>
        {worklist.length ? <div className="overflow-auto"><table><caption className="sr-only">Collections worklist</caption><thead><tr><th scope="col">Customer</th><th scope="col" className="text-right">Overdue</th><th scope="col" className="text-right">Oldest</th><th scope="col">Next step</th></tr></thead><tbody>
          {worklist.map(row => <tr key={row.customer_id} aria-selected={account?.customer.id === row.customer_id}>
            <td><Link className="font-medium text-link underline-offset-2 hover:underline" href={href(row.customer_id)}>{row.customer}</Link><p className="mt-1 text-xs text-muted">{row.account}</p>
              <div className="mt-1 flex flex-wrap gap-1">{row.on_hold && <Badge value="failed" label="On hold"/>}{row.broken_promises > 0 && <Badge value="failed" label={`${row.broken_promises} broken promise${row.broken_promises === 1 ? "" : "s"}`}/>}
                {row.disputed_invoices > 0 && <Badge value="review" label="Dispute open"/>}{row.contacts === 0 && <Badge value="neutral" label="No contact"/>}</div></td>
            <td className="money text-right"><Money value={row.overdue}/><p className="text-xs text-muted">{row.overdue_invoices} invoice{row.overdue_invoices === 1 ? "" : "s"}</p></td>
            <td className="money text-right">{row.oldest_days}d</td>
            <td>{row.last_message === "pending" ? <Badge value="pending" label="Email awaiting approval"/> : <Badge value={toneFor(row.oldest_days) === "final_notice" ? "failed" : toneFor(row.oldest_days) === "firm" ? "review" : "info"} label={toneLabel[toneFor(row.oldest_days)]}/>}</td>
          </tr>)}
        </tbody></table></div> : <Empty title="No overdue customers">Import invoices to build the worklist. Customers appear here once an open invoice passes its due date.</Empty>}
      </Panel>
      {account ? <CustomerPanel data={data} account={account} userId={userId} remarks={remarks}/> : <Panel title="Customer"><Empty title="Select a customer">Choose a customer in the worklist to see contacts, promises, credit and messages.</Empty></Panel>}
    </div>
  </div>;
}

function Kpi({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return <div className="rounded-xl border border-line bg-surface px-6 py-4"><p className="text-xs font-medium text-muted">{label}</p><p className="kpi-value mt-2 !text-3xl">{value}</p>{note && <p className="mt-1 text-xs text-muted">{note}</p>}</div>;
}

function CustomerPanel({ data, account, userId, remarks }: { data: Snapshot; account: CustomerAccount; userId: string; remarks: CustomerRemarks | null }) {
  const maker = ["maker", "admin"].includes(data.role); const checker = ["approver", "admin"].includes(data.role);
  const c = account.customer; const Scope = () => <><input type="hidden" name="tenant" value={data.tenant_id}/><input type="hidden" name="entity" value={data.entity_id}/><input type="hidden" name="customer" value={c.id}/></>;
  const overdue = account.invoices.filter(invoice => invoice.days_overdue > 0 && invoice.dispute !== "open");
  const oldest = overdue.reduce((max, invoice) => Math.max(max, invoice.days_overdue), 0);
  const primary = account.contacts.find(contact => contact.is_primary) ?? account.contacts[0];
  const draftBody = overdue.length ? `Dear ${primary?.name ?? "customer"},\n\nOur records show the following invoices are overdue:\n${overdue.map(invoice => `- ${invoice.number}, due ${ddmmyyyy(invoice.due_date)}: ${formatAed(invoice.open)}`).join("\n")}\n\nPlease confirm your payment date, or tell us if any item is in dispute.\n\nAccounts Receivable` : "";
  const statementHref = `/api/statements/${c.id}?${new URLSearchParams({ tenant: data.tenant_id, entity: data.entity_id })}`;
  return <Panel title={c.name} subtitle={`Account ${c.account}`}>
    <div className="space-y-6 p-6 text-sm">
      {account.hold && <div role="note" className="rounded-lg border-l-4 border-danger bg-danger-soft p-4"><p className="font-semibold text-danger">Credit hold active</p>
        <p className="mt-1">{account.hold.reason}</p><p className="mt-1 text-xs text-muted">Placed by {account.hold.placed_by_kind === "agent" ? "the credit risk agent" : "a team member"} · {when(account.hold.placed_at)}. Only an approver other than the person who placed it can release it.</p>
        {checker && account.hold.placed_by !== userId && <MutationForm action="/api/collections"><Scope/><input type="hidden" name="intent" value="hold_release"/><input type="hidden" name="id" value={account.hold.id}/>
          <label>Release reason<input name="reason" required minLength={5} maxLength={500}/></label><button className="button secondary">Release hold</button></MutationForm>}</div>}

      <section aria-labelledby="remarks-h"><h3 id="remarks-h" className="font-semibold">Remarks</h3>
        {["maker", "approver", "admin"].includes(data.role) && <MutationForm action="/api/collections"><Scope/><input type="hidden" name="intent" value="remark_add"/><input type="hidden" name="id" value={randomUUID()}/>
          <div className="grid gap-3 sm:grid-cols-2"><label>Outcome<select name="reason" defaultValue="no_answer">{remarkReasons.map(reason => <option key={reason} value={reason}>{reasonLabel[reason]}</option>)}</select></label>
            <label>Channel<select name="channel" defaultValue="call">{remarkChannels.map(channel => <option key={channel} value={channel}>{channelLabel[channel]}</option>)}</select></label></div>
          <label>Note<textarea name="note" required minLength={3} maxLength={1000} rows={3}/></label>
          <div className="grid gap-3 sm:grid-cols-2"><label>Next follow-up<input name="next" type="date" min={data.as_of}/></label>
            <label>Invoice<select name="invoice" defaultValue=""><option value="">Whole account</option>{account.invoices.map(invoice => <option key={invoice.id} value={invoice.id}>{invoice.number}</option>)}</select></label></div>
          {["maker", "admin"].includes(data.role) && <fieldset className="grid gap-3 rounded-lg border border-line p-3 sm:grid-cols-2"><legend className="px-1 text-xs text-muted">Promise (required when the outcome is “Promised to pay”)</legend>
            <label>Amount (AED)<input name="promise_amount" inputMode="decimal" pattern="(0|[1-9][0-9]{0,12})(\.[0-9]{1,2})?"/></label><label>Promised date<input name="promise_date" type="date"/></label></fieldset>}
          {!["maker", "admin"].includes(data.role) && <><input type="hidden" name="promise_amount" value=""/><input type="hidden" name="promise_date" value=""/></>}
          <button className="button secondary">Log remark</button></MutationForm>}
        {remarks?.remarks.length ? <ol className="mt-3 space-y-2">{remarks.remarks.map(remark => <li key={remark.id} className="rounded-lg border border-line p-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{reasonLabel[remark.reason]} <span className="text-xs font-normal text-muted">· {channelLabel[remark.channel]}{remark.invoice_id ? ` · ${account.invoices.find(invoice => invoice.id === remark.invoice_id)?.number ?? "invoice"}` : ""}</span></p>
            <span className="text-xs text-muted">{remark.created_by === userId ? "You" : "Team member"} · {when(remark.created_at)}</span></div>
          <p className="mt-1 whitespace-pre-wrap">{remark.note}</p>{remark.next_follow_up && <p className="mt-1 text-xs text-muted">Next follow-up {ddmmyyyy(remark.next_follow_up)}</p>}</li>)}</ol>
          : <p className="mt-2 text-muted">No remarks yet. Remarks are kept as a permanent record and cannot be edited.</p>}
      </section>

      <section aria-labelledby="credit-h"><h3 id="credit-h" className="font-semibold">Credit</h3>
        <p className="mt-1 text-muted">Limit {account.credit_limit ? <Money value={account.credit_limit.limit}/> : "not set"} · open <Money value={addAmounts(account.invoices.map(invoice => invoice.open))}/></p>
        {account.pending_limit && <div className="mt-3 rounded-lg border border-line p-3"><p>Pending limit <Money value={account.pending_limit.limit}/> · {account.pending_limit.reason}</p>
          {checker && account.pending_limit.maker !== userId ? <div className="mt-2 flex gap-2">{(["active", "rejected"] as const).map(decision => <MutationForm key={decision} action="/api/collections"><Scope/><input type="hidden" name="intent" value="limit_decide"/><input type="hidden" name="id" value={account.pending_limit!.id}/><input type="hidden" name="decision" value={decision}/><button className={decision === "active" ? "button" : "button secondary"}>{decision === "active" ? "Approve" : "Reject"}</button></MutationForm>)}</div>
            : <p className="mt-1 text-xs text-muted">A different approver or admin must decide.</p>}</div>}
        {maker && !account.pending_limit && <details className="mt-3"><summary className="cursor-pointer text-link">Propose a credit limit</summary><MutationForm action="/api/collections"><Scope/><input type="hidden" name="intent" value="limit_propose"/><input type="hidden" name="id" value={randomUUID()}/>
          <label>Limit (AED)<input name="limit" required inputMode="decimal" pattern="(0|[1-9][0-9]{0,12})(\.[0-9]{1,2})?" placeholder="250000.00"/></label><label>Reason<input name="reason" required minLength={5} maxLength={500}/></label><button className="button secondary">Propose limit</button></MutationForm></details>}
        {!account.hold && ["maker", "approver", "admin"].includes(data.role) && <details className="mt-3"><summary className="cursor-pointer text-link">Place a credit hold</summary><MutationForm action="/api/collections"><Scope/><input type="hidden" name="intent" value="hold_place"/><input type="hidden" name="id" value={randomUUID()}/>
          <label>Reason<input name="reason" required minLength={5} maxLength={500}/></label><button className="button secondary">Place hold</button></MutationForm></details>}
      </section>

      <section aria-labelledby="contacts-h"><h3 id="contacts-h" className="font-semibold">Contacts</h3>
        {account.contacts.length ? <ul className="mt-2 space-y-2">{account.contacts.map(contact => <li key={contact.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line p-3">
          <div><p className="font-medium">{contact.name} {contact.is_primary && <Badge value="info" label="Primary"/>}</p><p className="text-xs text-muted">{contact.email} · {contact.role.toUpperCase()}</p></div>
          {maker && <MutationForm action="/api/collections"><Scope/><input type="hidden" name="intent" value="contact_archive"/><input type="hidden" name="id" value={contact.id}/><button className="button secondary">Remove</button></MutationForm>}</li>)}</ul>
          : <p className="mt-1 text-muted">No contact on file. Emails cannot be proposed until one is added.</p>}
        {maker && <details className="mt-3"><summary className="cursor-pointer text-link">Add a contact</summary><MutationForm action="/api/collections"><Scope/><input type="hidden" name="intent" value="contact_add"/><input type="hidden" name="id" value={randomUUID()}/>
          <div className="grid gap-3 sm:grid-cols-2"><label>Name<input name="name" required maxLength={120}/></label><label>Email<input name="email" type="email" required maxLength={254}/></label></div>
          <label>Role<select name="role" defaultValue="ar"><option value="ar">AR</option><option value="ap">AP</option><option value="finance">Finance</option><option value="other">Other</option></select></label>
          <label className="flex-row items-center gap-2"><input type="checkbox" name="primary" className="!min-h-0 !w-auto"/> Primary contact</label><button className="button secondary">Add contact</button></MutationForm></details>}
      </section>

      <section aria-labelledby="messages-h"><div className="flex flex-wrap items-center justify-between gap-2"><h3 id="messages-h" className="font-semibold">Collections emails</h3><a className="text-link underline-offset-2 hover:underline" href={statementHref}>Download statement (PDF)</a></div>
        {account.messages.length ? <ul className="mt-2 space-y-2">{account.messages.map(message => <li key={message.id} className="rounded-lg border border-line p-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{toneLabel[message.tone]} · <Money value={message.total_overdue}/></p>
            <Badge value={message.status === "sent" ? "posted" : message.status === "failed" || message.status === "rejected" ? "failed" : "pending"} label={message.status === "approved" ? "approved, queued" : message.status}/></div>
          <p className="mt-1 text-xs text-muted">To {message.to} · {message.agent_run_id ? "proposed by the collections agent" : "proposed by a team member"} · {when(message.created_at)}{message.sent_at ? ` · sent ${when(message.sent_at)}` : ""}{message.attach_statement ? " · statement attached" : ""}</p>
          {message.error && <p className="mt-1 text-xs text-danger">{message.error}</p>}
          <details className="mt-2"><summary className="cursor-pointer text-xs text-link">Show email</summary><p className="mt-2 font-medium">{message.subject}</p><p className="mt-1 whitespace-pre-wrap leading-6">{message.body}</p></details>
          {message.status === "pending" && (checker && message.maker !== userId ? <div className="mt-3 flex gap-2">{(["approved", "rejected"] as const).map(decision => <MutationForm key={decision} action="/api/collections"><Scope/><input type="hidden" name="intent" value="message_decide"/><input type="hidden" name="id" value={message.id}/><input type="hidden" name="decision" value={decision}/><button className={decision === "approved" ? "button" : "button secondary"}>{decision === "approved" ? "Approve and send" : "Reject"}</button></MutationForm>)}</div>
            : <p className="mt-2 text-xs text-muted">Waiting for an approver other than the maker.</p>)}
        </li>)}</ul> : <p className="mt-1 text-muted">No messages yet.</p>}
        {maker && primary && overdue.length > 0 && <details className="mt-3"><summary className="cursor-pointer text-link">Propose an email</summary><MutationForm action="/api/collections"><Scope/><input type="hidden" name="intent" value="message_propose"/><input type="hidden" name="id" value={randomUUID()}/>
          <input type="hidden" name="contact" value={primary.id}/><input type="hidden" name="invoices" value={overdue.map(invoice => invoice.id).join(",")}/>
          <p className="text-xs text-muted">To {primary.email}. Covers the {overdue.length} overdue, undisputed invoice{overdue.length === 1 ? "" : "s"}; the total is recomputed from the ledger, and an attached statement lists only these invoices. An approver must approve before it is sent, and it is re-checked against the ledger at approval and at sending.</p>
          <label>Tone<select name="tone" defaultValue={toneFor(oldest)}><option value="reminder">Reminder</option><option value="firm">Firm</option><option value="final_notice">Final notice</option></select></label>
          <label>Subject<input name="subject" required minLength={3} maxLength={200} defaultValue={`Overdue invoices: ${c.account}`}/></label>
          <label>Message<textarea name="body" required minLength={20} maxLength={4000} rows={9} defaultValue={draftBody}/></label>
          <label className="flex-row items-center gap-2"><input type="checkbox" name="attach" className="!min-h-0 !w-auto" defaultChecked={oldest > 30}/> Attach statement PDF</label>
          <button className="button">Submit for approval</button></MutationForm></details>}
      </section>

      <section aria-labelledby="promises-h"><h3 id="promises-h" className="font-semibold">Payment promises</h3>
        {account.promises.length ? <ul className="mt-2 divide-y divide-line">{account.promises.map(promise => <li key={promise.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
          <span><Money value={promise.amount}/> by {ddmmyyyy(promise.promised_date)}{promise.note ? ` · ${promise.note}` : ""}</span><Badge value={promise.status === "broken" ? "failed" : promise.status === "kept" ? "posted" : "pending"} label={promise.status}/>
          {promise.resolvable && ["maker", "approver", "admin"].includes(data.role) && <details className="w-full"><summary className="cursor-pointer text-xs text-link">Mark kept or cancelled</summary>
            <MutationForm action="/api/collections"><Scope/><input type="hidden" name="intent" value="promise_resolve"/><input type="hidden" name="id" value={promise.id}/>
              <label>Outcome<select name="status" defaultValue="kept"><option value="kept">Kept</option><option value="cancelled">Cancelled</option></select></label>
              <label>Reason<input name="reason" required minLength={5} maxLength={500} placeholder="Receipt BNK-123 on 14/10"/></label><button className="button secondary">Save</button></MutationForm></details>}</li>)}</ul>
          : <p className="mt-1 text-muted">No promises recorded.</p>}
        {maker && <details className="mt-3"><summary className="cursor-pointer text-link">Record a promise</summary><MutationForm action="/api/collections"><Scope/><input type="hidden" name="intent" value="promise_record"/><input type="hidden" name="id" value={randomUUID()}/>
          <div className="grid gap-3 sm:grid-cols-2"><label>Amount (AED)<input name="amount" required inputMode="decimal" pattern="(0|[1-9][0-9]{0,12})(\.[0-9]{1,2})?"/></label><label>Promised date<input name="date" type="date" required/></label></div>
          <label>Invoice<select name="invoice" defaultValue=""><option value="">Whole account</option>{account.invoices.map(invoice => <option key={invoice.id} value={invoice.id}>{invoice.number}</option>)}</select></label>
          <label>Note<input name="note" maxLength={500}/></label><button className="button secondary">Record promise</button></MutationForm></details>}
      </section>

      <section aria-labelledby="licence-h"><h3 id="licence-h" className="font-semibold">Trade licences</h3>
        {remarks?.licences.length ? <ul className="mt-2 divide-y divide-line">{remarks.licences.map(licence => <li key={licence.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
          <span className="money">{licence.authority} {licence.licence_number}</span><span className={licence.expiry_date < data.as_of ? "text-danger" : ""}>expires {ddmmyyyy(licence.expiry_date)}</span></li>)}</ul>
          : <p className="mt-1 text-muted">No trade licence on file.</p>}
        {["maker", "admin"].includes(data.role) && <details className="mt-3"><summary className="cursor-pointer text-link">Record a licence or renewal</summary><MutationForm action="/api/collections"><Scope/><input type="hidden" name="intent" value="licence_add"/><input type="hidden" name="id" value={randomUUID()}/>
          <div className="grid gap-3 sm:grid-cols-3"><label>Licence number<input name="number" required maxLength={60}/></label><label>Issuing authority<input name="authority" required minLength={2} maxLength={80} placeholder="DET Dubai"/></label><label>Expiry date<input name="expiry" type="date" required/></label></div>
          <p className="text-xs text-muted">Recording the same licence number again replaces the earlier expiry date.</p><button className="button secondary">Save licence</button></MutationForm></details>}
      </section>

      <section aria-labelledby="open-h"><h3 id="open-h" className="font-semibold">Open invoices</h3>
        <div className="mt-2 overflow-auto"><table><caption className="sr-only">Open invoices</caption><thead><tr><th scope="col">Invoice</th><th scope="col">Due</th><th scope="col" className="text-right">Open</th></tr></thead><tbody>
          {account.invoices.map(invoice => <tr key={invoice.id}><td className="money">{invoice.number}{invoice.dispute === "open" && <> <Badge value="review" label="Dispute"/></>}</td><td>{ddmmyyyy(invoice.due_date)}{invoice.days_overdue > 0 && <p className="text-xs text-muted">{invoice.days_overdue}d overdue</p>}</td><td className="money text-right"><Money value={invoice.open}/></td></tr>)}
        </tbody></table></div>
      </section>
    </div>
  </Panel>;
}
