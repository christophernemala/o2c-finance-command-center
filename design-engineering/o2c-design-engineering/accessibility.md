# Accessibility guidance

## Preserve verified behavior

- Use semantic headings, labelled regions, captions, table scope, visible focus, keyboard-operable controls and clear loading/empty/unavailable/forbidden/conflict/success states. These are O2C product requirements in [DESIGN.md](../../DESIGN.md).
- Keep chart modes in a labelled group with `aria-pressed`; make chart data inspectable in exact figures or matrix/table form; label keyboard-focusable chart segments and announce selected values politely. Existing implementation: [chart-explorer.tsx](../../src/components/chart-explorer.tsx).
- VengeanceUI docs source examples include generated `aria-label`s, SVG `aria-hidden`/`focusable` properties, a labelled copy-code control and an explicit expand-code button. Its pricing selector documents keyboard arrow/Home/End support and reduced-motion behavior. See [docs sections](https://github.com/Ashutoshx7/VengeanceUI/blob/main/src/components/docs/component-docs-sections.tsx#L101-L122), [installation docs](https://github.com/Ashutoshx7/VengeanceUI/blob/main/src/components/docs/component-installation.tsx#L186-L214), and [pricing docs](https://github.com/Ashutoshx7/VengeanceUI/blob/main/src/lib/component-docs.ts#L81-L87).
- Emil's web gesture guidance names 44×44px minimum touch targets and requires a real-phone check; gate hover to fine pointer/hover devices. Source: [gestures skill](https://github.com/emilkowalski/skills/blob/main/skills/gestures/SKILL.md).
- Honor `prefers-reduced-motion`. Emil says to remove movement/position animation but retain comprehension-aiding opacity/color where useful; VengeanceUI's CSS demonstrates a global near-zero animation/transition duration rule. Choose a product-specific accessible result and test it; do not generalize one policy to every component. Sources: [Emil animate skill](https://github.com/emilkowalski/skills/blob/main/skills/animate/SKILL.md), [VengeanceUI CSS](https://github.com/Ashutoshx7/VengeanceUI/blob/main/src/app/globals.css#L255-L260).

## Finance-specific checks

- Status is explicit text, not color alone. The O2C [STYLEGUIDE.md](../../STYLEGUIDE.md) says chart colors distinguish series only; they do not encode a decision by themselves.
- Ensure every visible label has a meaningful accessible name; icon-only actions need labels. Keep exact money values available in text, not just visual encodings.
- Touch targets and safe-area padding should not hide the iPhone home indicator or page content. See [STYLEGUIDE.md](../../STYLEGUIDE.md) and [layout.tsx](../../src/app/layout.tsx).
- Do not assert WCAG conformance without an audit. The VengeanceUI source explicitly does not establish comprehensive WCAG coverage for every component.