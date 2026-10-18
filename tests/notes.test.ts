import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { migratedDatabase } from "./pg-helper";
import { NotesView } from "../src/components/notes";
import type { Snapshot } from "../src/types/workspace";
import type { AdjustmentNote } from "../src/types/collections";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const hash = (n: number) => String(n).padStart(64, "0");
const T = id(10), E = id(20), C1 = id(30), C2 = id(31);

test("credit and debit notes in PostgreSQL", async t => {
  const db = await migratedDatabase();
  try {
    await db.exec("set timezone='Asia/Dubai'");
    // 1 admin, 2 approver, 3 viewer, 4 maker, 5 second approver
    await db.query("insert into auth.users(id,email_confirmed_at) values($1,now()),($2,now()),($3,now()),($4,now()),($5,now())", [id(1), id(2), id(3), id(4), id(5)]);
    await db.query("insert into public.tenants(id,name) values($1,'Tenant')", [T]);
    await db.query("insert into public.memberships values($1,$2,'admin'),($1,$3,'approver'),($1,$4,'viewer'),($1,$5,'maker'),($1,$6,'approver')", [T, id(1), id(2), id(3), id(4), id(5)]);
    await db.query("insert into public.entities(id,tenant_id,name) values($1,$2,'Entity')", [E, T]);
    await db.query("insert into public.customers(id,tenant_id,entity_id,account,name) values($1,$3,$4,'C1','Customer One'),($2,$3,$4,'C2','Customer Two')", [C1, C2, T, E]);
    await db.query(`insert into public.invoices(id,tenant_id,entity_id,customer_id,number,issued_at,due_date,gross) values
      ($1,$4,$5,$6,'INV-1',current_date-40,current_date-10,1000.00),($2,$4,$5,$6,'INV-2',current_date-40,current_date-10,500.00),($3,$4,$5,$7,'INV-3',current_date-20,current_date+10,300.00)`,
      [id(40), id(41), id(42), T, E, C1, C2]);
    async function asUser(n: number) {
      await db.exec("reset role");
      await db.query("insert into auth.sessions(token_hash,user_id,purpose,aal,expires_at) values($1,$2,'login','aal1',now()+interval '1 hour') on conflict(token_hash) do nothing", [hash(n), id(n)]);
      await db.query("select set_config('o2c.session_hash',$1,false)", [hash(n)]);
      await db.exec("set role authenticated");
    }
    const propose = (n: number, kind: string, customer: string, invoice: string | null, amount: string, reason: string, reference: string, due: string | null = null) =>
      db.query("select public.propose_adjustment_note($1,$2,$3,$4,$5,$6,$7,$8,'Memo for the adjustment note',$9,$10::date)", [T, E, id(n), kind, customer, invoice, amount, reason, reference, due]);
    const open = async (invoice: string) => { await db.exec("reset role"); return (await db.query<{ open: string }>("select open::text from o2c_private.open_invoices($1,$2) where id=$3", [T, E, invoice])).rows[0]?.open; };
    const version = async (n: number) => { await db.exec("reset role"); return (await db.query<{ version: number }>("select version from public.adjustment_notes where id=$1", [id(n)])).rows[0].version; };

    await t.test("proposals are validated against the ledger and limited to makers, admins and the agent", async () => {
      await asUser(3);
      await assert.rejects(propose(60, "credit", C1, id(40), "200.00", "pricing", "CN-1"), /Forbidden/);
      await asUser(4);
      await assert.rejects(propose(60, "credit", C1, null, "200.00", "pricing", "CN-1"), /must name the invoice/);
      await assert.rejects(propose(60, "credit", C1, id(40), "1000.01", "pricing", "CN-1"), /exceeds the invoice open amount/);
      await assert.rejects(propose(60, "credit", C1, id(42), "10.00", "pricing", "CN-1"), /Invoice unavailable/, "invoice of another customer");
      await assert.rejects(propose(60, "debit", C1, null, "150.00", "late_payment_fee", "DN-1"), /needs a due date/);
      await assert.rejects(propose(60, "debit", C1, null, "150.00", "late_payment_fee", "INV-2", "2026-12-31"), /already used by a receivable/);
      await assert.rejects(propose(60, "credit", C1, id(40), "12.345", "pricing", "CN-1"), /Invalid amount/);
    });

    await t.test("a credit note is approved by someone else, then posted as a separate step, and reduces the invoice", async () => {
      await asUser(4);
      await propose(60, "credit", C1, id(40), "200.00", "pricing", "CN-1");
      await propose(60, "credit", C1, id(40), "200.00", "pricing", "CN-1");
      await assert.rejects(propose(60, "credit", C1, id(40), "250.00", "pricing", "CN-1"), /Idempotency key conflict/);
      await assert.rejects(db.query("select public.decide_adjustment_note($1,$2,$3,1,'approved')", [T, E, id(60)]), /Forbidden/, "makers cannot decide");
      await assert.rejects(db.query("select public.post_adjustment_note($1,$2,$3,1)", [T, E, id(60)]), /Approved current note required/, "pending notes cannot post");
      await asUser(2);
      await assert.rejects(db.query("select public.decide_adjustment_note($1,$2,$3,2,'approved')", [T, E, id(60)]), /Stale proposal/);
      await db.query("select public.decide_adjustment_note($1,$2,$3,1,'approved')", [T, E, id(60)]);
      assert.equal(await open(id(40)), "1000.00", "approval alone changes nothing");
      await asUser(3);
      await assert.rejects(db.query("select public.post_adjustment_note($1,$2,$3,2)", [T, E, id(60)]), /Forbidden/);
      await asUser(4);
      const journal = (await db.query<{ v: string }>("select public.post_adjustment_note($1,$2,$3,2) as v", [T, E, id(60)])).rows[0].v;
      assert.equal((await db.query<{ v: string }>("select public.post_adjustment_note($1,$2,$3,2) as v", [T, E, id(60)])).rows[0].v, journal, "posting replays return the same journal");
      assert.equal(await open(id(40)), "800.00");
      const entry = (await db.query("select amount::text,debit_account,credit_account from public.adjustment_journals where id=$1", [journal])).rows[0];
      assert.deepEqual(entry, { amount: "200.00", debit_account: "sales_adjustments", credit_account: "accounts_receivable" });
      assert.deepEqual((await db.query("select receipt_id,approval_id,note_id from public.allocations where invoice_id=$1", [id(40)])).rows, [{ receipt_id: null, approval_id: null, note_id: id(60) }]);
    });

    await t.test("an approved credit note whose invoice changed before posting is refused", async () => {
      await asUser(4);
      await propose(61, "credit", C1, id(41), "100.00", "discount", "CN-2");
      await propose(62, "credit", C1, id(41), "450.00", "returns", "CN-3");
      await asUser(2);
      await db.query("select public.decide_adjustment_note($1,$2,$3,1,'approved')", [T, E, id(61)]);
      await db.query("select public.decide_adjustment_note($1,$2,$3,1,'approved')", [T, E, id(62)]);
      await db.query("select public.post_adjustment_note($1,$2,$3,2)", [T, E, id(61)]);
      await assert.rejects(db.query("select public.post_adjustment_note($1,$2,$3,2)", [T, E, id(62)]), /Stale evidence/);
      assert.equal(await open(id(41)), "400.00", "the two notes together would have over-credited the invoice");
      // The stuck approved note is withdrawn by its approver with a reason, which frees CN-3.
      await asUser(2);
      await db.query("select public.withdraw_adjustment_note($1,$2,$3,2,'Invoice changed after approval')", [T, E, id(62)]);
      await db.exec("reset role");
      assert.deepEqual((await db.query("select status,version from public.adjustment_notes where id=$1", [id(62)])).rows[0], { status: "rejected", version: 3 });
      assert.equal((await db.query<{ n: number }>("select count(*)::int as n from public.audit_events where operation='adjustment_note.withdrawn' and record_id=$1", [id(62)])).rows[0].n, 1);
    });

    await t.test("a debit note posts a new receivable marked as a debit note", async () => {
      await asUser(4);
      await propose(63, "debit", C2, null, "150.00", "late_payment_fee", "DN-1", "2026-12-31");
      await asUser(5);
      await db.query("select public.decide_adjustment_note($1,$2,$3,1,'approved')", [T, E, id(63)]);
      await db.query("select public.post_adjustment_note($1,$2,$3,2)", [T, E, id(63)]);
      await db.exec("reset role");
      const receivable = (await db.query("select number,gross::text,document_type,due_date::text from public.invoices where source_note_id=$1", [id(63)])).rows[0];
      assert.deepEqual(receivable, { number: "DN-1", gross: "150.00", document_type: "debit_note", due_date: "2026-12-31" });
      assert.equal((await db.query<{ debit_account: string }>("select debit_account from public.adjustment_journals where note_id=$1", [id(63)])).rows[0].debit_account, "accounts_receivable");
      await asUser(4);
      await assert.rejects(propose(64, "debit", C2, null, "10.00", "other", "DN-1", "2026-12-31"), /already used/);
    });

    await t.test("the agent proposes small short-payment credit notes only, within block-stage caps, and never decides", async () => {
      // Fixture: a 280.00 payment already allocated to INV-3 (300.00), leaving a 20.00 short payment.
      await db.exec("reset role; set session_replication_role=replica");
      await db.query("insert into public.allocations(tenant_id,entity_id,invoice_id,receipt_id,approval_id,amount) values($1,$2,$3,$4,$5,280.00)", [T, E, id(42), id(500), id(501)]);
      await db.exec("set session_replication_role=origin");
      await asUser(3);
      const candidates = (await db.query<{ v: { invoice: string; open: string }[] }>("select public.short_payment_candidates($1,$2,'50.00') as v", [T, E])).rows[0].v;
      assert.deepEqual(candidates.map(row => [row.invoice, row.open]), [["INV-3", "20.00"]]);
      await asUser(1);
      await db.query("select public.propose_guardrail($1,$2,$3,'Cap agent credit notes','max_amount','cash_application',$4,null)", [T, E, id(200), { tool: "propose_credit_note", limit: "15.00" }]);
      await db.query("select public.propose_guardrail_stage($1,$2,$3,2,'block',null)", [T, E, id(200)]);
      await asUser(2);
      await db.query("select public.decide_guardrail_stage($1,$2,$3,2,'active')", [T, E, id(200)]);
      await db.exec("reset role");
      await db.query("insert into public.agent_runs(id,tenant_id,entity_id,name,status,kind,trigger,as_of) values($1,$2,$3,'Cash application agent','queued','cash_application','manual',current_date)", [id(100), T, E]);
      await db.query("select o2c_private.claim_agent_run($1,$2)", [id(100), "a".repeat(64)]);
      await db.query("select set_config('o2c.session_hash',$1,false)", ["a".repeat(64)]);
      await db.exec("set role authenticated");
      await assert.rejects(propose(70, "debit", C2, null, "5.00", "other", "DN-9", "2026-12-31"), /Forbidden/);
      await assert.rejects(propose(70, "credit", C2, id(42), "5.00", "pricing", "CN-9"), /Forbidden/);
      await assert.rejects(propose(70, "credit", C2, id(42), "20.00", "bank_charges", "CN-pending-INV-3"), /Blocked by guardrail: Cap agent credit notes/);
      await propose(70, "credit", C2, id(42), "15.00", "bank_charges", "CN-pending-INV-3");
      await assert.rejects(db.query("select public.decide_adjustment_note($1,$2,$3,1,'approved')", [T, E, id(70)]), /Forbidden/);
      await asUser(3);
      assert.deepEqual((await db.query<{ v: unknown[] }>("select public.short_payment_candidates($1,$2,'50.00') as v", [T, E])).rows[0].v, [], "a pending note removes the candidate");
      assert.equal(await version(70), 1);
      await db.query("select set_config('o2c.session_hash',$1,false)", ["a".repeat(64)]);
      await db.exec("set role authenticated");
      assert.equal((await db.query<{ v: string }>("select public.agent_finish_run($1,$2,$3,'succeeded','Proposed one credit note',null,0,0,0,null,null) as v", [T, E, id(100)])).rows[0].v,
        "awaiting_approval", "a run that leaves a pending note awaits approval");
    });

    await t.test("allocations and notes cannot be written directly", async () => {
      await asUser(4);
      await assert.rejects(db.query("insert into public.allocations(tenant_id,entity_id,invoice_id,note_id,amount) values($1,$2,$3,$4,1.00)", [T, E, id(40), id(60)]), /permission denied/);
      await assert.rejects(db.query("update public.adjustment_notes set status='posted' where id=$1", [id(70)]), /permission denied/);
    });

    await t.test("the notes screen separates deciding and posting and labels notes as ledger adjustments", async () => {
      await asUser(3);
      const notes = (await db.query<{ v: AdjustmentNote[] }>("select public.adjustment_notes_list($1,$2,'all') as v", [T, E])).rows[0].v;
      const base = { tenant_id: T, entity_id: E, customers: [], invoices: [] } as unknown as Snapshot;
      const approver = renderToStaticMarkup(createElement(NotesView, { data: { ...base, role: "approver" } as Snapshot, notes, shortPayments: [], userId: id(2) }));
      assert.match(approver, /not tax documents/); assert.match(approver, /proposed by the cash application agent/); assert.match(approver, />Approve</);
      assert.match(approver, /CN-3/); assert.match(approver, /invoice changed after this note was proposed/);
      const viewer = renderToStaticMarkup(createElement(NotesView, { data: { ...base, role: "viewer" } as Snapshot, notes, shortPayments: [], userId: id(3) }));
      assert.doesNotMatch(viewer, />Approve</); assert.doesNotMatch(viewer, /Post credit note/); assert.doesNotMatch(viewer, /Submit for approval/);
    });
  } finally {
    await db.close();
  }
});
