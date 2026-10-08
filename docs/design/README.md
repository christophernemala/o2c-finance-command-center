# O2C design handoff — 2026-10-08

- [Figma screen design](https://www.figma.com/design/M1jFrwjc16qDMTpSf3RBI3)
- [FigJam architecture](https://www.figma.com/board/lYiw6zDVRDua7Y6boXR3Jr)
- [Editable SVG source](./o2c-finance-workspace.svg)
- [Architecture Mermaid source](./o2c-cloud-architecture.mmd)

## Screen coverage

Desktop overview, receivables, independent approval review, controlled CSV
import review, and a mobile overview at 390 px width. The board uses the current
light palette from STYLEGUIDE.md: pearl, white, ink, slate, purple and teal.
Inter, Sora and JetBrains Mono map to body, heading and exact-amount typography.

All financial values are unavailable placeholders. No synthetic invoices, users,
companies, approval outcomes or cash balances appear. These are UI specifications;
the screens do not establish provisioned access or live financial operations.

## Source alignment

- Shared surfaces/status/empty states: src/components/ui/index.tsx
- Navigation, scoped workspaces and independent approvals: src/components/workspace.tsx
- CSV validation and review: src/components/import-review.tsx
- Server-validated access and exact snapshot contracts: src/lib/workspace.ts
- Financial commands and private CSV archival: src/app/api/commands/route.ts
- Recorded database analysis jobs: src/app/api/agents/route.ts

The architecture depicts actual Vercel ingress, one Next.js application,
Supabase Auth, PostgreSQL RLS/scoped RPCs, private CSV Storage and Redis sign-in
limits. Agent jobs are durable PostgreSQL records executed/resumed through scoped
RPCs in the request path; there is no separately deployed worker or scheduler.
Google/Microsoft setup and ERP/bank/message adapters are not implied to be connected.

## Editing and implementation limits

Figma created the design file, then blocked use_figma/design-library inspection
because this Starter account reached its MCP call limit. SVG asset upload remains
available and imports the screen board as editable vector node trees.
The fallback is vector artwork, not a native auto-layout component library or
interactive prototype. Preserve the SVG source for text/layout edits.
No Figma plan upgrade, application deployment or finance data migration is included.
