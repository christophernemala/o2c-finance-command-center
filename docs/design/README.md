# O2C design sources

## Slice 2 prototype (agent operations, collections) — awaiting owner approval
[slice2-prototype.html](slice2-prototype.html) is the interactive prototype, also published at https://claude.ai/artifact/QHec351kb1r7qBWU3TYnsw.
Every figure in it is invented sample data labelled "Prototype data". It is a design reference only and is never loaded by the app.
[SLICE2_PLAN.md](SLICE2_PLAN.md) is the approved build plan: Phase B (guardrails, incidents, collections, credit, PDF statements) starts after the prototype is approved.

## Latest complete screen-source handoff
[Browser gallery](index.html) · [Unified audit and completion backlog](../UNIFIED_AUDIT.md) · [Current cloud workflow](../CLOUD_WORKFLOW.md).
Open index.html from a cloud checkout/static preview; GitHub's file view does not execute HTML.

The 10 files under screens/ contain 18 editable SVG screens: eight customer screens; aging, collections, cashflow and ECL plus mobile aging; reconciliation, independent approval, imports and agent/audit plus mobile reconciliation.
All text and vectors remain editable. They contain no fabricated customer records or balances.
Typography follows source Inter, Sora 600 and JetBrains Mono; palette is the current light workspace.

Customer screens cover directory, account/invoices, true-source invoice issuance review, full SOA, contracts/proposals, document upload review, identity mapping and mobile.
Fundora references inform table/filter and guided drawer structure. ConnectHub informs workbench grouping. TaxAid informs broader finance module planning, not dark-theme adoption.

## Verification and limitations
Agents performed XML/structural validation. Final browser visual inspection remains pending.
SVG handoff is complete as source coverage, not native Figma component assembly or production implementation.
Figma file inspection succeeded, but library discovery returned the Starter MCP limit. Native editing was stopped rather than claiming completion.

Existing five-screen board: https://www.figma.com/design/M1jFrwjc16qDMTpSf3RBI3?node-id=2-2
Historical architecture board (prior Supabase direction): https://www.figma.com/board/lYiw6zDVRDua7Y6boXR3Jr
Original source board: o2c-finance-workspace.svg.
Existing architecture source: o2c-cloud-architecture.mmd.

Read ../CUSTOMER_WORKSPACE_DESIGN.md before implementation. Existing invoice CSV imports do not issue new invoices; the first-50 export is not a full customer SOA. Private PDF/contract storage and real issuance remain pending.
