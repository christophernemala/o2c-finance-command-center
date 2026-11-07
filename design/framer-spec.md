# Framer spec

This spec lets the app be rebuilt one-to-one as a Framer prototype. Items marked **(target)** are agreed design that is not in the app yet; each says which step of PR #10 builds it. Every value comes from `src/app/globals.css` and `src/components/ui`. If a value here and the code disagree, the code wins; fix this file to match.

Frames: **iPhone 375 × 812** (safe areas: top 47, bottom 34) and **Desktop 1440 × 900**.

## Tokens

### Colour

Light mode only (the owner removed dark mode on 2026-11-06). One violet accent on white, no gradients.

| Token | Value | Use |
|---|---|---|
| `canvas` | `#F4F4F6` | Page background |
| `surface` | `#FFFFFF` | Cards, sheets, inputs |
| `surface-muted` | `#F1EFF6` | Table headers, hover, skeleton |
| `ink` | `#16151C` | Primary text |
| `muted` | `#5F5B6B` | Secondary text, labels |
| `border` | `#E2E0E8` | Hairlines (1 px) |
| `primary` | `#6D28D9` | Accent, focus, active nav, primary button fill (solid) |
| `primary-hover` | `#5B21B6` | Hovered primary button |
| `on-primary` | `#FFFFFF` | Text on primary buttons |
| `primary-soft` | `#F3EFFD` | Selected chip, eyebrow |
| `link` | `#6D28D9` | Links |
| `success` / soft | `#16703A` / `#E8F5EC` | Positive status |
| `warning` / soft | `#885515` / `#FFF5E5` | Pending, review |
| `danger` / soft | `#B72D4D` / `#FFF0F3` | Failed, rejected, overdue 90+ |

Measured contrast, all at or above AA (4.5:1):

| Pair | Ratio |
|---|---|
| ink on surface | 18.1 |
| muted on surface | 6.6 |
| link on primary-soft | 6.3 |
| white on button | 7.1 |
| success on surface | 6.2 |

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
  | Panel | 16 |
  | Control | 12 |
  | Pill | 999 |
  | Bottom sheet | 16 at the top corners only |

- **Shadow:**

  | Element | Shadow |
  |---|---|
  | Panel | `0 1 3 #16151C0F`, `0 1 2 #16151C0A` |
  | Sheet | `0 24 64 #16151C33` |

- **Tap targets** are at least 44 × 44 on touch. Inputs and buttons are 48 high.

## Components

| Component | Spec |
|---|---|
| **Button** | 48 h, 12/18 padding, radius 12. Primary: solid `primary` fill, `on-primary` text. Secondary: `surface` fill with a 1 px `border`. Danger: `danger` fill. Pressed: scale 0.98 (none with reduced motion). |
| **Input** | Label 14 above; field 48 h, radius 12, 1 px `#8A8696` border. Hint 12 `muted` below. Error 12 `danger` with a red border, announced. |
| **Checkbox** | 20 × 20, radius 6, 2 px `muted` border on `surface`. Checked: `control-on` fill (`#6D28D9`) with a white tick that scales in over 0.2 s. Adapted from Uiverse.io (MIT). |
| **Switch** | 51 × 31 track, radius 16, 27 px white knob with a soft shadow. Off: `control-off` (`#8A8696`); on: `control-on`. Row is at least 44 h with the label to the right. Adapted from Uiverse.io (MIT). |
| **Spinner** | Ring 1 em, 2 px `currentColor` border with the top quarter open, one turn per 1.2 s. Static with reduced motion. Adapted from Uiverse.io (MIT). |
| **Select** | Label 14 above; field 48 h, radius 12, 1 px `#8A8696` border. No hint or error state yet. |
| **Card** | `surface`, radius 16, panel shadow. Header 24/20 padding with a bottom hairline: title 16/600, subtitle 14 `muted`, action on the right. |
| **StatTile** | Label 12 `muted`, value kpi 32. Three states: value, with "As of {date}" when a date is supplied; "—" with "Not enough data: {reason}"; "—" with "Couldn't load." in `danger`, followed by a "Retry" link only when a retry link is supplied. |
| **Badge** | Pill, 12/500, 4/12 padding, soft fill with matching text colour. Positive, pending, failed, info, neutral. |
| **DataTable** (≥ 640 px) | Filter field above, max 360 w. Header row `surface-muted`, 11/600 `muted`. Cells 14/16 padding, hairline between rows. Amount columns right-aligned with tabular numerals. A sortable header shows ↑ or ↓ when active. |
| **DataTable** (< 640 px) | Stacked cards: the primary column first in 16/600, then label/value rows (label `muted` left, value right). Hairline between cards. Never scrolls sideways. |
| **Sheet** | Phone: bottom sheet, full width, top corners 16, max 90 % height, safe-area padding at the bottom and sides. Desktop: centred, 560 w. Header has the title and a 44 × 44 close button. Backdrop `#16151C66`. |
| **Toast** | `ink` fill with `surface` text, radius 12. Bottom-centre, 64 px above the tab bar on phones, 24 px from the bottom on desktop. Info and success toasts auto-dismiss after 6 s; danger toasts stay until dismissed. The dismiss button is 44 × 44. |
| **EmptyState** | Centred: 40 × 4 `primary` rule, title 16/600, body 14 `muted` max 512 w, optional action. |
| **ErrorState** | Like the empty state; a "Try again" secondary button appears when a retry link is supplied. Copy depends on the kind: forbidden, unavailable or invalid. |
| **Skeleton** | 14 h bars, radius 7, flat `surface-muted` that pulses to 50 % opacity over 1.4 s. Widths 92 / 78 / 64 %. Static with reduced motion. |
| **MoneyText** | `MoneyText value currency`: always shows the ISO code and the currency's own decimals: KWD 1.234, JPY 1,234, AED 1,234.50. Tabular numerals, never wraps. |
| **DateTime** | Timestamps in the supplied entity zone (UTC when none is supplied), with the zone named ("Apr 1, 2026, 1:15 AM GMT+5:30"). Calendar dates are never shifted. |

## Navigation

- **Phone (target):** today the phone shows a collapsible "Workspaces" menu. The target, built in step 4, is a bottom tab bar, 56 h plus the bottom safe area, `surface` with a top hairline. Five tabs, each icon 24 above a 11/500 label:
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
