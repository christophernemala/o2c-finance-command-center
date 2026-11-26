# Layout guidance

## Desktop composition

The user-provided dashboard reference uses a dark left navigation rail, top search/context bar, greeting/context block, compact KPI cards, chart panels, a right-hand recent-activity column, quick actions, a table and a support strip. The local [STYLEGUIDE.md](../../STYLEGUIDE.md) explicitly adapts those visual facts into a finance workspace: fixed navy rail, white sticky header with entity/search/actions, light analytical canvas, KPI-first layout, responsive charts and data tables.

Adapt the source image's architecture to receivables: Overview, collections, customers, receivables, cash application, approvals and reports are product destinations. Do not copy ConnectHub identity or its social/lead/ticket data. Existing route and navigation evidence: [workspace.tsx](../../src/components/workspace.tsx).

The O2C overview already has selected-entity KPI tiles, a chart explorer, finance quick links, agent governance, an invoice table and review priorities. Improve hierarchy by grouping analysis in the main column and actual recorded activity/readiness/quick actions in a side column at wide widths. Keep that rail stacked below the main content on narrow screens. Source: existing [workspace overview](../../src/components/workspace.tsx) and user-provided reference image.

## Responsive phone composition

The local contract uses the O2C mark, entity context, full-width search, bottom navigation for primary workspaces, and a More menu for the remainder; cards stack and tables use labelled record cards or contained horizontal scroll. Preserve the iOS safe areas, minimum touch-target rules and no page-wide horizontal overflow. Source: [STYLEGUIDE.md](../../STYLEGUIDE.md) and [layout metadata](../../src/app/layout.tsx).

Do not replace the working mobile dock or create a second navigation system without a verified need. Keep the same content order as desktop so core tasks remain easy to find.

## Data layout

- Show the selected tenant/entity, currency, as-of date and report basis near the values.
- Put exact amounts in legible finance surfaces; never truncate balances.
- Keep chart mode controls and exact table/matrix access with the chart. Existing modes: bar, donut, matrix, exact figures. Source: [chart explorer](../../src/components/chart-explorer.tsx) and [STYLEGUIDE.md](../../STYLEGUIDE.md).
- Recent activity must be built from a real authorized audit feed. If empty/unavailable, say so; never invent a timeline.
- Power BI is not connected. Native charts are not a Power BI embed. Show the distinction explicitly.

## Reference limits

The reference screenshot guides layout/color, not brand or finance semantics. The local design contract states that finance controls and truthful data boundaries outrank visual similarity: [DESIGN.md](../../DESIGN.md).