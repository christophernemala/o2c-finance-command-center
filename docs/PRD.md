# Product requirements

## Goal

Help UAE finance teams collect cash faster and with fewer errors. AI agents do the routine receivables work, and every money movement stays under PostgreSQL-enforced controls that auditors can trust.

## Target users

| User | Typical company | What they need |
|---|---|---|
| Credit controller | UAE mid-market distributor, contractor, real-estate or healthcare group, with 200 to 5,000 open invoices | Know who to chase today, have the chasing message drafted, and record promises and disputes |
| AR manager / finance manager | Same | Approve cash matches, emails and credit decisions quickly; see what the agents did |
| CFO / finance director | Same | Cash position, DSO, collection effectiveness and risk at a glance; answers in plain language |
| Administrator | Same | Users, agent schedules and auto-execution limits |

## Core features

| Feature | Status |
|---|---|
| Invoice and bank statement import (CSV), checked independently | Built |
| Cash application with maker/checker approval and journals | Built |
| AI agents for cash application, collections, credit risk and reporting, with a live Agent Console | Built (slice 1) |
| Policy auto-posting of exact cash matches within AED limits approved by two people | Built (slice 1) |
| Copilot over ledger data and uploaded CSV or Excel files | Built (slice 1) |
| AR pack: aging, countback DSO, 30-day CEI, Excel export | Built (slice 1) |
| Collections outbox with approval and email sending (Resend) | Slice 2 |
| Disputes, promises to pay, credit limits and holds, PDF statements | Slice 2 |
| Agent operations: health, agent map, incidents, guardrails | Slice 2 |
| ERP and bank connectors, VAT/TRN fields, e-invoicing readiness | Slice 3 |
| Billing, SSO, Arabic UI, UAE hosting | Slice 4 |

## Success metrics

Measured per pilot customer over 90 days, against the 90 days before they started:

- **DSO:** countback days, down by at least 10%.
- **Cash applied automatically:** at least 60% of bank credits matched exactly and posted under policy, with zero reversals caused by wrong matches.
- **Speed:** median time from bank credit to posted receipt is under 1 business day.
- **Controls:** zero postings without either an independent human checker or an active policy (auditable from `approvals.checker_basis`).
- **Adoption:** 10 paying UAE finance teams before slice 4 starts.

## Non-goals (for now)

- A general ledger, payroll or accounts payable.
- AI that sends customer messages or moves money without an approved policy or a human approval.
- Invented or sample data in the product. Empty states stay empty.
- Any claim of compliance certification, e-invoicing or connectors before they exist.
