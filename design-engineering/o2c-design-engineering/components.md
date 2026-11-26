# Component guidance

## Select from evidence, not resemblance alone

VengeanceUI's agent workflow is: clarify the need → search the catalog → inspect component docs/source/props/dependencies → install through the registry or follow the manual instructions → adapt its usage snippet. Prefer an existing registry component over recreating a similar one. Sources: [agent skill](https://github.com/Ashutoshx7/VengeanceUI/blob/main/.cursor/skills/vengeance-ui/SKILL.md), [catalog](https://www.vengenceui.com/components), [component docs order](https://github.com/Ashutoshx7/VengeanceUI/blob/main/src/lib/component-docs.ts#L30-L37).

Component slugs and install names may differ. The Animated Button docs page uses `/components/my-animated-button`; its registry entry is `animated-button`. Verify each identifier from the catalog and registry before installation.

## Verified families and examples

The source catalog explicitly lists button, text/motion, interactive, layout/card, tooltip/marquee, loader, navbar/docs, collection and background families. Examples include animated numbers, stagger text, drag/zoom/keyboard gallery rotation, command-palette search, pricing state, bento layouts, hover image reveals and animated FAQ expansion. See [catalog source](https://github.com/Ashutoshx7/VengeanceUI/blob/main/src/lib/components-catalog.ts#L18-L133). Names/descriptions alone do not prove accessible behavior; inspect the component source.

VengeanceUI's conventions say client components are typical for interactive/animated pieces, Tailwind-first styles, existing tokens, listed dependencies only, and preservation of accessibility/reduced-motion support: [conventions](https://github.com/Ashutoshx7/VengeanceUI/blob/main/.cursor/skills/vengeance-ui/conventions.md).

## O2C application patterns

Reuse the existing product components before introducing alternatives: the workspace shell and overview are in [workspace.tsx](../../src/components/workspace.tsx), semantic chart variants in [chart-explorer.tsx](../../src/components/chart-explorer.tsx), and shared UI in [components/ui](../../src/components/ui). Keep finance values in exact decimal strings, scope views to the selected entity, and use existing source-backed reporting. Sources: [AGENTS.md](../../AGENTS.md), [DESIGN.md](../../DESIGN.md), [STYLEGUIDE.md](../../STYLEGUIDE.md).

Do not transplant CRM-only concepts (social leads, agent pipelines, tickets) into O2C. Map only the visual hierarchy to receivables, aging, collection worklists, approvals, audit and cash application. Do not add an external component wholesale without reviewing provenance, dependencies, keyboard support, reduced motion and license notices.