# Synthetic O2C test data

This pack contains fictional test records for the O2C Finance Command Center. It is not a real company, customer ledger, bank statement, remittance, or accounting record. Do not load it into a real customer workspace or production database.

## What is included

- `invoices.csv`: 40 fictional unpaid AED invoices across 8 clearly synthetic customer accounts, with due dates spanning all five aging bands.
- `bank-lines.csv`: 12 fictional statement lines, including incoming credits and outgoing debits. A debit must never be treated as a receipt.
- The local preview also shows three pending, fictional receipt proposals. Those proposals are UI-only examples and are not included in the CSV files or posted to any ledger.

The sample date is 15 November 2026. Names, account numbers, invoice references, dates, and balances are invented. No UAE registration number, tax number, or real bank details are represented.

## Safest way to inspect the app

1. Run `npm run dev`.
2. Open `http://127.0.0.1:5174/preview` on the same computer. The preview is development-only, read-only, and labelled throughout; the server returns not found for this route in production.
3. Open the **Agents** workspace to see the control model. The demo makes no AI provider calls, simulates no AI results, and exposes no maker, checker, or posting controls.
4. Run `npm test` to test the real CSV parser and migrations against a disposable in-memory PGlite database. The test exercises maker/checker `stage_import` → `commit_import`, then submits and approves one fictional receipt and a partial allocation to verify open balances and unapplied cash. The database is closed after the test. It does not connect to Supabase or another hosted database.

The CSVs are provided so the application's importer can be exercised in a dedicated local test tenant when needed. Do not use them to seed a live or shared tenant. The preview's pending proposals are visual fixtures only; no financial action has been submitted or posted from the preview. The receipt and allocation exercised by `npm test` exist only inside the disposable in-memory database.
