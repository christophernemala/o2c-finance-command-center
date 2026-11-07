# Closewise visual system

Updated 2026-11-06 from the owner's explicit request: product renamed Closewise, a
Salesforce-style white workspace with an iOS feel, one violet accent, light mode only
(no dark theme), flat surfaces with no gradients, and the same style for every button,
switch and checkbox. This supersedes the blue liquid-white treatment.

## Brand

The Closewise logo (`design/brand/closewise-logo.png`, supplied by the owner) is the app
icon, favicon and wordmark mark. Icons are generated from it at 64, 180, 192 and 512 px,
plus a maskable 512 px icon with the logo inside the safe zone.

## Colour and materials

| Token | Value | Purpose |
|---|---|---|
| `--canvas` | `#F4F4F6` | Neutral grey workspace |
| `--surface` | `#FFFFFF` | Panels, charts, balances, tables, approval evidence |
| `--surface-muted` | `#F1EFF6` | Table heads, control tracks, secondary surfaces |
| `--ink` | `#16151C` | Main text (18.1:1 on white) |
| `--muted` | `#5F5B6B` | Secondary text (6.57:1 on white, 5.76:1 on surface-muted) |
| `--border` | `#E2E0E8` | Panel divisions |
| `--primary` / `--link` / `--focus` | `#6D28D9` | Actions, selection, links and keyboard focus (7.1:1 on white; white text on it 7.1:1) |
| `--primary-hover` | `#5B21B6` | Hovered primary action |
| `--primary-soft` | `#F3EFFD` | Active controls and selected rows (violet text on it 6.28:1) |
| `--success` | `#16703A` (soft `#E8F5EC`) | Confirmed/posted status, always accompanied by text; green so it never reads as a link or button (6.15:1 on white, 5.48:1 on soft) |
| `--warning` / soft | `#885515` / `#FFF5E5` | Waiting, aging and review |
| `--danger` / soft | `#B72D4D` / `#FFF0F3` | Failure, critical items and credit holds |
| `--control-on` / `--control-off` | `#6D28D9` / `#8A8696` | Checkbox and switch fill and track (both ≥ 3:1 against white) |

Violet is the only accent. Green is used only for the `--success` status, never for actions or
links. Charts use a five-tone violet family with textual legends and exact figures, so colour
never carries a value alone. Buttons share one shape: 12px radius, solid violet or white secondary, 48px tall for actions
(compact table and chart controls use their documented smaller sizes); switches and checkboxes use the same violet. There is no dark mode: the app
declares `color-scheme: light` and the browser theme colour is white.

## Typography, spacing and shape

Use bundled Inter for body, controls and KPI values; Calistoga (400, without synthetic
bold) for page titles and large account-entry headlines; JetBrains Mono for exact
amounts. Panel titles stay Inter semibold. Keep the Closewise wordmark in Inter bold.
The display face never appears in dense tables, buttons or monetary values.
All fonts are locally served with their SIL Open Font Licenses; builds do not fetch fonts. Currency is AED; use `formatAed` and decimal strings. Never abbreviate away
exact amounts or animate a monetary value. Use sentence-case labels and explicit
action names such as “Download daily AR workbook” and “Review allocation proposals”.

- Never truncate monetary values. Use horizontal scrolling for long amount columns.
- Status text accompanies colour; never rely on colour alone, and no colour-only approvals.

Panels: 16px radius; controls: 12–13px; risk cards: 16px. Use a 4/8px spacing rhythm,
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

Buttons use the shared radius and the solid violet action token (no gradients), with
reduced-motion-safe press feedback, visible focus, and separate disabled/secondary states.
Section labels use restrained monospace pills. The dark ink panel is reserved for the
account-entry capability list; financial evidence remains opaque white. Auth artwork is a locally served
Adobe-generated illustration with blank space; all product copy remains real HTML.
The existing interactive bank scene is available from a labeled disclosure.
