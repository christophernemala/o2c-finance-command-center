# Interaction patterns

## Verified source patterns

- VengeanceUI's catalog flow presents categories, component detail, preview, install command/manual source, usage and props. Its source implements component-specific interactions, including a button's hover/tap, tooltip enter/leave and a keyboard-operable pricing selector; see [catalog page](https://github.com/Ashutoshx7/VengeanceUI/blob/main/src/app/components/page.tsx#L96-L146), [tooltip](https://github.com/Ashutoshx7/VengeanceUI/blob/main/src/components/ui/animated-tooltip.tsx#L252-L269), and [pricing selector](https://github.com/Ashutoshx7/VengeanceUI/blob/main/src/components/ui/pricing-section.tsx#L267-L319).
- Emil's gestures guidance separates direct tracking from release: map pointer input directly while tracking, use an interruptible spring on release, and derive linked values from the gesture. Use an existing gesture primitive when it fits. Source: [gestures skill](https://github.com/emilkowalski/skills/blob/main/skills/gestures/SKILL.md).
- Emil's choreography uses Lead/Support/Decoration/Static roles and Together/Overlap/Sequence/Carry relationships. Default to together; sequence only when meaning/order requires it; interaction must remain available as soon as content is visible. Source: [choreography skill](https://github.com/emilkowalski/skills/blob/main/skills/choreograph/SKILL.md).
- For rapid toggles, use transitions rather than restart-from-zero keyframes. Source: [animate skill](https://github.com/emilkowalski/skills/blob/main/skills/animate/SKILL.md).

## Finance-app adaptations

A chart-segment selection is a focus/inspection action only, not a financial approval. Keep the selected exact value and an accessible clear-selection action. Existing reference: [chart-explorer.tsx](../../src/components/chart-explorer.tsx).

A customer contact or cash-related proposal must show scope and supporting evidence; proposal and approval are distinct; the maker cannot approve their own proposal; the server must confirm execution. Source: [DESIGN.md](../../DESIGN.md), [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md), and [docs/SECURITY.md](../../docs/SECURITY.md).

For a future voice flow, do not create a live call button until the endpoint, provider configuration, consent, current evidence, proposal, independent human approval and outcome reconciliation are implemented and tested. This app's existing Twilio adapter handles SMS/WhatsApp, not Voice. A disabled readiness state is not a working call integration. Source: [Twilio messaging code](../../src/lib/messaging/twilio.ts) and [reference.md](reference.md).

## Do not infer

Catalog presence does not establish every component's keyboard/focus support. Hover patterns are not usable on touch without an alternate path. Do not turn selection into an action, simulated status into a recorded event, or animation into proof of server completion.