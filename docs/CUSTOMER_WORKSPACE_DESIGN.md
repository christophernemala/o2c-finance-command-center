# Customer workspace and separate bank reconciliation

## Requested product design

The customer workspace must show real invoices, a statement of account,
uploaded customer contracts and commercial proposals. Bank reconciliation must
have its own workspace and navigation entry.

These are recorded requirements and acceptance criteria. This document does not
claim document upload, a complete statement of account, or a customer portal is
already implemented.

## Customer workspace

A customer header shows the authorized company/legal entity, customer identity,
currency and source synchronization status. Only persisted, authorized records
may appear. Unavailable amounts and missing sources are explicit.

The customer workspace has four tabs:

1. **Invoices:** invoice number, issue and due dates, original amount, applied
   receipts, outstanding amount and governed status. Open a verified source
   document when one is actually stored; show its absence otherwise.
2. **Statement of account:** reporting period, validated opening balance,
   invoices, credit notes, receipts, allocations and closing balance, each with
   source references. Download a customer-specific statement only when the
   required source history is complete. The existing first-50-invoice XLSX
   receivables report is not a complete customer statement.
3. **Contracts:** upload, list and open actual customer contract documents.
   Show filename, version, uploader, upload date, effective dates and review
   status. New uploads remain available for authorized review without silently
   replacing a prior version.
4. **Proposals:** upload and view customer commercial proposals separately from
   ledger-affecting approval proposals. Show version, date, owner, status and
   related contract when available. Commercial acceptance does not authorize
   a financial posting.

Contracts and proposals must be visible within the selected customer's
authorized tenant/entity scope. Visibility does not imply a public customer
portal, an unrestricted URL, or automatic email delivery.

## Document handling acceptance criteria

- Store original documents in private cloud object storage with tenant,
  entity and customer authorization enforced server-side and in storage policies.
- The existing private CSV source bucket has a 1 MB CSV-only contract; it must
  not be silently repurposed for PDFs or other customer documents.
- Define a separate document storage contract, allowed formats, size limits,
  version retention and upload validation before enabling the upload control.
- Use authorized short-lived access for document viewing. Deny cross-tenant,
  cross-entity and unrelated-customer access, including direct storage requests.
- Preserve immutable versions and upload/view audit evidence. Do not overwrite
  an accepted contract or fabricate a successful upload.
- Detect and quarantine unsafe content before making files available. Handle
  upload, validation and preview failures explicitly.
- Contract term extraction may create a reviewable suggestion. Only verified
  terms may affect payment terms, credit decisions or financial rules.
- No financial records or documents are persisted in browser local storage.

## Separate bank reconciliation workspace

Use the existing reconciliation route and governed proposal/posting controls.
Its layout contains a bank-statement list, unmatched bank lines, candidate
invoice matches, matching evidence and an independent review queue.

Bank statement import is distinct from customer document upload. Matching must
show the source line, amount, currency, date and invoice references. Ambiguous
or partial matches remain explicit exceptions; confidence is not invented.
Reconciliation, approval and ledger posting remain separate actions.

A customer may link to a related approved receipt or allocation, while bank
reconciliation remains its own navigation destination.

## Statement completeness and money

Keep AED amounts as exact decimal strings and database numeric values. Reconcile
opening balance plus invoice/debit movements less valid credit/receipt movements
to closing balance using preserved ledger/source history and explicit sign
conventions. Record unapplied cash separately and avoid counting a receipt again
as both cash and an invoice allocation.

The current invoice importer accepts entirely unpaid source-system invoices.
Partially paid opening balances, historical allocations and credit notes require
a governed source integration or separately reviewed migration. Until that
history is available, show the statement as incomplete and prohibit claiming it
is a full statement of account.

## Delivery sequence

1. Design the customer tabs and separate reconciliation layout.
2. Define the customer document metadata, private storage policies and upload
   lifecycle against existing customer/tenant/entity structures.
3. Implement actual upload and authorized viewing, with meaningful isolation
   and failure checks.
4. Connect complete statement inputs, calculate exact balances and build the
   customer-specific export.
5. Verify real hosted access, documents, statements and independent financial
   approvals before presenting the features as live.

## Separate receivables aging layout

Provide a dedicated Aging destination within receivables. Its header shows the
authorized company/legal entity, AED currency and explicit as-of date. Customer
and invoice drill-downs use the same scope and reporting date as the totals.

Show mutually exclusive buckets:

- **Not yet due:** invoice due date after the selected as-of date.
- **0–30 days:** due today through 30 days past due.
- **31–60 days:** 31 through 60 days past due.
- **61–90 days:** 61 through 90 days past due.
- **91+ days:** more than 90 days past due.

The 61-day and 91-day boundaries prevent overlap. Never count an invoice in
multiple buckets. Calculate against the due date and preserved outstanding
balance; exclude fully settled invoices and account for valid applied receipts
without duplicating them.

The layout contains a bucket summary, customer-by-bucket table and invoice
detail drawer/list. Selecting a bucket filters the detail while retaining
company/entity scope and the as-of date. Display exact balances and invoice
counts, with total outstanding reconciling to the bucket totals for the same
complete source population. Missing history or source inputs are explicit.

Keep customer document tabs, Aging and Bank reconciliation as separate
navigation destinations. Do not reuse the bank matching screen as the aging
layout. Empty sources produce an empty state rather than sample balances.
