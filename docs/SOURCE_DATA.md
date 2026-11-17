# Source data for management reporting

The application does not create customer relationships, balances or invoice documents.
Use authorized source-system records. Public UAE company names alone do not establish
that a company is a customer, owes money or received an invoice.

Supply a UTF-8 CSV or XLSX workbook with these exact headers:

`number,account,customer,issued_at,due_date,amount,currency`

- `number`: original invoice identifier, unique in the file.
- `account`: source customer account identifier.
- `customer`: customer legal name as recorded in the source system.
- Dates: actual issue and due dates in YYYY-MM-DD format.
- `amount`: gross, entirely unpaid invoice amount as an exact decimal string.
- `currency`: AED. Do not convert other currencies without a reviewed FX process.

CSV imports are limited to 1 MB; XLSX imports are limited to 8 MB; both are limited to
2,000 data rows and the parser's worksheet bounds. The original bytes, server-selected
CSV/XLSX content type and SHA-256 digest are archived with the staged batch in one
transaction. Partially paid invoices, credit notes, prior allocations and opening-balance
migration need a separately reviewed process; do not substitute outstanding balances
into the gross invoice amount field.

Upload through Import review, inspect rejected rows and control totals, then stage
for an independent authorized reviewer. Committing the reviewed source records creates
customer-linked invoices. Required live Supabase and Redis configuration remains a
separate prerequisite; the application does not fall back to demo records.

Provide original invoice PDFs separately if document presentation is required.
The invoice register does not create a tax invoice and must not be represented as one.
Original invoice attachment storage is not implemented by this reporting change.

## Implemented file paths and ECL detail

The forward migration `202611170001_xlsx_source_archive.sql` aligns immutable archive
limits with the implemented import contract. It does not apply itself to any hosted
database; migration deployment and verification remain setup steps.

The file-adapter registry is in `src/lib/source-adapters.ts`. Today it lists:

- **Open invoices:** CSV/XLSX, exact invoice headers above, bounded preview and
  independent review before operational staging/commit.
- **Bank statement lines:** CSV/XLSX with
  `reference,booked_at,direction,amount,currency`; AED only, and an independent
  review before staging/commit. Debits remain debits.
- **Copilot table analysis:** an attached CSV/XLSX is read for the current Copilot
  conversation; it is not imported into the operational ledger.
- **Customer-level ECL detail analysis:** CSV/XLSX with exact headers
  `account,customer,exposure,pd_percent,lgd_percent,source_provision,currency,source_reference`.
  This is read in the browser only, accepts AED and at most 2,000 rows, and is not
  uploaded, stored or posted. It groups supplied rows by customer and compares a
  simple exposure × PD × LGD arithmetic check with the provided source provision.

For customer detail on a preserved ECL run, its scenario JSON can include the
versioned `o2c.ecl-customer-detail.v1` contract described in the ECL screen. An
aggregate allowance is never allocated across customers. The arithmetic check is
not an IFRS 9 model or accounting conclusion; staging, lifetime PD, discounting,
forward-looking scenarios, overlays and methodology remain source/governance
responsibilities.

This registry is extensible, but does not make arbitrary sources work automatically.
Oracle NetSuite, SAP, other ERP APIs, bank APIs, MT940 and CAMT.053 are not live
connectors. Each requires its own authorized credentials, mapping, source validation,
tests, tenancy boundaries and approval path. Adding a file label alone is not enough.

## Excel report

The authenticated export now contains report scope, full-entity aging totals,
first-page invoice details with aging and operational status, and the source customer
directory. Full-entity totals and exported-row totals are explicitly separate.
The invoice details remain limited to the first 50 records; this is not a complete
invoice listing. Aging uses current recorded balances with the reporting date,
not reconstructed historical balances. Monetary values remain exact decimal text.
