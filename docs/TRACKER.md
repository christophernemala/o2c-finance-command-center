# Task tracker

> **Starting a new session?** Read `AGENTS.md`, then `docs/design/SLICE2_PLAN.md`, then this file. Open work is on branch `claude/elegant-goldberg-v8g58h` (PR #6, base `codex/light-finance-workspace`).

Updated at every delivery. "Done" means the work is merged into the working branch with local tests passing. Live verification is tracked separately in `docs/RELEASE.md`.

## Done

- [x] Repository audit and cleanup: dead routes, committed zip, stale docs archived
- [x] Agent runtime: Claude tool loop, agent identity, run-bound sessions, recorded steps
- [x] Agent Console with live stream, history, cost, schedules and auto-execution policy
- [x] Copilot with streamed answers and CSV/.xlsx analysis
- [x] AR pack: countback DSO, 30-day CEI, Excel export
- [x] Pre-launch audit fixes:
  - Open Graph tags and title template
  - robots.txt
  - per-page titles
  - branded 404 page
  - lighter font loading
  - privacy page (draft)
- [x] Project documents: PRD, App flow, Schema (generated), Tracker
- [x] Red-team audit: 2 medium findings fixed with regression tests (daily auto-post limit, .xlsx memory budget)

## In progress


- [x] Theme and type reset: navy ink and teal action colour, Geist / Space Grotesk / JetBrains Mono (style guide, app tokens, prototype)
- [x] Slice 2 design: prototype v2 in the new theme (owner said to proceed)
- [x] Agent operations backend (B1): guardrails with maker/checker stages, simulation, incident detectors, operations read models
- [x] Agent operations screens: Agent operations (health, KPIs, agent-to-tool map, context comparison, cost), Incidents, Guardrails (server-side simulation preview, maker/checker stage changes). Run traces stay in AI agents.

## Blocked or waiting on the owner

- [ ] **Privacy policy legal wording.** The page is a marked draft.
- [ ] **Live verification.** Set `ANTHROPIC_API_KEY` and `CRON_SECRET`, run `npm run db:migrate`, then do one agent run and one copilot question.
- [ ] **Repository settings.** Make `codex/light-finance-workspace` the default branch.
- [ ] **Delete the retired repositories** (`o2c-orchestration-saas`, `o2c-orchestration-platform`).
- [ ] **Figma.** Needs an Editor seat to build the design system in Figma.

## Next

- [ ] Slice 2 (B2): collections outbox with Resend, contacts, promises, credit limits and holds, PDF statements; `require_contact` guardrail

- [ ] Slice 2 build: collections outbox and Resend, disputes and promises, credit limits and holds, PDF statements, guardrails and incidents
