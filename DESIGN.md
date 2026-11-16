# O2C workspace design contract

Authoritative product interactions. `STYLEGUIDE.md` owns visual conventions. The owner-provided screenshots guide layout and color only; do not copy their brand identity. Finance controls and truthful data boundaries outrank visual similarity.

| Workspace | Required behavior | Acceptance criterion |
|---|---|---|
| Overview | Tenant/entity, AED, retrieval time, KPI definitions/source, multicolour metrics and live chart views | All totals come from one database snapshot and cover the selected entity; missing ECL stays unavailable |
| Global search | Find app areas, actions, KPIs/charts, loaded customer records and matching invoices | Invoice search is authenticated, rate-limited and entity-scoped; malformed data is rejected; keyboard navigation and empty/unavailable states are accessible |
| Customers | Source-system accounts and outstanding balances, grouped by customer/category/region | Never generate company names, TRNs, credit data, or account records; search totals recalculate with exact decimals |
| Receivables | Separate lifecycle, settlement, dispute and collections | Only posted allocations change displayed settlement; no direct close/paid action |
| 13-week cashflow | Approved direct-method forecast, source version, assumptions and confidence lineage | Invoice due dates alone never become a forecast; missing forecast inputs stay unavailable |
| Cash application | Bank direction, receipt, invoice, residual and evidence | Debit bank lines cannot become receipts; conflicting allocations cannot overconsume balances |
| ECL review | Preserved model, exposure, date, scenarios and overlays | Display supplied runs; no invented rates or silently mutable inputs |
| Approval inbox | Maker, checker, exact amount, records and accounting impact | Maker cannot approve; execution requires the same approved version and current authority |
| Customer Copilot | Streamed answers, visible tool usage, attached CSV/XLSX, per-user history | Answers come from tool calls under the user's role; missing AI key/budget is shown, never simulated; pending proposals still require an independent checker |
| AI agents | Agent cards, live step stream, run history with cost, schedules, auto-execution policy | Every step is a database record; proposals wait for a checker unless an independently activated policy posts an exact match within limits |
| Reports | Aging, countback DSO, 30-day CEI, top debtors, KPI inputs and AR pack | Figures and inputs come from governed SQL; unavailable inputs stay unavailable |
| Month-end workbook | Selected month, AR aging, category/region pivot-style sheets, concentration, KPI basis and tie-out checks | Built from authenticated report RPCs and exact decimal strings; explicitly not historical reconstruction, GL close/posting or native interactive Excel PivotTables |
| Import review | CSV/XLSX, worksheet selection, exact mapping, rejected rows, control total, digest and commit state | Formula cells and invalid files cannot stage; independent checker commits preserved rows atomically |
| Audit explorer | Actor, operation, timestamp, affected record and evidence | Domain operations append evidence in the same database transaction |

## Financial and interaction controls

Use authenticated server navigation. Remount tenant/entity forms so a prior file preview cannot cross into another workspace. No monetary records are stored in browser local storage. Independently authorize every protected read/write. Show exact evidence beside actions. Approval remains separate from posting. Do not show success before server confirmation. On uncertain outcomes, reconcile recorded status before retrying. Stale proposals require refreshed evidence.

Use semantic tables, pagination, visible keyboard focus, skip navigation, accessible mobile navigation, and explicit loading, empty, unavailable, forbidden, conflict and success states. A snapshot is not a live stream or a historical ledger report. Global-search query state must not be mistaken for complete coverage when a loaded directory is paginated or capped.

## Remaining production work

This change provides a responsive web app and a synthetic local preview, not a native iOS/Android application or a production launch. Hosted database migration, real source-system integrations, live production credentials/provider setup, historical month-end snapshots, accounting close/posting qualification, interactive Excel PivotTable objects, security review, and production end-to-end verification remain separate work. No hosted financial data or migration is authorized by this change.
