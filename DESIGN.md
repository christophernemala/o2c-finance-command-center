# O2C workspace design contract

Authoritative product interactions. `STYLEGUIDE.md` owns visual conventions.
External galleries are references; they do not override finance controls.

| Workspace | Required behavior | Acceptance criterion |
|---|---|---|
| Overview | Tenant/entity, AED, retrieval time, KPI definitions and source | All totals come from one database snapshot and cover the full entity; missing ECL stays unavailable |
| Customers | Source-system account name and reference within the selected entity | Never generate company names, TRNs, credit data, or account records |
| Receivables | Separate lifecycle, settlement, dispute and collections | Only posted allocations change displayed settlement; no direct close/paid action |
| 13-week cashflow | Approved direct-method forecast, source version, assumptions and confidence lineage | Invoice due dates alone never become a forecast; missing forecast inputs stay unavailable |
| Cash application | Bank direction, receipt, invoice, residual and evidence | Debit bank lines cannot become receipts; conflicting allocations cannot overconsume balances |
| ECL review | Preserved model, exposure, date, scenarios and overlays | Display supplied runs; no invented rates or silently mutable inputs |
| Approval inbox | Maker, checker, exact amount, records and accounting impact | Maker cannot approve; execution requires the same approved version and current authority |
| Copilot | Streamed answer, visible tool usage, attached files, per-user history | Answers come from tool calls under the user's role; missing AI key is shown, never simulated |
| AI agents | Agent cards, live step stream, run history with cost, schedules, auto-execution policy | Every step is a database record; proposals wait for a checker unless an independently activated policy posts an exact match within limits |
| Reports | Aging, countback DSO, 30-day CEI, top debtors, KPI inputs, .xlsx pack | Figures and their inputs come from one SQL routine; unavailable inputs stay unavailable |
| Import review | Exact mapping, rejected rows, control total, digest and commit state | Invalid files cannot stage; independent checker commits preserved rows atomically |
| Audit explorer | Actor, operation, timestamp, affected record and evidence | Domain operations append evidence in the same database transaction |

The owner-approved visual direction is liquid white with iOS blue actions and glass
navigation, as defined in `STYLEGUIDE.md`. Finance values and approval evidence stay
on opaque surfaces. Chart selection changes analytical focus only. Collection risk
filters classify whole accounts by their oldest unpaid invoice; invoice aging charts
remain separate and use non-overlapping invoice balance bands.

Scope switches use authenticated server navigation. Remount tenant/entity client
forms so a previous file preview cannot cross into the new workspace. No monetary
records are stored in local storage. Independently authorize every protected read/write.

Show the exact financial evidence beside actions. Approval is separate from posting.
Do not show success before server confirmation. On an uncertain outcome, reconcile
recorded status before retrying. Stale proposals require refreshed evidence.

Use semantic tables, pagination, visible keyboard focus, skip navigation, accessible
mobile navigation, and explicit loading, empty, unavailable, forbidden, conflict and
success states. A snapshot is not a live stream or a historical ledger report.
