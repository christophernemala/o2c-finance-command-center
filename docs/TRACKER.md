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
- [x] Theme and type reset: navy ink and teal action colour, Geist / Space Grotesk / JetBrains Mono (style guide, app tokens, prototype)
- [x] Slice 2 design: prototype v2 in the new theme (owner said to proceed)
- [x] Agent operations backend (B1): guardrails with maker/checker stages, simulation, incident detectors, operations read models
- [x] Agent operations screens: Agent operations (health, KPIs, agent-to-tool map, context comparison, cost), Incidents, Guardrails (server-side simulation preview, maker/checker stage changes). Run traces stay in AI agents.
- [x] Slice 2: collections email outbox (Resend, sent only after independent approval), contacts, payment promises, maker/checker credit limits, agent-placed and human-released credit holds, PDF statements, Collections screen. A missing contact is refused in SQL, which replaces the planned `require_contact` guardrail.

- [x] Collections workbench: remarks (append-only), follow-ups due, deterministic daily call list, trade-licence alerts, daily collections pack (Excel).
- [x] Review fixes on slice 2: ledger re-check at approval and send, one open message per customer, contact archive withdraws queued messages, attempt-bound outbox completion, statement limited to approved invoices, ledger-derived promise status plus manual resolution, deny rules enforced in SQL for agent messages and holds, idempotent replays without duplicate audit events.

- [x] Customer segments (category, region; CSV or single edit) and outstanding by category, region and customer with drill-down; reporting-agent tool; daily-pack sheets.

## In progress

- [ ] Credit and debit notes (draft, independent approval, posting, allocation; agent proposes for short payments and overpayments).
- [ ] SMS / WhatsApp outreach through Twilio, on the same human-approved outbox.

## Blocked or waiting on the owner

- [ ] **Privacy policy legal wording.** The page is a marked draft.
- [ ] **Live verification.** Set `ANTHROPIC_API_KEY`, `CRON_SECRET`, `RESEND_API_KEY` and `COLLECTIONS_FROM` (verified domain), run `npm run db:migrate`, then do one agent run, one copilot question and one approved test email.
- [ ] **Repository settings.** Make `codex/light-finance-workspace` the default branch.
- [ ] **Delete the retired repositories** (`o2c-orchestration-saas`, `o2c-orchestration-platform`).
- [ ] **Figma.** Needs an Editor seat to build the design system in Figma.

## Next

- [ ] Live verification on Vercel and the hosted database (owner keys first, see above)
- [ ] Slice 3 candidates (see `docs/ROADMAP.md`): ERP or bank-statement connectors, invoice PDF extraction, UAE e-invoicing readiness
