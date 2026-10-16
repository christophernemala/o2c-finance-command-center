# O2C liquid white visual system

Updated 2026-10-16 from the owner's explicit request: iOS-inspired liquid white,
blue actions, glass navigation, interactive finance graphics and Framer Motion.
This supersedes the navy/teal treatment. Keep the existing O2C identity and workflows.

## Colour and materials

| Token | Value | Purpose |
|---|---|---|
| `--canvas` | `#F3F6FC` | Cool white workspace |
| `--surface` | `#FFFFFF` | Opaque charts, balances, tables, approval evidence |
| `--surface-muted` | `#EEF3FB` | Table heads, control tracks, secondary surfaces |
| `--ink` | `#14243E` | Main text |
| `--muted` | `#52647D` | Secondary text |
| `--border` | `#DBE5F3` | Panel divisions |
| `--primary` / `--link` | `#075DCC` | Actions, selection, links and keyboard focus |
| `--primary-hover` | `#064DA9` | Hovered primary action |
| `--primary-soft` | `#E9F1FF` | Active controls and acknowledged statuses |
| `--success` | `#075DCC` | Confirmed/posted status, always accompanied by text |
| `--warning` / soft | `#885515` / `#FFF5E5` | Waiting, aging and review |
| `--danger` / soft | `#B72D4D` / `#FFF0F3` | Failure, critical items and credit holds |
| `--glass` | `#FFFFFFC9` | Translucent header and scope controls |

There is no green or teal status/action colour. Charts use a five-tone blue family
with textual legends and exact figures, so colour never carries a value alone.
Glass is reserved for navigation and chrome. Money, evidence and financial forms
remain on opaque white surfaces. Browsers without backdrop-filter keep the white
fallback. Soft background illumination and shallow shadows support hierarchy.

## Typography, spacing and shape

Use bundled Inter for body, controls and KPI values; Calistoga (400, without synthetic
bold) for page titles and large account-entry headlines; JetBrains Mono for exact
amounts. Panel titles stay Inter semibold. Keep the O2C wordmark in Inter bold.
The display face never appears in dense tables, buttons or monetary values.
All fonts are locally served with their SIL Open Font Licenses; builds do not fetch fonts. Currency is AED; use `formatAed` and decimal strings. Never abbreviate away
exact amounts or animate a monetary value. Use sentence-case labels and explicit
action names such as “Download daily AR workbook” and “Review allocation proposals”.

Panels: 20px radius; controls: 12–13px; risk cards: 16px. Use a 4/8px spacing rhythm,
20–24px panel gaps and 16px mobile gutters. Keep tables horizontally scrollable
inside their panel. Main action targets are at least 44px; chart-mode controls
are 36px on desktop and 44px on phones. Focus outlines remain clearly visible.

## Workspace hierarchy

The finance overview is a report canvas: scoped KPI tiles, four working shortcuts,
six interactive analytical tiles, then source records and review priorities.
Charts offer bar, donut and exact-table views, segment selection and exact-value
inspection. They use the full-entity read model, not the first page of invoices.
Customer charts preserve category/region filters and retain the real drill links.

Collections uses account-aging filters on the left, a searchable/sortable outstanding
account table in the centre, and real priorities, follow-ups and licence alerts on
the right. The selected customer workspace contains the existing authenticated
contact, promise, message, credit and approval controls. Account-aging amounts are
whole-account overdue balances grouped by oldest invoice; they are not invoice-age
bucket totals. Six non-overlapping bands replace overlapping 90+/120+/180+ totals.

At narrower widths, the priorities move below the table, aging becomes a card grid,
and navigation collapses into the existing mobile menu. No fixed-width desktop
shell should cause page-level horizontal scrolling.

## Motion and interaction

Framer Motion supports pressed-state feedback, risk-card hover, donut selection
and weekly forecast focus. Motion changes focus and emphasis; it never confirms a
financial write. Respect `prefers-reduced-motion`. Do not animate financial totals,
add decorative loops, or hide initial content behind an entrance animation.

Every visible control has a real destination, selection, export or authenticated
server action. Agents can read, draft and propose; current SQL policies govern any
posting. Confidence percentages alone never authorize an action. Missing forecasts,
health methodologies, provider setup and source records stay explicitly unavailable.

## Minimalist modern refinement

Retain the existing Apple-blue palette; the external reference does not replace it.
Use shared radius and action-gradient tokens for buttons, with reduced-motion-safe
press feedback, visible focus, and separate disabled/secondary states. Section labels
use restrained monospace pills. Dark navy is reserved for the account-entry capability
panel; financial evidence remains opaque white. Auth artwork is a locally served
Adobe-generated illustration with blank space; all product copy remains real HTML.
The existing interactive bank scene is available from a labeled disclosure.
