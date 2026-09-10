# AGENTS.md — AI Agent Configuration for DHCM Finance Command Center

## Purpose

Make AI coding agents immediately productive in this O2C finance analytics repository.

## Quick Start

```powershell
npm install
npm run generate:data        # Generate 1,250-row deterministic dataset
npm run workflow:daily       # Run daily workflow (Excel pack generation)
npm run dev                  # Start dev server at http://127.0.0.1:5174
```

## Build & Verify

```powershell
npx tsc --noEmit             # TypeScript type checking
npm run build                # Production build (tsc + vite build)
```

## Repository Layout

```
src/App.tsx                  ← Main monolith: 16 routes, all UI components
src/data/financeModel.ts     ← Central model builder (orchestrates all modules)
src/shared/types.ts          ← All TypeScript interfaces and type aliases
src/styles.css               ← Full design system (glassmorphism, charts, upload)
src/modules/                 ← Feature modules (one folder per domain)
scripts/                     ← Node scripts (data generation, daily workflow)
docs/ARCHITECTURE.md         ← Architecture and module documentation
```

## Module Boundaries

Each module under `src/modules/` is **self-contained** with its own business logic:

| Module | Responsibility |
|---|---|
| `AgingAnalytics` | Normal AR aging (no ECL 120-day bucket) |
| `ARModule` | Oracle Fusion-style invoice status transitions |
| `BankReconciliation` | Bank statement matching with confidence scoring |
| `DashboardRenderer` | Excel workbook export (browser + Node paths) |
| `DataIngestion` | Deterministic mock data generator (1,250 rows) |
| `ECLProvision` | IFRS 9 ECL with 7 buckets; 180+ = 100% provision |
| `EmailDrafting` | SOA email draft generation |
| `ExcelUpload` | .xlsx parser + multi-criteria reconciliation engine |
| `IFRSReporting` | IFRS 7 BU/DSO disclosure cues |
| `InvoiceDocuments` | Invoice PDF queue + payment proof audit |
| `Reminders` | Security cheque, trade license, document reminders |
| `SlaDirectory` | Customer SLA/contract lookup |

## Conventions

- **All components live in `App.tsx`** — this is a single-file React component architecture for this prototype. Extract components only when the file exceeds maintainability limits.
- **TypeScript strict mode** — All types are defined in `src/shared/types.ts`.
- **No external charting libraries** — All charts (Line, Donut, Gauge, Heatmap, Stacked Bar, Sparkline) are custom SVG/CSS components.
- **Excel parsing uses `fflate`** — The existing dependency handles ZIP decompression for .xlsx files. No additional libraries needed.
- **Currency is always AED** — All monetary values use UAE Dirham.
- **Deterministic data** — The mock data generator uses seeded logic for reproducible results.

## Common Pitfalls

- **Don't add charting libraries** (Chart.js, Recharts, etc.) — use the existing custom SVG components.
- **Don't use `pip install`** — this is a Node.js project.
- **Don't modify `node_modules/`** or commit it.
- **Excel generation scripts** (`scripts/`) run in Node, not the browser. Browser Excel export uses `src/modules/DashboardRenderer/browserExcel.ts`.
- **The upload parser** relies on `fflate` for ZIP decompression — don't replace with a different library.

## Design System

- **Dark mode** with glassmorphism (backdrop-filter, semi-transparent borders)
- **Color palette**: Blue (#0f8bff), Cyan (#20e3ff / #69d4ff), Violet (#a78bfa), Green (#10b981), Amber (#f59e0b), Red (#ef4444)
- **Font**: Inter, Segoe UI, system-ui
- **Border radius**: 12–20px
- **Animations**: CSS keyframes for count-up, draw-line, cube-spin, ring rotation

## Maintainers

- Christopher Nemala ([@christophernemala](https://github.com/christophernemala))
