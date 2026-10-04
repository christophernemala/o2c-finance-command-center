# Implemented finance capabilities

The application validates invited accounts, reads tenant-scoped snapshots, stages
bounded source files, and posts independently approved cash-control transactions.

- Aging: current, 1–30, 31–60, 61–90, 90+ days, based on an explicit Dubai calendar date.
- Open AR: posted imported invoice gross less posted allocations.
- Unapplied cash: posted receipt less posted allocations.
- Receipt posting: incoming bank credit only; debit bank, credit unapplied cash.
- Allocation: same customer/entity; debit unapplied cash, credit accounts receivable.
- ECL: review of externally supplied frozen runs; no automatic loss-rate assumptions.
- Agent activity: inspection of recorded external runs; no simulated execution.
- Import: exact string amounts, immutable reviewed payload, two-person commit, atomic conflicts.
- Export: first 50 invoices plus independently labeled full-entity summary metadata.

See `docs/RELEASE.md` for unsupported operations and required live validation.
