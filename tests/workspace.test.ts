import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FinanceWorkspace } from "../src/components/workspace";
import { workspaces, type Approval, type Snapshot } from "../src/types/workspace";
// Disposable UI fixtures only: never exposed through production routes.
const tenant="00000000-0000-4000-8000-000000000010"; const entity="00000000-0000-4000-8000-000000000020";
const empty:Snapshot={tenant_id:tenant,entity_id:entity,as_of:"2026-10-04",fetched_at:"2026-10-04T12:00:00Z",role:"viewer",
  insights: { charts: [], forecast: null },
  invoices:[],receipts:[],bank_lines:[],approvals:[],customers:[],ecl_runs:[],agent_runs:[],imports:[],audit:[],
  totals:{gross:"0.00",open:"0.00",overdue:"0.00",unapplied:"0.00",allowance:null,dso_days:null,cei_percent:null,invoice_count:0,pending_count:0},page:0,has_more:false,
  pagination: { invoices: false, receipts: false, bank_lines: false, approvals: false, ecl_runs: false, agent_runs: false, imports: false, audit: false }};
const props={memberships:[{tenant_id:tenant,tenant_name:"Test tenant",role:"viewer" as const}],entityOptions:[{id:entity,name:"Test entity",currency:"AED" as const}],userId:"viewer",email:"viewer@example.invalid"};
const proposal: Approval = { id: "proposal", kind: "allocation", amount: "100.00", maker: "maker", approver: null, status: "pending",
  invoice_id: "invoice", receipt_id: "receipt", bank_line_id: null, customer_id: null, evidence: "Actual remittance reference", created_at: empty.fetched_at, version: 3,
  captured_versions: { invoice: 4, receipt: 2, bank_line: null },
  source_records: {
    customer: { id: "customer", name: "Reviewed customer", account: "AC-123" },
    invoice: { id: "invoice", number: "INV-123", customer_id: "customer", customer: "Reviewed customer", due_date: "2026-10-01", gross: "500.00", open: "200.00", lifecycle: "posted", version: 4 },
    receipt: { id: "receipt", reference: "FT-123", customer_id: "customer", amount: "300.00", residual: "150.00", version: 2 },
    bank_line: { id: "bank", reference: "FT-123", booked_at: "2026-10-04", direction: "credit", amount: "300.00", version: 2 },
  },
};
test("every workspace renders honest empty states and visible authenticated scope",()=>{
  for(const view of workspaces) {
    const html=renderToStaticMarkup(createElement(FinanceWorkspace,{...props,data:empty,view}));
    assert.match(html,/Test tenant/);assert.match(html,/Test entity/);assert.match(html,/Verified snapshot/);
    assert.doesNotMatch(html,/demo123|Offline local data|1,250|Math.random/);
    if(view==="overview") assert.match(html,/Unavailable/);
    if(view==="cashflow") assert.match(html,/No approved 13-week forecast/);
    if(view==="customers") assert.match(html,/No customers in this entity/);
    if(view==="reconciliation") assert.doesNotMatch(html,/Submit for approval/);
    if(view==="agents") assert.match(html,/No external domain activity is connected/);
  }
});
test("overview does not invent DSO, CEI, forecasts, or UAE customer records",()=>{
  const html=renderToStaticMarkup(createElement(FinanceWorkspace,{...props,data:empty,view:"overview"}));
  assert.match(html,/DSO/);assert.match(html,/CEI/);assert.doesNotMatch(html,/42 days|87\.3%|AL FUTTAIM|AL GHURAIR/);
});
test("maker cannot see approval controls for their own proposal",()=>{
  const data:Snapshot={...empty,role:"admin",approvals:[proposal]};
  const html=renderToStaticMarkup(createElement(FinanceWorkspace,{...props,userId:"maker",data,view:"approvals"}));
  assert.match(html,/different authorized user/);assert.doesNotMatch(html,/Approve this proposal/);assert.doesNotMatch(html,/Post approved receipt/);
});
test("independent checker sees exact accounting evidence before approval",()=>{
  const data:Snapshot={...empty,role:"approver",approvals:[proposal]};
  const html=renderToStaticMarkup(createElement(FinanceWorkspace,{...props,userId:"checker",data,view:"approvals"}));
  assert.match(html,/Approve this proposal/);assert.match(html,/Debit unapplied cash \/ credit accounts receivable/);assert.match(html,/Actual remittance reference/);assert.match(html,/version 3/);assert.doesNotMatch(html,/Post approved allocation/);
  for (const text of ["Reviewed customer", "AC-123", "INV-123", "FT-123", "2026-10-04", "credit", "captured 4", "captured 2", "200.00", "150.00"]) assert.ok(html.includes(text), text);
  const button=html.match(/<button[^>]*>Approve this proposal<\/button>/)?.[0];
  assert.ok(button); assert.doesNotMatch(button,/disabled=/);
});
test("missing or stale source evidence disables approval and posting", () => {
  for (const changed of [
    { ...proposal, source_records: { ...proposal.source_records, bank_line: null } },
    { ...proposal, source_records: { ...proposal.source_records, invoice: { ...proposal.source_records.invoice!, version: 5 } } },
    { ...proposal, source_records: { ...proposal.source_records, receipt: { ...proposal.source_records.receipt!, residual: "99.99" } } },
    { ...proposal, source_records: { ...proposal.source_records, customer: { ...proposal.source_records.customer!, id: "wrong" } } },
  ]) {
    const pending = renderToStaticMarkup(createElement(FinanceWorkspace,{...props,userId:"checker",data:{...empty,role:"approver",approvals:[changed]},view:"approvals"}));
    assert.match(pending,/Source evidence is missing or changed/); assert.match(pending,/value="approve" disabled=""/);
    const approved = renderToStaticMarkup(createElement(FinanceWorkspace,{...props,userId:"checker",data:{...empty,role:"approver",approvals:[{...changed,status:"approved"}]},view:"approvals"}));
    assert.match(approved,/disabled="">Post approved allocation/);
  }
});
test("receipt approval includes bank and customer evidence with its captured bank version", () => {
  const receipt: Approval = { ...proposal, kind: "receipt", amount: "300.00", invoice_id: null, receipt_id: null, bank_line_id: "bank", customer_id: "customer",
    captured_versions: { invoice: null, receipt: null, bank_line: 2 }, source_records: { ...proposal.source_records, invoice: null, receipt: null } };
  const html = renderToStaticMarkup(createElement(FinanceWorkspace,{...props,userId:"checker",data:{...empty,role:"approver",approvals:[receipt]},view:"approvals"}));
  for (const text of ["FT-123", "2026-10-04", "AC-123", "Reviewed customer", "Current 2 · captured 2", "300.00"]) assert.ok(html.includes(text));
  const button=html.match(/<button[^>]*>Approve this proposal<\/button>/)?.[0];
  assert.ok(button); assert.doesNotMatch(button,/disabled=/);
});
test("pagination follows the active collection and omits nonpaginated workspaces", () => {
  const data = { ...empty, has_more: true, pagination: { ...empty.pagination, audit: true } };
  const render = (view: typeof workspaces[number], snapshot = data) => renderToStaticMarkup(createElement(FinanceWorkspace,{...props,data:snapshot,view}));
  for (const view of ["receivables", "overview", "customers", "cashflow", "approvals"] as const) assert.doesNotMatch(render(view),/>Next<\/a>/);
  assert.match(render("audit"),/>Next<\/a>/);
  assert.match(render("receivables", { ...data, pagination: { ...data.pagination, invoices: true } }),/>Next<\/a>/);
  for (const view of ["customers", "cashflow"] as const) assert.doesNotMatch(render(view, { ...data, page: 1 }),/>Previous<\/a>/);
});
