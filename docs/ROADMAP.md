# Roadmap: from foundation to sellable UAE SaaS

Each slice ships independently. A slice counts as done only when its controls are
enforced in PostgreSQL and tested. UI-only is not done.

## Slice 1: agent runtime, copilot, AR pack (this release)
- [x] Claude tool-use runtime with a separate agent identity, run-bound sessions and recorded steps
- [x] Agent Console: live run stream, history, cost, schedules, auto-execution policy
- [x] Policy auto-posting of exact cash matches within independently approved AED limits
- [x] Copilot with streamed answers, scoped tools, CSV and .xlsx analysis
- [x] AR pack: aging, countback DSO, 30-day CEI, concentration; .xlsx export

## Slice 2: collections and credit operations (built in PR #6; not live-verified)
- [x] Collections outbox with reminder/firm/final-notice tones by age; email (Resend), SMS and
  WhatsApp replies (Twilio); independent approval before every send
- [x] Dispute flags, credit and debit notes with maker/checker; promise-to-pay capture and
  broken-promise detection
- [x] Credit limits (maker/checker) and credit holds (agents propose, humans place and release);
  holds do not block ERP orders until a connector exists
- [x] Statement of account PDF per customer
- [ ] Editable message templates per aging stage; WhatsApp approved templates and delivery receipts

## Slice 3: data in and compliance
- Connectors: Oracle Fusion AR, SAP S/4, Zoho Books, Odoo (pull invoices,
  customers and receipts; push approved applications)
- Bank statements: MT940 and CAMT.053; payer-name matching tier
- UAE VAT: TRN capture and validation (15 digits), 5% VAT fields
- UAE e-invoicing readiness (Peppol PINT-AE through an accredited service provider).
  Confirm the current Ministry of Finance / FTA mandate dates before committing to customers.

## Slice 4: commercial SaaS
- PDPL and data-processing review; finalise the privacy policy wording (draft page exists)
- Tenant self-onboarding, subscription billing, usage metering (AI cost per tenant is already recorded)
- SSO (Entra ID, Google Workspace), SCIM
- Arabic UI and bilingual documents. Layouts already use logical properties.
- UAE data residency (for example AWS me-central-1 or Azure UAE North for PostgreSQL),
  backup and DR runbooks, an external immutable audit archive
- Independent penetration test, UAE PDPL review, then a SOC 2 Type I readiness assessment

## Why this order

Buyers in the UAE mid-market (distribution, contracting, real estate, healthcare
groups) pay first for **cash applied faster** and **overdue reduced**. Slice 2
monetises the agents with outbound collections. Slice 3 removes CSV friction,
which is the main objection in a pilot. Slice 4 is what enterprise procurement
asks for.
