import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
test("PostgreSQL finance controls and tenant boundaries", async t => {
  const db=new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema public,auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`);
    await db.exec(await readFile(new URL("../supabase/migrations/202610040001_workspaces.sql",import.meta.url),"utf8"));
    await db.exec(await readFile(new URL("../supabase/migrations/202610050001_insights.sql",import.meta.url),"utf8"));
    await db.query(`insert into auth.users values ($1),($2),($3),($4)`,[id(1),id(2),id(3),id(4)]);
    await db.query(`insert into public.tenants(id,name) values($1,'Tenant A'),($2,'Tenant B')`,[id(10),id(11)]);
    await db.query(`insert into public.memberships values($1,$2,'admin'),($1,$3,'approver'),($1,$4,'viewer'),($5,$6,'admin')`,[id(10),id(1),id(2),id(3),id(11),id(4)]);
    await db.query(`insert into public.entities(id,tenant_id,name) values($1,$2,'A'),($3,$4,'B')`,[id(20),id(10),id(21),id(11)]);
    await db.query(`insert into public.customers(id,tenant_id,entity_id,account,name) values($1,$2,$3,'A1','Customer A'),($4,$5,$6,'B1','Customer B')`,[id(30),id(10),id(20),id(31),id(11),id(21)]);
    await db.query(`insert into public.invoices(id,tenant_id,entity_id,customer_id,number,issued_at,due_date,gross) values($1,$2,$3,$4,'INV-A','2026-09-01','2026-10-01',1000),($5,$6,$7,$8,'INV-B','2026-09-01','2026-10-01',1000)`,[id(40),id(10),id(20),id(30),id(41),id(11),id(21),id(31)]);
    await db.query(`insert into public.bank_lines(id,tenant_id,entity_id,reference,booked_at,direction,amount) values($1,$2,$3,'CREDIT','2026-10-04','credit',1000),($4,$2,$3,'DEBIT','2026-10-04','debit',1000)`,[id(50),id(10),id(20),id(51)]);
    async function asUser(n:number) { await db.exec("reset role"); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(n)]); await db.exec("set role authenticated"); }
    const proposeReceipt=(command:number,bank=50)=>db.query(`select public.propose_action($1,$2,$3,'receipt','1000.00','Verified bank remittance',null,null,$4,$5)`,[id(10),id(20),id(command),id(bank),id(30)]);
    const decide=(command:number)=>db.query(`select public.decide_action($1,$2,$3,1,'approved')`,[id(10),id(20),id(command)]);
    const execute=(command:number)=>db.query<{execute_action:string}>(`select public.execute_action($1,$2,$3,2)`,[id(10),id(20),id(command)]);
    await t.test("RLS hides other tenants and blocks direct writes",async()=>{
      await asUser(1); const rows=await db.query("select * from public.invoices"); assert.equal(rows.rows.length,1);
      await assert.rejects(db.query(`select public.workspace_snapshot($1,$2,'2026-10-04',0)`,[id(11),id(21)]),/Forbidden/);
      await assert.rejects(db.query("update public.invoices set gross=0"),/permission denied/);
      await assert.rejects(db.query(`select public.workspace_snapshot($1,$2,'2026-10-04',0)`,[id(10),id(21)]),/Forbidden/);
    });
    await t.test("viewer cannot propose; outbound debit cannot create receipt",async()=>{
      await asUser(3); await assert.rejects(proposeReceipt(60),/Forbidden/);
      await asUser(1); await assert.rejects(proposeReceipt(60,51),/cannot be posted/);
    });
    await t.test("same-key proposal retries are idempotent; maker cannot approve; unapproved cannot execute",async()=>{
      await asUser(1); await proposeReceipt(60); await proposeReceipt(60);
      const rows=await db.query("select * from public.approvals"); assert.equal(rows.rows.length,1);
      await assert.rejects(decide(60),/Independent checker/);
      await assert.rejects(execute(60),/Approved current/);
      await assert.rejects(db.query(`select public.propose_action($1,$2,$3,'receipt','999.00','Verified bank remittance',null,null,$4,$5)`,[id(10),id(20),id(60),id(50),id(30)]),/Idempotency/);
    });
    let receiptId="";
    await t.test("independent approval posts once and preserves residual",async()=>{
      await asUser(2); await decide(60); const first=await execute(60); const replay=await execute(60); assert.equal(first.rows[0].execute_action,replay.rows[0].execute_action);
      const receipts=await db.query<{id:string}>("select id from public.receipts"); receiptId=receipts.rows[0].id;
      const journal=await db.query("select * from public.journals"); assert.equal(journal.rows.length,1);
    });
    const proposeAllocation=(command:number)=>db.query(`select public.propose_action($1,$2,$3,'allocation','600.00','Verified invoice allocation',$4,$5)`,[id(10),id(20),id(command),id(40),receiptId]);
    await t.test("competing approved allocations reject stale evidence and cannot overconsume",async()=>{
      await asUser(1); await proposeAllocation(61); await proposeAllocation(62);
      await asUser(2); await decide(61); await decide(62); await execute(61);
      await assert.rejects(execute(62),/Stale evidence/);
      const snap=await db.query<{workspace_snapshot:{totals:{open:string;unapplied:string}}}>(`select public.workspace_snapshot($1,$2,'2026-10-04',0)`,[id(10),id(20)]);
      assert.equal(snap.rows[0].workspace_snapshot.totals.open,"400.00"); assert.equal(snap.rows[0].workspace_snapshot.totals.unapplied,"400.00");
      await asUser(1); await assert.rejects(proposeAllocation(63),/exceeds remaining/);
    });
    await t.test("revoked checker invalidates approved execution",async()=>{
      await asUser(1); await db.query(`select public.propose_action($1,$2,$3,'allocation','100.00','Verified invoice allocation',$4,$5)`,[id(10),id(20),id(64),id(40),receiptId]);
      await asUser(2); await decide(64); await db.exec("reset role"); await db.query("update public.memberships set role='viewer' where user_id=$1",[id(2)]);
      await asUser(1); await assert.rejects(execute(64),/revoked/);
      await db.exec("reset role"); await db.query("update public.memberships set role='approver' where user_id=$1",[id(2)]);
    });
    await t.test("imports preserve exact amounts, deduplicate and commit atomically",async()=>{
      const payload=[{number:"NEW",account:"A1",customer:"Customer A",issued_at:"2026-10-01",due_date:"2026-10-31",amount:"0.10",currency:"AED"}];
      await asUser(1); const stage=()=>db.query<{stage_import:string}>(`select public.stage_import($1,$2,'invoices','source.csv',$3::jsonb)`,[id(10),id(20),JSON.stringify(payload)]);
      const first=await stage(); const second=await stage(); const batch=first.rows[0].stage_import; assert.equal(batch,second.rows[0].stage_import);
      await assert.rejects(db.query(`select public.commit_import($1,$2,$3)`,[id(10),id(20),batch]),/Independent checker/);
      await asUser(2); await db.query(`select public.commit_import($1,$2,$3)`,[id(10),id(20),batch]); await db.query(`select public.commit_import($1,$2,$3)`,[id(10),id(20),batch]);
      await asUser(1); const conflicting=[{...payload[0],number:"ROLLBACK"},payload[0]];
      const conflict=await db.query<{stage_import:string}>(`select public.stage_import($1,$2,'invoices','conflict.csv',$3::jsonb)`,[id(10),id(20),JSON.stringify(conflicting)]);
      await asUser(2); await assert.rejects(db.query(`select public.commit_import($1,$2,$3)`,[id(10),id(20),conflict.rows[0].stage_import]),/duplicate key/);
      const rolled=await db.query("select id from public.invoices where number='ROLLBACK'"); assert.equal(rolled.rows.length,0);
    });
    await t.test("audit and journals resist updates even by database owner",async()=>{
      await db.exec("reset role"); await assert.rejects(db.query("update public.audit_events set operation='hidden'"),/append-only/);
      await assert.rejects(db.query("delete from public.journals"),/append-only/);
    });
  } finally { await db.close(); }
});
