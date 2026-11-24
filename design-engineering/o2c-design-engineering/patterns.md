# Reusable patterns

## Receivables overview

Adapt the user's dashboard image's dark rail, top search, KPI strip, paired analytical panels, activity area and quick actions to the existing O2C workspace. Use the already-approved local palette and responsive shell from [STYLEGUIDE.md](../../STYLEGUIDE.md); do not duplicate CRM-only leads/social/ticket concepts. Keep the overview's values from the authenticated selected-entity snapshot, and label its date/basis from [workspace.tsx](../../src/components/workspace.tsx), [chart-explorer.tsx](../../src/components/chart-explorer.tsx) and [ar-pack.ts](../../src/lib/ar-pack.ts).

## Aging and collection prioritization

Use existing AR aging buckets and source-backed collection worklist data. Keep invoice aging separate from customer-level oldest-invoice prioritization and preserve `as_of`. Existing sources: [AR pack](../../src/lib/ar-pack.ts), [collection types](../../src/types/collections.ts), [collection UI](../../src/components/collections.tsx), [DESIGN.md](../../DESIGN.md).

A responsible revenue-protection sequence is: review aging → verify current invoice/contact/dispute/promise evidence → prepare a proposal → obtain independent human approval before any customer contact → reconcile actual receipt/posted cash → attribute an outcome only when an explicit governed record exists. This sequence adapts the existing approval and stale-evidence controls; it is not a claim that the app records recovered revenue today. Sources: [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md), [docs/SECURITY.md](../../docs/SECURITY.md), [docs/PRD.md](../../docs/PRD.md).

## Honest integration status

- Power BI-style visuals can mean source-backed native bar/donut/matrix/table analytics arranged in a dashboard. It does **not** mean a Power BI service/embed is connected. Existing chart modes: [chart-explorer.tsx](../../src/components/chart-explorer.tsx).
- The configured Twilio channel code handles SMS/WhatsApp. It is not a Voice API or calling agent. A Voice readiness card must say not configured/unavailable and disable call actions until a reviewed, approved and tested flow exists. Source: [twilio.ts](../../src/lib/messaging/twilio.ts) and [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).
- Never show calls made, connection success, recovered cash or provider status without actual authorized records.

## Component reuse

Use VengeanceUI's catalog-first inspect → install/adapt path only for an appropriate component. Its component names and descriptions are not proof of accessibility or business behavior. Source: [VengeanceUI agent skill](https://github.com/Ashutoshx7/VengeanceUI/blob/main/.cursor/skills/vengeance-ui/SKILL.md) and [catalog source](https://github.com/Ashutoshx7/VengeanceUI/blob/main/src/lib/components-catalog.ts).

## Do not copy

Do not add a mascot, robot, fake agent avatar, animated number, fake recent-activity feed, arbitrary call-to-action, fictional revenue-savings KPI, or nonfunctional “live” state. Aesthetic similarity is subordinate to [DESIGN.md](../../DESIGN.md) and [AGENTS.md](../../AGENTS.md).