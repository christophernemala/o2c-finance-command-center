# O2C enterprise finance visual system

Use the owner-provided screenshots as the visual reference: a professional finance workspace with a deep navy navigation rail, bright blue active actions, clean white content, compact readable typography, multicolour KPI/chart accents, a visible global search field, and card/table layouts that adapt to phones. The references guide layout and color only; do not copy their product names, logos, or proprietary graphics.

## Palette and hierarchy

| Token | Value | Use |
|---|---|---|
| `--canvas` | `#F4F7FB` | Light page background |
| `--surface` | `#FFFFFF` | Opaque panels, tables, balances and approval evidence |
| `--surface-muted` | `#F5F7FA` | Table headers, inputs and secondary areas |
| `--ink` | `#142033` | Primary text |
| `--muted` | `#66748A` | Secondary text and descriptions |
| `--border` | `#E4E9F0` | Hairlines, cards and table dividers |
| `--primary` / `--link` | `#2165ED` / `#1559D6` | Actions, selected controls, links and focus |
| `--primary-soft` | `#EAF1FF` | Selected states and search focus |
| `--rail` | `#111B2D` | Desktop navigation rail |
| `--rail-text` | `#C1CCDC` | Rail labels; use white for the active item |
| `--chart-1` | `#2165ED` | Blue |
| `--chart-2` | `#20A77A` | Green |
| `--chart-3` | `#8B5CF6` | Violet |
| `--chart-4` | `#E7A232` | Amber |
| `--chart-5` | `#E4637A` | Coral |
| `--chart-6` | `#23A6C5` | Cyan |

The navy rail is a navigation surface, not a page theme. The analytical canvas stays light and uncluttered. Blue remains the primary action color; chart colors only distinguish series and never encode a decision or status by themselves. Green is reserved for server-confirmed success and posted status. Warning and danger colors keep their explicit labels. All amounts remain exact AED decimal strings.

## Brand and typography

The O2C mark combines an ascending ledger/chart motif with restrained blue, mint and amber accents. Use the same product mark in the navigation, sign-in screen, favicon and installable app assets; never use a reference product's identity. Keep the wordmark compact and the rail typography legible.

Use locally bundled Geist for interface text, controls and metric labels; Space Grotesk for page titles and key numbers; JetBrains Mono for exact amounts. The UI baseline is 14px. Use approximately 28–32px for page titles, 20–24px for section titles, 23–28px for KPI values, 12–13px for dense tables, and 10–12px for supporting labels. Do not shrink body copy to fit a fixed desktop mockup. On phones, maintain a readable 12px minimum for dense data and use cards or contained horizontal tables where needed. No monetary truncation, invented metrics or animated balances.

## Layout and components

- Desktop: fixed-width navy left rail with grouped workspaces; white sticky top bar with tenant/entity context, global search and user actions; light report canvas with generous but compact spacing.
- Search: searchable workspaces, actions, KPIs/charts and loaded customer records; authenticated invoice search is limited to the selected legal entity. Provide a labelled combobox, keyboard shortcut, arrow/Enter/Escape behavior, visible focus and a clear no-match/unavailable state.
- Overview: selected-entity context, four to six compact color-coded KPI cards, interactive paired finance-analysis panels and source-backed records. Each KPI retains its definition and source.
- Cards: white surface, subtle hairline and shallow shadow; 16–18px radius. Controls use 10–12px radius. Use an 8px spacing rhythm and 16–24px panel gaps.
- Charts: bar, donut, matrix and exact-figure table modes. Matrix view shows exact value, share and a distribution cell. Every chart has readable labels and exact values; segment selection only focuses data and never confirms an action.
- Tables: semantic headers, sortable/filterable where supported, exact amounts aligned to the right, and visible keyboard focus. Keep scroll within a table or card rather than allowing page-wide horizontal overflow.
- Finance workflow: source evidence remains visible near actions. Preserve maker/checker, current-evidence, approval, and separate posting controls. No design shortcut may auto-approve or post.

## Responsive behavior

On phones, show the O2C mark, entity context and full-width global search in the header. Replace the desktop rail with the safe-area-aware bottom dock for primary destinations and a labelled More menu for all other workspaces. Cards stack vertically; summaries remain readable; tables use labelled record cards or a contained horizontal scroll. Buttons and touch targets are at least 44px high. Respect safe-area insets and reduced-motion preferences.

## Real-work behavior and honest boundaries

Every visible control must have a real selection, destination, export, upload-review or authenticated server action. CSV and XLSX imports share exact source-schema validation, reject formula cells, show row-level errors and control totals, then stage records for independent review; preview alone never commits data. Month-end workbooks are built from authenticated AR, category and region reporting functions and include aging, concentration, KPI basis and exact-decimal tie-outs. They are analysis/support workbooks, not historical reconstructions, GL posting, or native interactive Excel PivotTable objects. Missing records, reports, credentials, providers and integrations remain explicitly unavailable. Respect `prefers-reduced-motion`; visual emphasis must never imply server confirmation.
