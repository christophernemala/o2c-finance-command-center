import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { migratedDatabase } from "./pg-helper";
import { parseSegments } from "../src/lib/segments";
import { CustomersView } from "../src/components/customers";
import type { Snapshot } from "../src/types/workspace";
import type { Breakdown } from "../src/types/collections";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const hash = (n: number) => String(n).padStart(64, "0");
const T = id(10), E = id(20);

test("segment CSV: exact header, unique accounts, no formulas, no reserved label", () => {
  assert.deepEqual(parseSegments("account,category,region\nC1,Distributor,Dubai\nC2,,\n"), { rows: [{ account: "C1", category: "Distributor", region: "Dubai" }, { account: "C2", category: "", region: "" }], errors: [] });
  assert.match(parseSegments("account,region,category\nC1,a,b").errors[0], /first row must be exactly/);
  const bad = parseSegments("account,category,region\nC1,=HYPERLINK(1),Dubai\nC1,Retail,Unassigned\nC3,Retail");
  assert.deepEqual(bad.rows, []);
  assert.deepEqual(bad.errors, ["Row 2: category cannot start with = + - or @.", "Row 3: account C1 appears more than once.", "Row 3: \"Unassigned\" is reserved; leave region empty instead.", "Row 4: expected 3 columns."]);
});

test("segments and outstanding breakdown in PostgreSQL", async t => {
  const db = await migratedDatabase();
  try {
    await db.exec("set timezone='Asia/Dubai'");
    await db.query("insert into auth.users(id,email_confirmed_at) values($1,now()),($2,now()),($3,now())", [id(1), id(3), id(4)]);
    await db.query("insert into public.tenants(id,name) values($1,'Tenant')", [T]);
    await db.query("insert into public.memberships values($1,$2,'admin'),($1,$3,'viewer'),($1,$4,'maker')", [T, id(1), id(3), id(4)]);
    await db.query("insert into public.entities(id,tenant_id,name) values($1,$2,'Entity')", [E, T]);
    await db.query("insert into public.customers(id,tenant_id,entity_id,account,name) values($1,$4,$5,'C1','Customer One'),($2,$4,$5,'C2','Customer Two'),($3,$4,$5,'C3','Customer Three')", [id(30), id(31), id(32), T, E]);
    // C1: 1000.00 current + 500.00 at 100 days (disputed). C2: 250.50 at 45 days. C3: 99.50 at 10 days.
    await db.query(`insert into public.invoices(id,tenant_id,entity_id,customer_id,number,issued_at,due_date,gross,dispute) values
      ($1,$5,$6,$7,'INV-1',current_date-5,current_date+25,1000.00,'none'),($2,$5,$6,$7,'INV-2',current_date-130,current_date-100,500.00,'open'),
      ($3,$5,$6,$8,'INV-3',current_date-75,current_date-45,250.50,'none'),($4,$5,$6,$9,'INV-4',current_date-40,current_date-10,99.50,'none')`,
      [id(40), id(41), id(42), id(43), T, E, id(30), id(31), id(32)]);
    async function asUser(n: number) {
      await db.exec("reset role");
      await db.query("insert into auth.sessions(token_hash,user_id,purpose,aal,expires_at) values($1,$2,'login','aal1',now()+interval '1 hour') on conflict(token_hash) do nothing", [hash(n), id(n)]);
      await db.query("select set_config('o2c.session_hash',$1,false)", [hash(n)]);
      await db.exec("set role authenticated");
    }
    const breakdown = async (dimension: string, category: string | null = null, region: string | null = null) =>
      (await db.query<{ v: Breakdown }>("select public.outstanding_breakdown($1,$2,current_date,$3,$4,$5) as v", [T, E, dimension, category, region])).rows[0].v;
    const rows = [{ account: "C1", category: "Distributor", region: "Dubai" }, { account: "C2", category: "Distributor", region: "Sharjah" }];

    await t.test("only makers and admins set segments; the batch is all-or-nothing and replay-safe", async () => {
      await asUser(3);
      await assert.rejects(db.query("select public.set_customer_segments($1,$2,$3,$4)", [T, E, id(50), JSON.stringify(rows)]), /Forbidden/);
      await asUser(4);
      await assert.rejects(db.query("select public.set_customer_segments($1,$2,$3,$4)", [T, E, id(50), JSON.stringify([...rows, { account: "NOPE", category: "X", region: "" }])]), /Unknown customer account/);
      await assert.rejects(db.query("select public.set_customer_segments($1,$2,$3,$4)", [T, E, id(50), JSON.stringify([rows[0], rows[0]])]), /appear once/);
      await assert.rejects(db.query("select public.set_customer_segments($1,$2,$3,$4)", [T, E, id(50), JSON.stringify([{ account: "C1", category: "Unassigned", region: "" }])]), /check/);
      await db.exec("reset role");
      assert.equal((await db.query<{ n: number }>("select count(*)::int as n from public.customers where category is not null")).rows[0].n, 0, "failed batches changed nothing");
      await asUser(4);
      assert.equal((await db.query<{ v: number }>("select public.set_customer_segments($1,$2,$3,$4) as v", [T, E, id(50), JSON.stringify(rows)])).rows[0].v, 2);
      assert.equal((await db.query<{ v: number }>("select public.set_customer_segments($1,$2,$3,$4) as v", [T, E, id(50), JSON.stringify(rows)])).rows[0].v, 2);
      await assert.rejects(db.query("select public.set_customer_segments($1,$2,$3,$4)", [T, E, id(50), JSON.stringify([rows[0]])]), /Idempotency key conflict/);
      await db.exec("reset role");
      assert.equal((await db.query<{ n: number }>("select count(*)::int as n from public.audit_events where operation='customer_segments.set'")).rows[0].n, 1);
    });

    await t.test("breakdown by category, region and customer adds up, with aging buckets and an Unassigned group", async () => {
      await asUser(3);
      const byCategory = await breakdown("category");
      assert.deepEqual(byCategory.rows.map(row => [row.label, row.customers, row.open, row.current, row.d31_60, row.d90_plus, row.disputed, row.share_percent]),
        [["Distributor", 2, "1750.50", "1000.00", "250.50", "500.00", "500.00", "94.62"], ["Unassigned", 1, "99.50", "0.00", "0.00", "0.00", "0.00", "5.38"]]);
      assert.deepEqual([byCategory.total.open, byCategory.total.d1_30, byCategory.total.customers], ["1850.00", "99.50", 3]);
      const byRegion = await breakdown("region");
      assert.deepEqual(byRegion.rows.map(row => [row.label, row.open]), [["Dubai", "1500.00"], ["Sharjah", "250.50"], ["Unassigned", "99.50"]]);
      const drill = await breakdown("customer", "Distributor");
      assert.deepEqual(drill.rows.map(row => [row.label, row.account, row.open]), [["Customer One", "C1", "1500.00"], ["Customer Two", "C2", "250.50"]]);
      assert.deepEqual((await breakdown("customer", "Unassigned")).rows.map(row => row.account), ["C3"]);
      assert.deepEqual((await breakdown("customer", "Distributor", "Sharjah")).rows.map(row => row.account), ["C2"]);
      await assert.rejects(breakdown("salesman"), /Invalid request/);
      const segments = (await db.query<{ v: Record<string, unknown> }>("select public.customer_segments($1,$2) as v", [T, E])).rows[0].v;
      assert.deepEqual(segments, { categories: ["Distributor"], regions: ["Dubai", "Sharjah"], unassigned: 1, customers: 3 });
    });

    await t.test("the customers view renders the breakdown, drill links and maker-only forms", async () => {
      await asUser(3);
      const data = { tenant_id: T, entity_id: E, role: "viewer", customers: [] } as unknown as Snapshot;
      const segments = { categories: ["Distributor"], regions: ["Dubai"], unassigned: 1, customers: 3 };
      const viewer = renderToStaticMarkup(createElement(CustomersView, { data, breakdown: await breakdown("category"), segments }));
      assert.match(viewer, /AED\s1,750\.50/); assert.match(viewer, /94\.62%/); assert.match(viewer, /dimension=customer&amp;category=Distributor/);
      assert.doesNotMatch(viewer, /Apply segments/);
      const maker = renderToStaticMarkup(createElement(CustomersView, { data: { ...data, role: "maker" } as Snapshot, breakdown: await breakdown("customer", "Distributor"), segments }));
      assert.match(maker, /Apply segments/); assert.match(maker, /Filtered to category Distributor/); assert.match(maker, /view=collections/);
    });
  } finally {
    await db.close();
  }
});
