# Tokens and visual values

## O2C tokens (product authority)

Use the exact current values in the local [STYLEGUIDE.md](../../STYLEGUIDE.md). It records:

| Token | Value | Meaning |
|---|---|---|
| Canvas | `#F4F7FB` | Light app background |
| Surface / muted surface | `#FFFFFF` / `#F5F7FA` | Opaque finance panels / secondary areas |
| Ink / muted | `#142033` / `#66748A` | Main and supporting text |
| Border | `#E4E9F0` | Dividers/panels |
| Primary / link | `#2165ED` / `#1559D6` | Actions/focus and links |
| Rail / rail text | `#111B2D` / `#C1CCDC` | Navigation surface/text |
| Charts 1–6 | `#2165ED`, `#20A77A`, `#8B5CF6`, `#E7A232`, `#E4637A`, `#23A6C5` | Series distinction only; not decision status |

Other established details in `STYLEGUIDE.md`: 8px spacing rhythm, 16–18px panel radii, 10–12px controls, Geist/Space Grotesk/JetBrains Mono and responsive typography. Do not invent extra colors, scales, or radii when the local styleguide already defines them.

## VengeanceUI source tokens (reference only)

Its `src/app/globals.css` has white/zinc light surfaces, zinc-950 dark surface, semantic foreground/border/primary/secondary tokens, radii 4/6/8px, spacing variables 0.5/0.75/1/2rem, content-visibility on landing sections, and a global reduced-motion rule. See [the exact repository source](https://github.com/Ashutoshx7/VengeanceUI/blob/main/src/app/globals.css#L99-L260). These are VengeanceUI's values, not replacements for the O2C tokens.

## Rules

- Do not sample, approximate, or silently replace a documented value.
- If a new token seems necessary, find a source rule and state why an existing token does not fit; otherwise do not add it.
- Color never carries a financial state alone; pair it with an explicit label. O2C source: [STYLEGUIDE.md](../../STYLEGUIDE.md).
- Emil's easing/duration examples belong in [animations.md](animations.md); do not put them in a universal palette/timing system.