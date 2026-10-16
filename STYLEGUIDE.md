# O2C visual system

Original O2C product design. Do not copy third-party branding or assets.
Approved 2026-10-16: deep ink navy with a single teal action colour. This replaces the
earlier purple palette and the Inter/Sora type pairing entirely.

## Colour tokens

Semantic CSS variables in `src/app/globals.css` map into Tailwind utilities. Components
use tokens only; palette literals do not appear in components.

| Token | Light | Dark (reserved) | Role |
|---|---|---|---|
| `--canvas` | `#F7F8FA` | `#0B0F17` | Page background, flat |
| `--surface` | `#FFFFFF` | `#111827` | Panels, rail, cards |
| `--surface-muted` | `#EEF1F5` | `#1A2233` | Table headers, active nav fill, tracks |
| `--ink` / `--brand` | `#0B1220` | `#E6EAF0` | Text, brand mark, selected states |
| `--muted` | `#566072` | `#9AA4B5` | Secondary text |
| `--border` | `#E3E7ED` | `#243044` | 1px hairlines |
| `--primary` (action) | `#11736A` | `#3FB8A8` | The only action colour: buttons, links, focus, live pulse |
| `--primary-hover` | `#0C5E57` | `#5CCABB` | Button hover |
| `--primary-soft` | `#E3F2F0` | `#12302D` | Action tint |
| `--info` / `--info-soft` | `#1E3A5F` / `#E8EDF4` | `#A9C1E0` / `#1B2A40` | Info and AI-labelled pills |
| `--success` / `-soft` | `#146B50` / `#E8F6EF` | `#6FD3A8` / `#16332A` | Matched, posted |
| `--warning` / `-soft` | `#865410` / `#FFF4DC` | `#F0C06A` / `#3A2F17` | Warn stage, limits |
| `--danger` / `-soft` | `#B12E47` / `#FDEBF0` | `#F08A9E` / `#3D1E27` | Missing, failed, holds |

- Teal is the single accent. Navy carries the brand. Do not add a second accent hue.
- Every text pair passes WCAG AA (4.5:1). The lowest pairs are primary on primary-soft
  (light 4.95, dark 5.81) and danger on danger-soft (light 5.47). Re-measure any new pair.
- Dark mode uses the lighter teal `#3FB8A8` for text and fills, because `#11736A` fails on
  `#0B0F17`. The app currently resolves every `data-theme` to light; dark values are
  reserved for when a theme control ships.
- Surfaces are flat: no gradients, textures or imagery behind data. Shadows only on
  floating layers (dock, modal, toast). Financial evidence stays on opaque surfaces.
- Status text always accompanies colour; no colour-only approvals.

## Type

Fonts are bundled by `next/font` at build time and served from this application, so the
browser makes no third-party font requests.

| Role | Font | Size / line-height | Weight |
|---|---|---|---|
| Labels, metadata | Geist (variable), fallback Inter | 12 / 16 px | 500 |
| Body | Geist | 14 / 24 px | 400 |
| Section titles | Geist | 16 / 24 px | 600 |
| Page titles | Space Grotesk | 24 / 32 px, -0.02em | 600 |
| KPI values | Space Grotesk, tabular-nums | 36 / 40 px, -0.02em (24 px on phones) | 500 |
| Amounts, ids, traces, tool calls | JetBrains Mono, tabular-nums | 12-14 px | 400-500 |

- `tabular-nums` is always on for currency and numbers. Never truncate monetary values;
  scroll long amount columns horizontally.
- Labels use sentence case, not uppercase.

## Layout and spacing

- 8px grid: 8 / 16 / 24 / 32 / 48. Content padding 32px (16px on phones), section gap 24px.
- Generous whitespace: one idea per panel, quiet pacing.
- Radius: panels and cards 12px, controls 8px, pills fully round.
- Controls and navigation targets at least 44px; form controls 48px.
- Text links use `--link` (teal). Keyboard focus is a visible `--focus` outline.

## Motion

- Only two animations: the live pulse on running agent nodes and the dots moving along
  agent-map edges. Both are removed under `prefers-reduced-motion: reduce`.
- No animated money, no slide-ins, no decorative motion.

## Checks before release

Test responsive layout (390px and 1440px), keyboard use, contrast, and empty, loading and
error states. A real authenticated workspace review is still required before visual
release approval. The reference prototype is `docs/design/slice2-prototype.html`.
