# SKILLS.md — Platform Technical Capabilities

This document describes the technical skills and algorithms embedded in the DHCM Finance Command Center.

---

## 1. IFRS 9 Expected Credit Loss (ECL) Provisioning

### ECL Bucket Matrix

| Bucket | Days Past Due | Provision Rate | IFRS Stage | Logic |
|---|---|---|---|---|
| Current | 0 or not due | 0.25% | Stage 1 | Low-risk current receivable |
| 1-30 | 1 to 30 | 1.00% | Stage 1 | Early overdue provision |
| 31-60 | 31 to 60 | 2.50% | Stage 1 | Increasing collection risk |
| 61-90 | 61 to 90 | 5.00% | Stage 1 | Late stage performing receivable |
| 91-120 | 91 to 120 | 15.00% | Stage 2 | Significant increase in credit risk |
| 121-180 | 121 to 180 | 35.00% | Stage 2 | High risk overdue exposure |
| 180+ | Above 180 | **100.00%** | Stage 2 | Full ECL provision required |

### Key Design Decisions
- The **91-120 day bucket is ECL-only** — it does not appear in normal aging analysis
- **180+ days = 100% provision** — Management override, no partial collection assumed
- ECL and normal aging are **separate logical pipelines** to prevent cross-contamination

---

## 2. Bank Reconciliation Matching Algorithm

### Multi-Criteria Weighted Scoring

The reconciliation engine scores each bank-line × invoice pair using five criteria:

| Criterion | Weight | Matching Method |
|---|---|---|
| Invoice Number | 35% | Fuzzy string match (exact → substring → bigram overlap) |
| Amount | 25% | Ratio tolerance (±0.01 AED = 100%, ±0.1% = 95%, ±5% = 60%, ±20% = 30%) |
| Bank Reference | 20% | Fuzzy string match |
| Customer Name | 10% | Fuzzy string match |
| Customer Number | 10% | Fuzzy string match |

### Match Categories

| Category | Score Range | Action |
|---|---|---|
| **Matched** | ≥80% | Auto-matched, deducted from available pool |
| **Suggested** | 50–79% | Requires manual review |
| **Exception** | <50% (with partial data) | Flagged with specific exception reason |
| **Unmatched** | 0% or no candidates | No matching invoice found |

### Fuzzy Matching Algorithm
1. **Normalise** — Lowercase, strip non-alphanumeric characters
2. **Exact match** → 100%
3. **Substring containment** → 75%
4. **Bigram overlap** — Compute character bigram sets, calculate Jaccard-style overlap percentage

---

## 3. Excel Upload Parser

### Auto-Detection Logic

The parser detects sheet type (bank statement vs. invoice) using column header heuristics:

- **Bank Statement indicators**: "narration", "narrative", "description", "particulars" + "date" + "amount" — without "invoicedate"
- **Invoice indicators**: "invoicenumber" + "invoicedate" or "documentdate" + "amount"

### Column Alias System

The parser maps 60+ common column header variations to standard fields:

- `amount` ← "Amount", "Credit Amount", "Transaction Amount", "Value", etc.
- `customerName` ← "Customer Name", "Customer", "Payer", "Beneficiary", etc.
- `invoiceNumber` ← "Invoice Number", "Invoice No", "INV", "Document Number", etc.
- `bankReference` ← "Bank Reference", "Reference", "Ref", "Statement Ref", etc.

### XLSX Binary Parsing
- Uses `fflate` for ZIP decompression (no additional dependencies)
- Parses `xl/sharedStrings.xml` for string table
- Parses `xl/worksheets/sheet{n}.xml` for cell data
- Supports multi-sheet workbooks

---

## 4. Risk Scoring Algorithm

Customer risk scores are computed from four weighted factors:

| Factor | Points | Condition |
|---|---|---|
| 180+ day exposure | 45 | Any outstanding amount over 180 days |
| Over-90 threshold | 25 | Over-90 outstanding > AED 1,000,000 |
| High provision | 20 | Provision amount > AED 500,000 |
| Active disputes | 10 | Any invoices with "Disputed" status |

### Risk Classification

| Score | Flag | Recommended Action |
|---|---|---|
| ≥70 | **Critical** | Escalate to credit committee and confirm ECL support |
| ≥45 | **High** | Prioritize collector follow-up and proof review |
| ≥20 | **Watch** | Monitor account and request updated payment status |
| <20 | **Normal** | Continue standard collection cycle |

---

## 5. SOA Email Drafting

- **Email address resolution**: SLA directory → Contract → Master Data (fallback chain)
- **Subject line**: "Statement of Account — {Customer Name} — As of {Date}"
- **Body template**: Humanized collection message with outstanding summary and next-action request
- **Attachment**: SOA Excel workbook with customer-specific invoice data

---

## 6. SLA Account Lookup

Queryable by customer account number. Returns:

| Field | Description |
|---|---|
| Payment Terms Days | Contractual payment window |
| Collector Owner | Assigned collections analyst |
| Escalation Owner | Manager escalation contact |
| Credit Limit AED | Maximum open exposure |
| Statement Cadence | Weekly / Biweekly / Monthly |
| Dispute Turnaround Days | SLA for dispute resolution |
| Preferred Attachment | SOA Excel / Invoice PDF / Both |
| Contract Reference | External contract ID |

---

## 7. Visual Chart Components

All charts are **custom SVG/CSS** — no external charting library:

| Component | Type | Key Feature |
|---|---|---|
| `SparklineKpi` | Inline bar chart | 7-bar trend inside KPI card with animated count-up |
| `LineChartPanel` | SVG line + area | Gradient stroke, animated draw-line effect |
| `StackedBarPanel` | Stacked horizontal bars | Multi-bucket aging by business unit |
| `GaugePanel` | SVG semicircle arc | Dynamic fill with threshold colouring |
| `HeatmapPanel` | Color-coded table | 6-level heat scale (green → red) |
| `DonutPanel` | CSS conic-gradient | Percentage display with legend |
| `ChartPanel` | Horizontal bars | Simple bar chart with gradient fill |

---

## 8. IFRS 7 Disclosure

- **BU DSO** — Days Sales Outstanding by business unit
- **Credit risk concentration** — Exposure by customer and aging bucket
- **CEO Control Index** — Composite metric for management review
- **Disclosure cues** — Text-based review notes for auditor consumption
