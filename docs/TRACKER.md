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

- [x] Credit and debit notes: propose (maker, admin, or agent for small short payments), independent human approval, separate posting; credit notes as non-cash allocations, debit notes as receivables; short-payment list; guardrails enforced in SQL.

- [x] SMS and WhatsApp replies through Twilio on the human-approved outbox: recorded channel consent, snapshotted phone recipients, channel-aware claims, no automatic phone retries, provider references and Collections forms. Local verification passed 138 tests, typecheck and build. WhatsApp replies require an active 24-hour service window; proactive templates remain future work.

- [x] Liquid white/iOS-blue workspace: glass chrome, native interactive charts with Framer Motion, customer segment visuals, forecast week selection, searchable/sortable collections workbench and explicit action labels. Verified locally with 142 tests, TypeScript, build and dependency audit; browser visual sign-off remains pending.

- [x] CI font-build repair: bundle the existing typefaces with `next/font/local`, source digests and licenses. Local verification passed all 142 tests and a build with Google font loading blocked.

- [x] Banking login and detailed registration, Three.js scene with fallback/reduced motion, private access requests and invitation activation; Google/single-tenant Microsoft OIDC with explicit linking and preserved MFA. Local TypeScript, 151 tests and production build passed. See `docs/AUTH_SETUP.md`; live provider and browser checks remain pending.

- [x] Minimalist modern typography and shared controls: locally bundled Calistoga/Inter, preserved JetBrains Mono figures and Apple-blue palette, shared gradient/radius/shadow tokens, locally optimized robot artwork with real HTML copy, and an on-demand bank scene. TypeScript, 151 tests, production build and login/signup/image HTTP checks passed; browser visual review pending.

- [x] Ledger corrections from review:
  - withdraw an approved note that cannot post (audited)
  - cash split from credit notes in statements, CEI and promises; debit notes labelled
  - approver enters the ERP number, and `CN-pending-` never posts
  - account promises judged only on the invoices they covered
  - "Set one customer" keeps blank fields
  - agent finish counts pending notes, guardrail tool list, replay-safe trade licences, one-open-message pre-flight

  Verified locally (TypeScript, 164 tests, build) and on a disposable PostgreSQL 16. Not verified live.

## In progress

- None. Hosted verification remains blocked below.

## Blocked or waiting on the owner

- [ ] **Privacy policy legal wording.** The page is a marked draft.
- [ ] **Live verification.** Set `ANTHROPIC_API_KEY`, `CRON_SECRET`, `RESEND_API_KEY` and `COLLECTIONS_FROM` (verified domain), set Twilio channel credentials for phone outreach, run `npm run db:migrate`, then do one agent run, one copilot question and one approved test email.
- [ ] **Repository settings.** Make `codex/light-finance-workspace` the default branch.
- [ ] **Delete the retired repositories** (`o2c-orchestration-saas`, `o2c-orchestration-platform`).
- [ ] **Figma.** Needs an Editor seat to build the design system in Figma.

## Next

- [ ] Live verification on Vercel and the hosted database (owner keys first, see above)
- [ ] Slice 3 candidates (see `docs/ROADMAP.md`): ERP or bank-statement connectors, invoice PDF extraction, UAE e-invoicing readiness
