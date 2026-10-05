# Governed cash-flow inputs

Apply both migrations in filename order. `cashflow_runs` stores a preserved approved
AED forecast supplied by a trusted integration/database administrator; application
roles can only read it through tenant RLS. There is no forecast upload/approval UI or
connected source adapter in this change. Do not populate this table with examples.

Each run contains tenant/entity IDs, `starts_on`, exact signed `opening_cash`, scenario,
model version, the actual source document's SHA-256 digest, independent maker/checker
Auth IDs, approval timestamp, approval evidence, and a preserved `entries` JSON array.
The insert trigger checks that maker and checker hold appropriate roles in the same
tenant. Updates/deletes are rejected. Application roles cannot directly insert runs.
Trusted ingestion must verify source authenticity and record an audit event in the
same transaction; a digest-shaped string is not proof that a source was verified.

Each entry requires:

| Field | Contract |
| --- | --- |
| id | Unique source movement identifier within the run; 1–200 characters |
| date | ISO date within starts_on through starts_on + 90 days, inclusive |
| direction | in or out |
| category | operating, investing, or financing |
| amount | Positive AED decimal **string**, at most 13 integer digits and 2 fractional digits |
| source_reference | Actual remittance, contract, payable, or other reviewed evidence |

Use at most 2,000 movements. A zero-movement run is valid only when the real reviewed
scenario has no projected movements; missing data must not become a zero forecast.
Opening cash must be reconciled cash at the start of week 1. Invoice due dates are
not payment commitments. PDC dates, delays, credit scores, and promises require
source evidence and an approved methodology before becoming forecast assumptions.

Optional confidence requires both `confidence_percent` (0–100) and a documented
`confidence_method`. The requested avgDelay*0.7 + creditScore*0.3 formula combines
unlike units and is not applied as a probability.

The latest approved run covering the current Dubai date is displayed. Future and
expired horizons are unavailable. Weeks remain anchored to the recorded start date;
the UI explicitly warns when a preserved run has not been rebased to today's cash.
Receipts/payments are unweighted cash amounts. Decimal.js preserves exact cents and
negative closing cash. SVG scaling uses only dimensionless ratios; the table is the
authoritative numerical presentation. This projection does not execute cash movements.
