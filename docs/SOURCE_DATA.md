# Source data for management reporting

The application does not create customer relationships, balances or invoice documents.
Use authorized source-system records. Public UAE company names alone do not establish
that a company is a customer, owes money or received an invoice.

Supply a UTF-8 CSV with these exact headers:

`number,account,customer,issued_at,due_date,amount,currency`

- `number`: original invoice identifier, unique in the file.
- `account`: source customer account identifier.
- `customer`: customer legal name as recorded in the source system.
- Dates: actual issue and due dates in YYYY-MM-DD format.
- `amount`: gross, entirely unpaid invoice amount as an exact decimal string.
- `currency`: AED. Do not convert other currencies without a reviewed FX process.

Each file is limited to 1 MB and 2,000 records. Partially paid invoices, credit notes,
prior allocations and opening-balance migration need a separately reviewed process;
do not substitute outstanding balances into the gross invoice amount field.

Upload through Import review, inspect rejected rows and control totals, then stage
for an independent authorized reviewer. Committing the reviewed source records creates
customer-linked invoices. Required live Supabase and Redis configuration remains a
separate prerequisite; the application does not fall back to demo records.

Provide original invoice PDFs separately if document presentation is required.
The invoice register does not create a tax invoice and must not be represented as one.
Original invoice attachment storage is not implemented by this reporting change.

## Excel report

The authenticated export now contains report scope, full-entity aging totals,
first-page invoice details with aging and operational status, and the source customer
directory. Full-entity totals and exported-row totals are explicitly separate.
The invoice details remain limited to the first 50 records; this is not a complete
invoice listing. Aging uses current recorded balances with the reporting date,
not reconstructed historical balances. Monetary values remain exact decimal text.
