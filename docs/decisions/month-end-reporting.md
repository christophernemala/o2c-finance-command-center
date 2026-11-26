# Month-end reporting: snapshot or recalculation?

**Status: unresolved business decision.** This note records the current behavior; it does not select a future policy or change the implementation.

## What happens today

The month-end export route passes the selected period-end date as `p_as_of` to the live report RPCs. `report_ar_pack` and related reporting functions calculate results when the export is requested from the current invoice and allocation records; `lib/ar-pack.ts` validates and formats the workbook but does not persist an immutable close snapshot. In other words, the report is recalculated for the chosen date using the ledger state available at request time.

Relevant code: `src/app/api/export/route.ts`, `postgres/migrations/202610160012_review_hardening.sql` (`report_ar_pack`), and `src/lib/ar-pack.ts`.

## Decision still needed

Finance/product owners should decide whether a finalized month-end export must be reproducible exactly as originally issued, or whether a later export may reflect ledger changes such as late postings, back-dated imports, or corrections. A snapshot policy would need a defined capture point, authorization, correction/restatement handling, retention, and audit trail. A recalculation policy should define how changed results are labelled and communicated.

Until that decision is made, the existing request-time recalculation behavior remains unchanged.
