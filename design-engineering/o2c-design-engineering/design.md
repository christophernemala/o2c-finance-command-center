# Design principles

## Authority order

1. **Finance truth and authorization.** Preserve the existing O2C product contract: current tenant/legal entity, source-backed values, exact amounts, visible evidence, independent approvals, auditability, and honest unavailable states. See [DESIGN.md](../../DESIGN.md), [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md), and [docs/SECURITY.md](../../docs/SECURITY.md).
2. **User-provided product reference.** The supplied dashboard image contributes a dark navigation rail, light analytical canvas, search, KPI row, charts, activity and quick-action arrangement. Adapt its CRM layout to receivables; do not copy its brand or social/lead/ticket data. The local [STYLEGUIDE.md](../../STYLEGUIDE.md) records the approved app colors and responsive behavior.
3. **VengeanceUI.** Use its catalog-first, inspect-then-adapt approach for components; its README and in-repository agent skill say to prefer an existing registry component over inventing a similar one. It is not a finance-specific dashboard system. See [VengeanceUI's agent skill](https://github.com/Ashutoshx7/VengeanceUI/blob/main/.cursor/skills/vengeance-ui/SKILL.md) and [conventions](https://github.com/Ashutoshx7/VengeanceUI/blob/main/.cursor/skills/vengeance-ui/conventions.md).
4. **Emil Kowalski's skills.** Use the explicit motion, performance, accessibility and review rules in [the skills repository](https://github.com/emilkowalski/skills). These sources guide implementation quality; they do not prescribe O2C colors or business data.
5. **Prompt Master.** Use it only to shape clear, bounded, verifiable agent instructions. Its examples are not a UI or interaction system. See [Prompt Master](https://github.com/nidhinjs/prompt-master).

## Principles to apply

- Prefer source-backed figures and explicitly show scope, currency, date/basis and status. Do not make up a KPI, trend, customer activity, connection, recovered amount or call outcome. O2C source: [DESIGN.md](../../DESIGN.md), [src/components/reports.tsx](../../src/components/reports.tsx), [src/lib/ar-pack.ts](../../src/lib/ar-pack.ts).
- Keep the work surface legible and compact. The user-provided reference and local style guide support a navy rail with a bright analytical canvas, search, compact KPIs, panels and responsive data views; colors and dimensions come from [STYLEGUIDE.md](../../STYLEGUIDE.md), not from guesswork.
- Reuse a verified component before inventing a near-duplicate. VengeanceUI source: [agent workflow](https://github.com/Ashutoshx7/VengeanceUI/blob/main/.cursor/skills/vengeance-ui/SKILL.md), [component documentation order](https://github.com/Ashutoshx7/VengeanceUI/blob/main/src/lib/component-docs.ts).
- Motion must earn its place. The Emil review standard allows motion for spatial consistency, state indication, explanation, feedback or preventing a jarring change; frequency constrains the motion budget. See [review standards](https://github.com/emilkowalski/skills/blob/main/skills/review-animations/STANDARDS.md).
- Keep visuals subordinate to financial decisions. The O2C style guide says chart colors distinguish series but do not encode decisions by themselves; status and action semantics must remain explicitly labelled. Source: [STYLEGUIDE.md](../../STYLEGUIDE.md).
- Do not use a dashboard illustration or animation as a substitute for data or readiness. O2C source: [DESIGN.md](../../DESIGN.md) and [docs/PRD.md](../../docs/PRD.md).

## Prohibited inference

No single global VengeanceUI motion curve, duration, token set, accessibility guarantee or browser/performance guarantee is established. Emil's examples are contextual. Prompt Master contains no verified design system. Read [reference.md](reference.md) for evidence links and source limitations.