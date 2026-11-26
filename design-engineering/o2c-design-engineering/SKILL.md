---
name: o2c-design-engineering
description: Source-grounded design and frontend engineering for the O2C Finance Command Center. Use when redesigning or extending its responsive web/PWA workspaces, finance dashboards, data visualizations, interactions, or motion while preserving evidence, accessibility, and accounting controls.
---

# O2C Design Engineering

Use this skill to make evidence-led changes to the O2C Finance Command Center. Treat the product’s documented data, interaction, security, and approval contracts as binding; use external design sources only for principles and components they actually document.

## Workflow

1. **Inspect the product contract first.** Read the repository’s `DESIGN.md`, `STYLEGUIDE.md`, relevant workspace code, source-data/report definitions, and applicable security docs. Preserve authenticated server reads, tenant/entity scope, exact decimal strings, maker/checker approval, evidence freshness, audit behavior, and separate posting. Do not put finance records or credentials in browser storage.
2. **Select evidence, not aesthetics by guess.** Consult [`reference.md`](reference.md) for source URLs and limits. VengeanceUI is a component catalog: inspect a specific component’s implementation, docs, dependency, keyboard behavior, and reduced-motion behavior before adopting it. Emil Kowalski’s skills support purposeful, frequency-aware motion and review; their timings, curves, and springs are contextual examples, not universal tokens. Prompt Master is about prompt construction, not UI design. Attribute adopted guidance in the design notes.
3. **Adapt the owner’s visual reference without copying identity.** Use it for layout and color direction only. Keep the O2C brand, product-local tokens, opaque evidence surfaces, readable figures, and desktop rail / phone dock behavior documented in `STYLEGUIDE.md`. Build responsive web/PWA interfaces; do not silently convert the task to native SwiftUI.
4. **Design truthful states.** Distinguish live/source-backed, synthetic preview, empty, unavailable, disabled, pending, and confirmed outcomes. Never invent balances, recovery savings, provider connection status, call history, or report values. Mark unconfigured Power BI or Twilio Voice features as not connected, identify missing setup, and keep actions disabled until the integration exists.
5. **Make recovery actions auditable.** Link users to existing overdue worklists, contact and promise records, cash application, reports, and approval inboxes. Do not claim value recovered from an action unless a governed source records it. A future calling flow must show the exact customer/contact, consent evidence, destination, purpose, and proposed script; require explicit human confirmation immediately before any call. This repository’s Twilio SMS/WhatsApp sender is not a Voice integration. Never place a real call or contact a customer as part of design verification.
6. **Implement restrained motion.** Animate only when it clarifies state, hierarchy, or direct manipulation. Prefer feedback tied to a user action; avoid decorative loops, animated balances, and motion that implies financial confirmation. Check performance, interruption, keyboard use, and `prefers-reduced-motion`; reduce or remove positional movement when requested. See [`motion.md`](motion.md), [`animations.md`](animations.md), and [`review.md`](review.md).
7. **Verify the result.** Add focused tests for data truth, scope, access, empty/unavailable states, keyboard/touch behavior, and reduced motion. Run the repository’s typecheck, lint, tests, and production build. Review desktop and iPhone-width renders when available; use only synthetic preview data for screenshots. Report what was implemented, what remains unconfigured, test evidence, and any blocked integrations.

## Open only what the task needs

- For source authority and limitations, read [`reference.md`](reference.md) and [`design.md`](design.md).
- For responsive composition, tokens, and component selection, read [`layout.md`](layout.md), [`tokens.md`](tokens.md), and [`components.md`](components.md).
- For UI behavior, accessibility, and motion, read [`interactions.md`](interactions.md), [`accessibility.md`](accessibility.md), [`motion.md`](motion.md), and [`animations.md`](animations.md).
- For finance patterns, integration states, and final review, read [`patterns.md`](patterns.md), [`polish.md`](polish.md), and [`review.md`](review.md).
- For bounded agent instructions, see [`best-practices.md`](best-practices.md) and the file map in [`skills.yml`](skills.yml).

## Non-negotiable boundaries

Do not present a prototype, synthetic preview, CSS state, or local result as a live customer connection. Do not bypass server authorization, RLS, evidence checks, idempotency, human approval, or audit controls. Do not merge, deploy, send a customer message, make a call, charge, or perform a financial write unless the task explicitly authorizes that exact external action.
