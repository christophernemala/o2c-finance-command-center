# Reference and evidence ledger

## VengeanceUI: reusable components, not a complete finance design system

- Product purpose and design/DX claims: [README: purpose and features](https://github.com/Ashutoshx7/VengeanceUI/blob/main/README.md#L59-L77) and [differentiation](https://github.com/Ashutoshx7/VengeanceUI/blob/main/README.md#L111-L124).
- Catalog-first use: [agent skill](https://github.com/Ashutoshx7/VengeanceUI/blob/main/.cursor/skills/vengeance-ui/SKILL.md#L10-L24), [examples](https://github.com/Ashutoshx7/VengeanceUI/blob/main/.cursor/skills/vengeance-ui/examples.md#L16-L22), [conventions](https://github.com/Ashutoshx7/VengeanceUI/blob/main/.cursor/skills/vengeance-ui/conventions.md#L3-L9).
- Catalog and docs structure: [catalog page](https://github.com/Ashutoshx7/VengeanceUI/blob/main/src/app/components/page.tsx#L23-L45), [component docs order](https://github.com/Ashutoshx7/VengeanceUI/blob/main/src/lib/component-docs.ts#L30-L37), [installation docs](https://github.com/Ashutoshx7/VengeanceUI/blob/main/src/components/docs/component-docs-sections.tsx#L181-L220), and [registry index](https://github.com/Ashutoshx7/VengeanceUI/blob/main/public/r/index.json).
- Example-specific motion and accessibility: [Animated Button source](https://github.com/Ashutoshx7/VengeanceUI/blob/main/src/components/ui/animated-button.tsx#L24-L82), [tooltip](https://github.com/Ashutoshx7/VengeanceUI/blob/main/src/components/ui/animated-tooltip.tsx#L34-L65), [pricing keyboard/reduced-motion docs](https://github.com/Ashutoshx7/VengeanceUI/blob/main/src/lib/component-docs.ts#L81-L87), [global reduced-motion rule and CSS tokens](https://github.com/Ashutoshx7/VengeanceUI/blob/main/src/app/globals.css#L99-L178).
- The live website presents category → component → preview → install/manual source at [components](https://www.vengenceui.com/components). Animated Button's confirmed route is [`/components/my-animated-button`](https://www.vengenceui.com/components/my-animated-button); [`/components/animated-button`](https://www.vengenceui.com/components/animated-button) was observed as 404. Homepage and live catalog counts differed; do not describe either as a universal canonical count.

## Emil Kowalski: motion/design-engineering source

- Purpose and skill index: [repository README](https://github.com/emilkowalski/skills/blob/main/README.md), [design-engineering skill](https://github.com/emilkowalski/skills/blob/main/skills/emil-design-eng/SKILL.md).
- Build and motion gates: [animate skill](https://github.com/emilkowalski/skills/blob/main/skills/animate/SKILL.md), [recipes](https://github.com/emilkowalski/skills/blob/main/skills/animate/RECIPES.md), [review standards](https://github.com/emilkowalski/skills/blob/main/skills/review-animations/STANDARDS.md).
- Choreography, gestures, and performance: [choreograph](https://github.com/emilkowalski/skills/blob/main/skills/choreograph/SKILL.md), [gestures](https://github.com/emilkowalski/skills/blob/main/skills/gestures/SKILL.md), [animation performance](https://github.com/emilkowalski/skills/blob/main/skills/animation-performance/SKILL.md) and [performance cheatsheet](https://github.com/emilkowalski/skills/blob/main/performance-cheatsheet.md).
- Agent workflow and restraint: [ask-emil](https://github.com/emilkowalski/skills/blob/main/skills/ask-emil/SKILL.md), [find opportunities](https://github.com/emilkowalski/skills/blob/main/skills/find-animation-opportunities/SKILL.md), [remove animations](https://github.com/emilkowalski/skills/blob/main/skills/remove-animations/SKILL.md), [learn taste](https://github.com/emilkowalski/skills/blob/main/skills/learn-taste/SKILL.md), and [pick UI library](https://github.com/emilkowalski/skills/blob/main/skills/pick-ui-library/SKILL.md).
- Timing, curves, springs and gesture thresholds are contextual examples or ranges. They are not a universal app token set. Reduced motion means fewer/gentler; keep explanatory opacity/color when useful and remove movement/position animation.

## Prompt Master: prompt construction only

- Intent and target tool: [SKILL.md intent extraction](https://github.com/nidhinjs/prompt-master/blob/main/SKILL.md#L46-L61).
- Currentness and grounded claims: [model recency gate](https://github.com/nidhinjs/prompt-master/blob/main/SKILL.md#L68-L75), [safe techniques and auditable reasoning](https://github.com/nidhinjs/prompt-master/blob/main/SKILL.md#L454-L465).
- Long-task framing: [template M/N](https://github.com/nidhinjs/prompt-master/blob/main/references/templates.md#L396-L483), [task/context/scope patterns](https://github.com/nidhinjs/prompt-master/blob/main/references/patterns.md#L7-L82).
- It does not establish a UI palette, component system, animation language, interaction pattern or accessibility guarantee. Its visual details occur in example prompts only.

## Product-local authority

- [DESIGN.md](../../DESIGN.md): evidence, scope, accessibility, data/state and approval acceptance criteria.
- [STYLEGUIDE.md](../../STYLEGUIDE.md): approved O2C palette, responsive shell, typography, data presentation, chart modes and mobile controls.
- [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md), [docs/SECURITY.md](../../docs/SECURITY.md), [src/components/workspace.tsx](../../src/components/workspace.tsx): authorization, tenant/entity scope, approvals, audit trail, exact records and current workspaces.
- [src/components/chart-explorer.tsx](../../src/components/chart-explorer.tsx): source-backed chart modes, keyboard controls and reduced-motion behavior.
- [src/lib/ar-pack.ts](../../src/lib/ar-pack.ts) and [src/components/reports.tsx](../../src/components/reports.tsx): aging buckets, report basis, and current-ledger re-aging limitations.

## Unknowns and guardrails

- No universal VengeanceUI palette/spacing/motion system or complete accessibility/performance guarantee exists in the cited files. Inspect each component's source and dependencies.
- No universal Emil spring, duration, curve or gesture threshold exists; use its contextual mapping and verify the chosen case.
- No Prompt Master UI system exists.
- The O2C checkout verifies SMS/WhatsApp capabilities, not Twilio Voice; no Power BI embed is configured. Do not display fake data, connection states, call history, or revenue-saved claims. A live account configuration and provider-specific implementation are separate from these design references.
- Product behavior remains constrained by tenant/entity RLS, maker/checker rules, stale-evidence checks, idempotency, and fail-closed integration states.


## Provider setup facts (activation prerequisites, not design rules)

These vendor docs support future setup planning only. They do not mean either provider is integrated in this repository.

- **Power BI Embedded, app-owns-data:** Microsoft requires an Entra application authenticated with its Application (client) ID and either a client secret or certificate; it also requires Power BI admin settings for embedding/service-principal API use and service-principal or security-group workspace membership. Production embedding requires capacity. [Microsoft Learn: service principal authentication](https://learn.microsoft.com/en-us/power-bi/developer/embedded/embed-service-principal). A future app will also need its chosen workspace, report and semantic-model identifiers and a server-side embed-token flow; choose and test the embedding model before defining app configuration names.
- **Embed-token data isolation:** The app-owns-data token flow uses workspace/report/dataset context and may require an effective RLS identity and roles. Microsoft warns that omitting effective identity for RLS can expose the entire semantic model. Any future implementation must bind the token to the authenticated user's tenant/entity and tested model roles server-side; do not embed a report until isolation is verified. [Microsoft Learn: generate embed token and RLS](https://learn.microsoft.com/en-us/power-bi/developer/embedded/generate-embed-token).
- **Twilio Programmable Voice outbound call:** Twilio's sample uses `TWILIO_ACCOUNT_SID`, an API key SID, and API key secret; it sends `From`, `To`, and TwiML instructions, a hosted TwiML URL, or a TwiML Application SID. The caller ID must be a Twilio number or verified outbound caller ID. A `StatusCallback` is how the application receives call progress/outcome events. [Twilio Learn: make outbound calls](https://www.twilio.com/docs/voice/tutorials/how-to-make-outbound-phone-calls) and [Calls resource](https://www.twilio.com/docs/voice/api/call-resource).
- This repo has `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and SMS/WhatsApp sender variables only; it has no Voice route, call-outcome webhook, or Power BI embed. Never reuse the messaging auth token by assumption for a production Voice integration; decide on API-key credentials and add server-side signature validation and consent/approval persistence as part of reviewed implementation. The existing [security contract](../../docs/SECURITY.md) says no webhook receiver exists today.
