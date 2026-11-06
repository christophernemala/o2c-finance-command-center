# Framer spec

This spec lets the app be rebuilt one-to-one as a Framer prototype. Items marked **(target)** are the agreed design that step 4 of PR #10 builds; they are not in the app yet. Every value comes from `src/app/globals.css` and `src/components/ui`. If a value here and the code disagree, the code wins; fix this file to match.

Frames: **iPhone 375 × 812** (safe areas: top 47, bottom 34) and **Desktop 1440 × 900**.

## Tokens

### Colour

| Token | Light | Dark | Use |
|---|---|---|---|
| `canvas` | `#F3F6FC` | `#0B1220` | Page background |
| `surface` | `#FFFFFF` | `#111A2B` | Cards, sheets, inputs |
| `surface-muted` | `#EEF3FB` | `#182338` | Table headers, hover, skeleton |
| `ink` | `#14243E` | `#E6ECF5` | Primary text |
| `muted` | `#52647D` | `#9FB0C6` | Secondary text, labels |
| `border` | `#DBE5F3` | `#2A3A55` | Hairlines (1 px) |
| `primary` | `#075DCC` | `#5AA2FF` | Accent, focus, active nav |
| Primary button fill | `#075DCC → #2874D8` (135°) | `#2570D6 → #1F6BD1` (135°) | Primary button background |
| `on-primary` | `#FFFFFF` | `#FFFFFF` | Text on primary buttons |
| `primary-soft` | `#E9F1FF` | `#16294A` | Selected chip, eyebrow |
| `link` | `#075DCC` | `#7DB6FF` | Links |
| `success` | `#075DCC` | `#7DB6FF` | Positive status. Currently blue; whether it should be green is still an open decision. |
| `warning` / soft | `#885515` / `#FFF5E5` | `#F2B65A` / `#33260F` | Pending, review |
| `danger` / soft | `#B72D4D` / `#FFF0F3` | `#FF8AA0` / `#3A1622` | Failed, rejected, overdue 90+ |

Measured contrast in dark mode, all at or above AA (4.5:1):

| Pair | Ratio |
|---|---|
| ink on surface | 14.7 |
| muted on surface | 7.9 |
| link on primary-soft | 6.9 |
| white on button | 4.8 |
| status text on soft fills | 7.1–8.2 |

### Type

The typefaces are Inter (body), Calistoga (display headings only) and JetBrains Mono (figures, when shown monospaced).

| Style | Size / line | Weight |
|---|---|---|
| xs (labels, hints) | 12 / 16 | 500 |
| sm (body in tables) | 14 / 20 | 400 |
| base (body) | 16 / 24 | 400 |
| lg (section) | 20 / 28 | 600 |
| xl (page title) | 24 / 32 | 600 |
| kpi | 32 / 37, tabular numerals | 600 |

### Spacing, radius, shadow
- **Spacing** is on an 8 px grid: 4 · 8 · 12 · 16 · 24 · 32.
- **Radius:**

  | Element | Radius |
  |---|---|
  | Panel | 20 |
  | Control | 12 |
  | Pill | 999 |
  | Bottom sheet | 20 at the top corners only |

- **Shadow:**

  | Element | Shadow |
  |---|---|
  | Panel | `0 4 22 #224F8C07`, `0 1 3 #224F8C04` |
  | Sheet | `0 24 64 #0B1A3333` |

- **Tap targets** are at least 44 × 44 on touch. Inputs and buttons are 48 high.

## Components

| Component | Spec |
|---|---|
| **Button** | 48 h, 12/18 padding, radius 12. Primary: gradient fill, `on-primary` text. Secondary: `surface` fill with a 1 px `border`. Danger: `danger` fill. Pressed: scale 0.98 (none with reduced motion). |
| **Input** | Label 14 above; field 48 h, radius 12, 1 px `#9BACC4` border (dark: `#3A4D6D`). Hint 12 `muted` below. Error 12 `danger` with a red border, announced. |
| **Select** | Label 14 above; field 48 h, radius 12, 1 px `#9BACC4` border (dark: `#3A4D6D`). No hint or error state yet. |
| **Card** | `surface`, radius 20, panel shadow. Header 24/20 padding with a bottom hairline: title 16/600, subtitle 14 `muted`, action on the right. |
| **StatTile** | Label 12 `muted`, value kpi 32. Three states: value, with "As of {date}" when a date is supplied; "—" with "Not enough data: {reason}"; "—" with "Couldn't load. Retry" in `danger`. |
| **Badge** | Pill, 12/500, 4/12 padding, soft fill with matching text colour. Positive, pending, failed, info, neutral. |
| **DataTable** (≥ 640 px) | Filter field above, max 360 w. Header row `surface-muted`, 11/600 `muted`. Cells 14/16 padding, hairline between rows. Amount columns right-aligned with tabular numerals. A sortable header shows ↑ or ↓ when active. |
| **DataTable** (< 640 px) | Stacked cards: the primary column first in 16/600, then label/value rows (label `muted` left, value right). Hairline between cards. Never scrolls sideways. |
| **Sheet** | Phone: bottom sheet, full width, top corners 20, max 90 % height, safe-area padding at the bottom. Desktop: centred, 560 w. Header has the title and a 44 × 44 close button. Backdrop `#0B1A3366`. |
| **Toast** | `ink` fill with `surface` text (dark: `surface-muted` with a border), radius 12. Bottom-centre, 64 px above the tab bar on phones, 24 px from the bottom on desktop. Auto-dismisses after 6 s, with a 44 × 44 dismiss button. |
| **EmptyState** | Centred: 40 × 4 `primary` rule, title 16/600, body 14 `muted` max 512 w, optional action. |
| **ErrorState** | Like the empty state; a "Try again" secondary button appears when a retry link is supplied. Copy depends on the kind: forbidden, unavailable or invalid. |
| **Skeleton** | 14 h bars, radius 7, `surface-muted → border` shimmer over 1.4 s. Widths 92 / 78 / 64 %. Static with reduced motion. |
| **Money** | Always shows the ISO code and the currency's own decimals: KWD 1.234, JPY 1,234, AED 1,234.50. Tabular numerals, never wraps. |
| **DateTime** | Timestamps in the supplied entity zone (UTC when none is supplied), with the zone named ("Apr 1, 2026, 1:15 AM GMT+5:30"). Calendar dates are never shifted. |

## Navigation

- **Phone (target):** today the phone shows a collapsible "Workspaces" menu. The target is a bottom tab bar, 56 h plus the bottom safe area, `surface` with a top hairline. Five tabs, each icon 24 above a 11/500 label:
  1. Overview
  2. Receivables
  3. Collections
  4. Agents
  5. More (opens a sheet listing the other views)
- **Desktop:** a 216 w left rail with grouped links. The active link has a `primary-soft` fill and `link` text.
- **Header:** tenant name 12 `muted`, page title xl, and the entity switcher on the right; the currency switcher is **(target)** and arrives with multi-currency in step 3. On phones it stacks.

## Screens

Every data screen has three states: a skeleton while loading, `EmptyState` when there is nothing to show, and `ErrorState` when it fails.

| # | Screen | Phone (375) | Desktop (1440) |
|---|---|---|---|
| 1 | Login | Brand header, then the sign-in card full width | Two columns: product story on the left, card 512 w on the right |
| 2 | Email code / MFA | Single card, 6-digit field with numeric keypad | Same, centred |
| 3 | Overview | Switchers; StatTiles in 2 columns (DSO, overdue, collected this month, open); aging bars (0–30, 31–60, 61–90, 90+); recent activity cards | StatTiles in 4 columns; aging chart and activity side by side |
| 4 | Receivables | Filter, invoice cards; tap opens the invoice Sheet | DataTable: number, customer, due date, days overdue, amount, status |
| 5 | Customer detail (Sheet) | Balance, aging, contacts, promises, remarks, holds, statement PDF | Same content in a 560 w sheet |
| 6 | Collections | Worklist cards by priority; actions in the customer Sheet | Worklist table with a priority rail on the right |
| 7 | Agents | Run list cards; a run streams its steps | Run table plus a step stream panel |
| 8 | Approvals | Cards with Approve or Reject (needs a different person from the maker) | DataTable with inline actions |
| 9 | Settings | Lists for entities (currency, time zone), exchange rates and members | Two-column forms |

Consolidated views show "Converted to {reporting currency} at {rate} on {date}" under every converted figure.
