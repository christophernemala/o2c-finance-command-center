import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FinanceWorkspace } from "../src/components/workspace";
import { workspaces, type Snapshot } from "../src/types/workspace";
// Disposable UI fixtures only: never exposed through production routes.
const tenant="00000000-0000-4000-8000-000000000010"; const entity="00000000-0000-4000-8000-000000000020";
const empty:Snapshot={tenant_id:tenant,entity_id:entity,as_of:"2026-10-04",fetched_at:"2026-10-04T12:00:00Z",role:"viewer",
  invoices:[],receipts:[],bank_lines:[],approvals:[],customers:[],ecl_runs:[],agent_runs:[],imports:[],audit:[],
  totals:{gross:"0.00",open:"0.00",unapplied:"0.00",allowance:null,invoice_count:0,pending_count:0},page:0,has_more:false};
const props={memberships:[{tenant_id:tenant,tenant_name:"Test tenant",role:"viewer" as const}],entityOptions:[{id:entity,name:"Test entity",currency:"AED" as const}],userId:"viewer",email:"viewer@example.invalid"};
test("every workspace renders honest empty states and visible authenticated scope",()=>{
  for(const view of workspaces) {
    const html=renderToStaticMarkup(createElement(FinanceWorkspace,{...props,data:empty,view}));
    assert.match(html,/Test tenant/);assert.match(html,/Test entity/);assert.match(html,/Verified snapshot/);
    assert.doesNotMatch(html,/demo123|Offline local data|1,250|Math.random/);
    if(view==="overview") assert.match(html,/Unavailable/);
    if(view==="reconciliation") assert.doesNotMatch(html,/Submit for approval/);
    if(view==="agents") assert.match(html,/No agent runtime is connected/);
  }
});
test("maker cannot see approval controls for their own proposal",()=>{
  const data:Snapshot={...empty,role:"admin",approvals:[{id:"proposal",kind:"receipt",amount:"100.00",maker:"maker",approver:null,status:"pending",invoice_id:null,receipt_id:null,bank_line_id:"bank",customer_id:"customer",evidence:"Actual bank evidence reference",created_at:empty.fetched_at,version:1}]};
  const html=renderToStaticMarkup(createElement(FinanceWorkspace,{...props,userId:"maker",data,view:"approvals"}));
  assert.match(html,/different authorized user/);assert.doesNotMatch(html,/Approve this proposal/);assert.doesNotMatch(html,/Post approved receipt/);
});
test("independent checker sees exact accounting evidence before approval",()=>{
  const data:Snapshot={...empty,role:"approver",approvals:[{id:"proposal",kind:"allocation",amount:"100.00",maker:"maker",approver:null,status:"pending",invoice_id:"invoice",receipt_id:"receipt",bank_line_id:null,customer_id:null,evidence:"Actual remittance reference",created_at:empty.fetched_at,version:3}]};
  const html=renderToStaticMarkup(createElement(FinanceWorkspace,{...props,userId:"checker",data,view:"approvals"}));
  assert.match(html,/Approve this proposal/);assert.match(html,/Debit unapplied cash \/ credit accounts receivable/);assert.match(html,/Actual remittance reference/);assert.match(html,/version 3/);assert.doesNotMatch(html,/Post approved allocation/);
});
