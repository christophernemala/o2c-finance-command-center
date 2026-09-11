# O2C Finance Command Center

> **Enterprise O2C Receivables Intelligence Platform** — IFRS 9 ECL provisioning, bank reconciliation, customer risk analytics, Excel upload & reconciliation, and executive KPI dashboards.

---

## ✨ Features

### Core Finance Operations
- **1,250-row deterministic O2C finance dataset** with customer accounts, invoices, GL dates, bank references, and payment audit trails
- **Normal aging analysis** — Current, 1-30, 31-60, 61-90, 91-180, 181-360, 361+ aging buckets
- **IFRS 9 ECL provisioning** — Current, 1-30, 31-60, 61-90, 91-120, 121-180, 180+ buckets with 100% provision logic for 180+ day exposures
- **IFRS 7 disclosure cues** — BU/DSO analysis, CEO control index, and credit-risk concentration
- **Risk account flagging** — Customer-level risk scoring (Critical / High / Watch / Normal) based on overdue exposure, provision, and disputed invoice metrics

### Excel Upload & Reconciliation (New)
- **Drag-and-drop `.xlsx` upload** — Auto-detects bank statement vs. invoice formats using column alias matching
- **Multi-criteria reconciliation engine** — Matches on invoice number, bank reference, amount tolerance, customer name, and customer number with weighted confidence scoring (0–100%)
- **Reconciliation categories** — Matched (≥80%), Suggested (50–79%), Exception (<50%), Unmatched
- **Export reconciliation results** to styled Excel workbooks

### Visual Analytics & KPIs
- **Power BI-style dashboard** — SparklineKpi cards with animated count-up effects and trend indicators (↑ ↓ →)
- **Line Chart** — Collection trend visualization with SVG gradient rendering
- **Stacked Bar Chart** — Aging breakdown by business unit with color-coded buckets
- **Gauge Chart** — Collection efficiency with dynamic SVG arc fill
- **Heatmap Table** — Color-coded customer × aging bucket risk matrix (Top 10)
- **Donut Chart** — Bank match control breakdown with percentage display

### Operations
- **Morning bank reconciliation** with match confidence and exception tracking
- **SOA email draft generation** — Humanized statement-of-account email drafting with SLA/contract email ID lookup
- **SLA account lookup** — Customer account number search for payment terms, collector owner, escalation, and contract preferences
- **Oracle Fusion / SAP S/4HANA integration mapping** — AR invoice workbench, receipt matching, and provision posting handoff
- **Invoice PDF export/import queue** and payment-proof audit dataset
- **Cheque, trade license, and document resubmission reminders**
- **Management review** — Business unit control dashboard with open operational exception tracking

### Excel Export
- **14-sheet daily finance pack** — Total Data Matrix, Aging, Risk Accounts, Unapplied Amounts, IFRS 9 ECL, ECL Policy Matrix, Email Drafts, ECL Summary, SLA Directory, Invoice PDF Queue, Payment Proof Audit, Bank Reconciliation, Reminders, Management Review
- **Individual report downloads** — Each view exports its own styled `.xlsx` workbook
- **Upload reconciliation export** — Reconciliation results from customer-uploaded bank statements

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | React 19 + TypeScript 5 |
| **Build** | Vite 8 |
| **Icons** | Lucide React |
| **Excel** | Custom XLSX writer + `fflate` (ZIP compression/decompression) |
| **Styling** | Vanilla CSS with glassmorphism, gradients, and CSS animations |
| **Charts** | Custom SVG components (Line, Donut, Gauge, Heatmap, Sparkline, Stacked Bar) |
| **Data** | Deterministic local mock generator — no external API dependencies |

---

## 🚀 Local Setup

```powershell
npm install
npm run generate:data
npm run workflow:daily
npm run dev
```

Open `http://127.0.0.1:5174` in your browser.

**Demo credentials** (prefilled): `finance.controller@o2c.local` / `demo123`

---

## 📁 Project Structure

```
o2c-finance-command-center/
├── src/
│   ├── App.tsx                    # Main application (16 routes, all components)
│   ├── main.tsx                   # React entry point
│   ├── styles.css                 # Full design system (glassmorphism, charts, upload zone)
│   ├── data/
│   │   └── financeModel.ts        # Central model builder
│   ├── shared/
│   │   └── types.ts               # TypeScript interfaces and type aliases
│   └── modules/
│       ├── AgingAnalytics/        # Normal AR aging analysis
│       ├── ARModule/              # Oracle-style invoice status transitions
│       ├── BankReconciliation/    # Bank statement matching engine
│       ├── DashboardRenderer/     # Excel workbook export (browser + Node)
│       ├── DataIngestion/         # Deterministic mock data generator
│       ├── ECLProvision/          # IFRS 9 ECL bucket provisioning
│       ├── EmailDrafting/         # SOA email draft generation
│       ├── ExcelUpload/           # ← NEW: Excel upload parser + reconciliation
│       │   ├── excelParser.ts     # .xlsx binary parser with column alias matching
│       │   └── reconciliationEngine.ts  # Multi-criteria matching with confidence scoring
│       ├── IFRSReporting/         # IFRS 7 disclosure cues
│       ├── InvoiceDocuments/      # Invoice PDF queue and payment proof audit
│       ├── Reminders/             # Cheque, trade license, document reminders
│       └── SlaDirectory/          # SLA account lookup
├── scripts/
│   ├── generate-data.ts           # Data generation script
│   └── run-daily-workflow.ts      # Daily workflow automation
├── docs/
│   └── ARCHITECTURE.md            # Architecture and module documentation
├── reports/                       # Generated Excel packs (gitignored)
├── AGENTS.md                      # AI agent configuration
├── SKILLS.md                      # Platform capabilities documentation
├── README.md                      # This file
└── package.json
```

---

## 📊 Navigation Routes

| # | Route | View | Description |
|---|---|---|---|
| 1 | `powerbi` | Power BI Dashboard | Executive KPIs, charts, heatmap, gauge |
| 2 | `upload` | Upload & Reconcile | Drag-and-drop Excel upload + reconciliation |
| 3 | `matrix` | Total Data Matrix | Full transaction matrix (all fields) |
| 4 | `aging` | Aging Analysis | Standard aging register with customer details |
| 5 | `risk` | Risk Accounts | Customer risk flagging with scoring |
| 6 | `unapplied` | Unapplied Amounts | Unallocated invoice and receipt balances |
| 7 | `ecl` | IFRS 9 ECL | ECL provision dashboard with policy matrix |
| 8 | `email` | Email Center | SOA email drafting by customer account |
| 9 | `export` | Export Center | Download individual Excel reports |
| 10 | `sla` | SLA Lookup | Customer SLA and contract profile lookup |
| 11 | `integrations` | Oracle / SAP Center | ERP integration mapping and audit controls |
| 12 | `invoices` | Invoice & Proof Audit | Dummy invoice PDF queue and payment proof |
| 13 | `audit` | Payment Audit | Payment proof audit register |
| 14 | `recon` | Bank Reconciliation | Morning bank statement reconciliation |
| 15 | `reminders` | Reminders | Security cheque and trade license reminders |
| 16 | `review` | Management Review | Executive review with operational exceptions |

---

## 📤 Excel Upload & Reconciliation Flow

1. Navigate to **Upload & Reconcile**
2. **Drag and drop** `.xlsx` bank statement and invoice files into the upload zone
3. The parser auto-detects whether each sheet contains bank statements or invoices using flexible column alias matching
4. Click **Run Reconciliation** to match bank lines against invoices (uploaded + in-memory)
5. View KPI summary (Match Rate, Matched, Suggested, Exceptions)
6. Review the reconciliation detail table with confidence percentages and exception reasons
7. **Export** the reconciliation results to a styled `.xlsx` workbook

### Supported Column Aliases

The parser recognises common column header variations:

- **Bank Statements**: Date, Bank Account, Bank Reference, Invoice Number, Customer Name, Amount, Description, Narration, Narrative, Particulars
- **Invoices**: Invoice Number, Customer Name, Customer Account, Invoice Date, Due Date, Amount, Paid Amount, Outstanding, Balance, Status

---

## 🏗 Deployment

The dashboard shell can deploy to **Vercel** as a static preview:

```powershell
npm run build
```

Excel generation and daily workflows are **local/offline Node processes** by design.

---

## 📜 License

MIT
