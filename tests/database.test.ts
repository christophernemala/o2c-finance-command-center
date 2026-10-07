import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Snapshot } from "../src/types/workspace";
import { approvalEvidenceCurrent } from "../src/lib/approval-evidence";
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
test("PostgreSQL finance controls and tenant boundaries", async t => {
  const db=new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema public,auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`);
    await db.exec(await readFile(new URL("../supabase/migrations/202610040001_workspaces.sql",import.meta.url),"utf8"));
    await db.exec(await readFile(new URL("../supabase/migrations/202610050001_insights.sql",import.meta.url),"utf8"));
    await db.exec(`create table auth.mfa_factors(user_id uuid,status text);
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;`);
    await db.exec(await readFile(new URL("../supabase/migrations/202610080001_release_hardening.sql",import.meta.url),"utf8"));
    await db.exec(await readFile(new URL("../supabase/migrations/202610080002_agent_jobs.sql",import.meta.url),"utf8"));
    await db.exec(`create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner_id text);
      alter table storage.objects enable row level security;
      create function storage.foldername(text) returns text[] language sql immutable as $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
      grant usage on schema storage to authenticated,anon;
      grant select,insert,update,delete on storage.objects to authenticated,anon;`);
    await db.exec(await readFile(new URL("../supabase/migrations/202610080003_source_storage.sql",import.meta.url),"utf8"));
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
    const snapshot=async()=> (await db.query<{workspace_snapshot:Snapshot}>(`select public.workspace_snapshot($1,$2,'2026-10-04',0)`,[id(10),id(20)])).rows[0].workspace_snapshot;
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
      const approval=(await snapshot()).approvals[0];
      assert.equal(approval.source_records.customer?.name,"Customer A"); assert.equal(approval.source_records.customer?.account,"A1");
      assert.equal(approval.source_records.bank_line?.reference,"CREDIT"); assert.equal(approval.source_records.bank_line?.booked_at,"2026-10-04");
      assert.equal(approval.source_records.bank_line?.direction,"credit"); assert.equal(approval.source_records.bank_line?.amount,"1000.00");
      assert.equal(approval.captured_versions.bank_line,1); assert.ok(approvalEvidenceCurrent(approval));
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
      const before=(await snapshot()).approvals.find(row=>row.id===id(61))!;
      assert.equal(before.source_records.invoice?.number,"INV-A"); assert.equal(before.source_records.invoice?.open,"1000.00");
      assert.equal(before.source_records.receipt?.residual,"1000.00"); assert.equal(before.captured_versions.invoice,1); assert.ok(approvalEvidenceCurrent(before));
      await asUser(2); await decide(61); await decide(62); await execute(61);
      await assert.rejects(execute(62),/Stale evidence/);
      const stale=(await snapshot()).approvals.find(row=>row.id===id(62))!;
      assert.equal(stale.captured_versions.invoice,1); assert.equal(stale.source_records.invoice?.version,2); assert.equal(approvalEvidenceCurrent(stale),false);
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
    await t.test("direct imports require canonical dates before preserving rows",async()=>{
      await asUser(1);
      const invoice={number:"CANONICAL",account:"A1",customer:"Customer A",issued_at:"2028-02-29",due_date:"2028-03-01",amount:"0.10",currency:"AED"};
      const bank={reference:"CANONICAL-BANK",booked_at:"2028-02-29",direction:"credit",amount:"0.10",currency:"AED"};
      const stage=(kind:string,row:object)=>db.query<{stage_import:string}>(`select public.stage_import($1,$2,$3,'dates.csv',$4::jsonb)`,[id(10),id(20),kind,JSON.stringify([row])]);
      const count=async()=> (await db.query<{count:number}>("select count(*)::integer as count from public.import_batches")).rows[0].count;
      const before=await count();
      for (const value of ["tomorrow","10/11/2026","2026-1-01","2026-10-04T00:00:00Z","2026-02-30","0000-01-01",null,20261004]) {
        await assert.rejects(stage("invoices",{...invoice,issued_at:value}));
        await assert.rejects(stage("invoices",{...invoice,due_date:value}));
        await assert.rejects(stage("bank_lines",{...bank,booked_at:value}));
      }
      assert.equal(await count(),before);
      await db.exec("set datestyle='ISO, DMY'");
      const batch=(await stage("invoices",invoice)).rows[0].stage_import;
      const bankBatch=(await stage("bank_lines",bank)).rows[0].stage_import;
      await asUser(2); await db.exec("set datestyle='ISO, MDY'");
      for(const staged of [batch,bankBatch]) await db.query(`select public.commit_import($1,$2,$3)`,[id(10),id(20),staged]);
      const dates=(await db.query<{issued:string;due:string}>("select issued_at::text as issued,due_date::text as due from public.invoices where number='CANONICAL'")).rows[0];
      assert.deepEqual(dates,{issued:"2028-02-29",due:"2028-03-01"});
      assert.equal((await db.query<{booked:string}>("select booked_at::text as booked from public.bank_lines where reference='CANONICAL-BANK'")).rows[0].booked,"2028-02-29");
    });
    await t.test("approval source evidence is joined independently of invoice pagination",async()=>{
      await db.exec("reset role");
      await db.query(`insert into public.invoices(tenant_id,entity_id,customer_id,number,issued_at,due_date,gross)
        select $1,$2,$3,'Z-'||lpad(n::text,3,'0'),'2026-09-01','2026-10-01',1.00 from generate_series(1,53) n`,[id(10),id(20),id(30)]);
      const invoiceId=(await db.query<{id:string}>("select id from public.invoices where number='Z-053'")).rows[0].id;
      await asUser(1);
      await db.query(`select public.propose_action($1,$2,$3,'allocation','0.10','Reviewed source outside invoice page',$4,$5)`,[id(10),id(20),id(65),invoiceId,receiptId]);
      const current=await snapshot(); const approval=current.approvals.find(row=>row.id===id(65))!;
      assert.equal(current.invoices.length,50); assert.ok(!current.invoices.some(row=>row.id===invoiceId));
      assert.equal(approval.source_records.invoice?.number,"Z-053"); assert.equal(approval.source_records.invoice?.open,"1.00");
      assert.equal(approval.source_records.receipt?.residual,"400.00"); assert.ok(approvalEvidenceCurrent(approval));
    });
    await t.test("agent queue is scoped, idempotent and preserves exact balances without posting",async()=>{
      const queue=(job:number,agent:string)=>db.query(`select public.enqueue_agent_job($1,$2,$3,$4,'2026-10-04')`,[id(10),id(20),id(job),agent]);
      const run=(job:number)=>db.query<{run_agent_job:Record<string,unknown>}>(`select public.run_agent_job($1,$2,$3)`,[id(10),id(20),id(job)]);
      await asUser(3); await assert.rejects(queue(70,"ar"),/Forbidden/);
      await asUser(4); await assert.rejects(queue(70,"ar"),/Forbidden/);
      await asUser(1); await queue(70,"ar"); await queue(70,"ar");
      await assert.rejects(queue(70,"collections"),/Idempotency/);
      const before=(await db.query("select id from public.journals")).rows.length;
      const first=(await run(70)).rows[0].run_agent_job; const replay=(await run(70)).rows[0].run_agent_job;
      assert.deepEqual(first,replay); assert.equal(first.open,"453.20"); assert.equal(first.ledger_posted,false); assert.equal(first.requires_human_review,true);
      for (const [job,agent] of [[71,"collections"],[72,"treasury"]] as const) { await queue(job,agent); const output=(await run(job)).rows[0].run_agent_job; assert.equal(output.agent,agent); assert.equal(output.tenant_id,id(10)); }
      await asUser(2); await assert.rejects(run(70),/Forbidden/);
      await asUser(1); assert.equal((await db.query("select id from public.journals")).rows.length,before);
      await assert.rejects(db.exec("update public.agent_jobs set result='{}'"),/permission denied/);
    });
    await t.test("private source storage enforces tenant, entity, uploader and immutability",async()=>{
      const name=`${id(10)}/${id(20)}/${id(1)}/digest.csv`;
      const put=(path:string,owner=id(1))=>db.query("insert into storage.objects(bucket_id,name,owner_id) values('o2c-source-files',$1,$2)",[path,owner]);
      await asUser(1); await put(name);
      await assert.rejects(put(`${id(11)}/${id(21)}/${id(1)}/other.csv`),/row-level security/);
      await assert.rejects(put(`${id(10)}/${id(21)}/${id(1)}/wrong-entity.csv`),/row-level security/);
      await assert.rejects(put(name,id(2)),/row-level security/);
      await asUser(3); assert.equal((await db.query("select id from storage.objects")).rows.length,1);
      await assert.rejects(put(`${id(10)}/${id(20)}/${id(3)}/viewer.csv`,id(3)),/row-level security/);
      assert.equal((await db.query("update storage.objects set name='changed' returning id")).rows.length,0);
      assert.equal((await db.query("delete from storage.objects returning id")).rows.length,0);
      await asUser(4); assert.equal((await db.query("select id from storage.objects")).rows.length,0);
      await db.exec("reset role; set role anon"); assert.equal((await db.query("select id from storage.objects")).rows.length,0);
    });
    await t.test("enrolled MFA blocks financial RLS and direct RPCs until AAL2",async()=>{
      await db.exec("reset role"); await db.query("insert into auth.mfa_factors values($1,'verified')",[id(1)]);
      await asUser(1); await db.exec(`set request.jwt.claims='{"aal":"aal1"}'`);
      assert.equal((await db.query("select id from public.invoices")).rows.length,0);
      await assert.rejects(snapshot(),/Forbidden/);
      await assert.rejects(proposeReceipt(66),/Forbidden/);
      await db.exec(`set request.jwt.claims='{"aal":"aal2"}'`);
      assert.ok((await snapshot()).invoices.length>0);
      await db.exec("reset role"); await db.query("delete from auth.mfa_factors where user_id=$1",[id(1)]);
    });
    await t.test("audit and journals resist updates even by database owner",async()=>{
      await db.exec("reset role"); await assert.rejects(db.query("update public.audit_events set operation='hidden'"),/append-only/);
      await assert.rejects(db.query("delete from public.journals"),/append-only/);
    });
  } finally { await db.close(); }
});
