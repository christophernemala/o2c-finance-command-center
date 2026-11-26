# Visual and implementation polish

## Use existing tokens, not guessed decoration

The O2C app's [STYLEGUIDE.md](../../STYLEGUIDE.md) is the local source of truth for navy rail, bright-blue action, light canvas, readable typography, 8px spacing rhythm, 16–18px panel radii, chart colors and mobile behavior. Keep financial content on opaque surfaces; avoid decorative effects that weaken readability or imply status.

VengeanceUI's repository documents its own light/dark tokens, radii, spacing, landing-page `content-visibility`, some compositing classes and reduced-motion CSS in [globals.css](https://github.com/Ashutoshx7/VengeanceUI/blob/main/src/app/globals.css#L99-L260). These are evidence about that codebase, not mandatory O2C values. Use only if the product contract and measured need support them.

## Make evidence visible

- Keep currency, selected entity, `as_of` date, retrieval time and source/KPI basis close to the relevant card/chart. Source: [DESIGN.md](../../DESIGN.md) and [STYLEGUIDE.md](../../STYLEGUIDE.md).
- Separate current snapshot from live stream and current-ledger re-aging from historical close. Source: [src/components/chart-explorer.tsx](../../src/components/chart-explorer.tsx), [src/components/reports.tsx](../../src/components/reports.tsx), [src/lib/ar-pack.ts](../../src/lib/ar-pack.ts).
- Use empty states that explain the real next step; do not paint test fixtures into the authenticated route. Source: [AGENTS.md](../../AGENTS.md).
- Green is for server-confirmed success/posted state. Use explicit labels for warning and danger. Source: [STYLEGUIDE.md](../../STYLEGUIDE.md).

## Motion and performance

Prefer transform/opacity if motion is justified; measure before adding `will-change`. Do not use `transition: all`. Keep entrance choreography simple and non-blocking. Sources: [Emil performance guidance](https://github.com/emilkowalski/skills/blob/main/skills/animation-performance/SKILL.md), [choreography](https://github.com/emilkowalski/skills/blob/main/skills/choreograph/SKILL.md).

A polished disabled state says what is unavailable and what verified configuration is needed. An app-looking panel must not imply an active Twilio Voice call path, Power BI connection, recovered revenue, provider delivery or approval. Source: [O2C architecture](../../docs/ARCHITECTURE.md) and [DESIGN.md](../../DESIGN.md).