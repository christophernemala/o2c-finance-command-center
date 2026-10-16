## Reproducible font builds — 2026-10-16

The push workflow at commit `68806d5` failed in Turbopack's generated Space Grotesk
Google font asset imports (`next/font/google queries have exactly one entry`).
The PR workflow for the same commit passed; this was not a finance-test failure.

The application now uses `next/font/local` with bundled Latin variable WOFF2 files
for the same Geist, Space Grotesk and JetBrains Mono families. Source package
versions, SHA-256 digests and the SIL Open Font Licenses are included in
`src/app/fonts/`. No new runtime dependency, workflow bypass or retry was added.

A build with Google font loading explicitly blocked failed before the change.
With the same block enabled, `npm run verify` passed TypeScript, all 142 tests
and the production build after the fix. GitHub verification is recorded separately;
this source check does not establish signed-in visual or live-provider verification.

## Liquid white interactive finance workspace — 2026-10-16

The owner's iOS-inspired white/blue direction replaces teal. Navigation and scope
controls use translucent glass; charts, balances, tables and approval evidence use
opaque white surfaces. `STYLEGUIDE.md` and `DESIGN.md` define the updated contract.

The overview now uses a report-canvas layout with working finance shortcuts and
six interactive analytical tiles. Bar, donut and exact-figure modes preserve the
full-entity read model. Segment selection exposes exact values. Customer segment
charts retain real category/region drill links. Approved cash forecasts support
week selection and show the preserved opening, receipts, payments and closing cash.

Collections has a three-column desktop workbench, responsive account-aging cards,
customer/account search, exact overdue sorting and a real priorities rail. Six
non-overlapping bands group accounts by oldest invoice; amounts represent the
whole-account overdue balance, explicitly distinguished from invoice-aging totals.
Contact phone links open the user's dialler; no call result is fabricated. Existing
contact, promise, message, credit, export and approval actions use their current
server routines. Agents keep the existing independently activated policy limits.

Framer Motion is a new runtime dependency for interaction feedback; `happy-dom` is
test-only and checks actual React control events. Missing records, forecasts and
providers remain unavailable; no application sample records or scores were added.
This is a responsive web redesign with native charts, not a native iOS app or an
embedded Power BI integration. No database migration is required by this redesign.
The earlier Twilio migration is still required if it has not been applied.

Verified locally: `npm run verify` passed TypeScript, all 142 tests and the production
build; `npm audit --audit-level=high` found zero vulnerabilities. Tests include
chart modes and focus, aging filter/reset, exact sorting and forecast selection.
Measured main text/status contrast pairs range from 5.36:1 to 15.54:1.

Not verified: current desktop/mobile screenshots, Safari rendering, a signed-in
hosted workspace and live provider actions. Browser visual sign-off remains pending.

## Twilio SMS and WhatsApp — 2026-10-16

Added migration `202610160008_messaging.sql`, Twilio adapters, configured-channel
outbox claims and Collections contact/message forms. Independent human approval,
snapshotted recipients, current consent and ledger evidence are enforced in SQL.
Phone sends are never automatically retried, including after an expired worker claim.
Uncertain outcomes require reconciliation in Twilio before a new proposal.

Configure server-only `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and either
`TWILIO_SMS_FROM` (E.164) or `TWILIO_WHATSAPP_FROM` (`whatsapp:+...`). Apply the
migration before deploying this source. Missing channel settings leave messages queued.

WhatsApp supports free-text replies within an active 24-hour service window only;
proactive approved templates are not implemented. Statements remain email-only.
Provider acceptance is recorded with its SID; delivery receipts and inbound opt-out
webhooks are not implemented. Remove contacts to withdraw permission and queued
messages. Already claimed messages cannot be recalled.

Local verification: `npm run verify` passed strict TypeScript, all 138 tests and
the production build. Tests include Twilio request/error handling, channel routing,
consent and approval checks, audit recipients, worker-crash recovery and the UI.
No hosted migration,
Vercel deployment, live Twilio send or live delivery verification has been performed.

## Credit and debit notes — 2026-10-16

**Added:**
- **Migration** `202610160007_adjustment_notes.sql`. It adds the `adjustment_notes` and `adjustment_journals` tables, non-cash allocations (`allocations.note_id`), `invoices.document_type` and `source_note_id`, and routines to propose, decide, post and list notes, plus short-payment candidates.
- **Notes screen and `POST /api/notes`.** Proposing, deciding and posting are three separate calls.
- **Agent tools.** `get_short_payment_candidates` and `propose_credit_note` for the cash application agent, which only proposes short-payment and bank-charge credit notes. Guardrails can name `propose_credit_note`, including a SQL-enforced `max_amount` cap.
- **Run trace.** Now shows credit note proposals.

**Scope boundary:** these are AR ledger adjustments that mirror documents issued in the source system. The app does not issue VAT credit notes or e-invoices. Refunds of overpayments are not built; the agent records them as findings.

**Tested locally:**
- `npm run typecheck` and `npm run build` pass.
- `npm test` passes 132/132, including 8 new note tests. They cover:
  - ledger validation;
  - maker/checker;
  - the separate posting step;
  - posting replays;
  - stale invoice evidence;
  - debit note receivables;
  - agent limits and guardrail caps;
  - direct-write refusal;
  - the screen's role gating.
- **PostgreSQL 16** (fresh cluster):
  - 16 migrations applied, and a second run applied none.
  - `test:postgres` passed 8/8 and `test:postgres:http` passed 5/5.
  - RLS is on all 36 public tables.
  - No anonymous-executable definers, and no `o2c_private` routine is executable by `authenticated`.

**Not verified live:** no hosted migration, and no live agent run.

## Customer segments and outstanding breakdown — 2026-10-16

**Added:**
- **Migration** `202610160006_customer_segments.sql`: optional `category` and `region` on customers; routines `set_customer_segments`, `outstanding_breakdown` and `customer_segments`.
- **Customers screen:** outstanding by category, region or customer, with aging buckets, disputed amounts and share of total. Drill from a category or region to its customers, and from a customer to their collections account. Makers set segments by CSV upload or one customer at a time.
- **`POST /api/customers`**, with intents `segments_upload` (CSV, 256 KB, all-or-nothing) and `segment_set`.
- **Agent tool** `get_outstanding_breakdown` (read-only), used by the reporting agent and available to the copilot.
- **Daily collections pack:** new "By category" and "By region" sheets.

**Tested locally:** see the verification block below. No live data has been segmented.

## Collections workbench and slice 2 review fixes — 2026-10-16

**Added:**
- **Migration** `202610160004_collections_workbench.sql`: `customer_remarks` (append-only) and `customer_trade_licences`, with routines `add_customer_remark`, `add_trade_licence`, `daily_call_list`, `my_follow_ups`, `licence_alerts`, `customer_remarks_list` and `remarks_logged`.
- **Collections screen:** today's call list with each score and its reasons, follow-ups due (mine or everyone's), trade-licence alerts, a remarks timeline and form on the customer panel, licences on the customer panel, and "mark kept or cancelled" on promises.
- **Daily collections pack:** `GET /api/export?report=daily`, an Excel workbook with six sheets.
- **`Panel`** gains an optional `action` slot.

**Fixed (from an internal code review of the slice 2 commits; migration `202610160005_collections_hardening.sql`):**
- **High:** an approved email was not re-checked before sending. Invoices and total are now re-checked at approval ("Stale evidence") and before claiming; a changed message fails instead of sending.
- **High:** promises could never be kept, so every past-due promise counted as broken and could trigger an agent credit hold. Status is now derived from the ledger, and people can mark a promise kept or cancelled.
- **High:** Block-stage deny rules on `propose_collection_message` and `place_credit_hold` were enforced only in TypeScript. They are now enforced in those routines for the agent.
- **Medium:** outbox completion is bound to the claimed attempt; a message stuck on its third attempt becomes `failed`; one failed completion no longer strands the rest of the batch.
- **Medium:** one open message per customer (unique index), and archiving a contact withdraws its queued messages.
- **Medium:** the attached statement lists only the invoices the checker approved.
- **Low:** replaying `record_payment_promise` or `propose_credit_limit` no longer writes a second audit event, and a different amount is an idempotency conflict.

**Tested locally:**
- `npm run typecheck` and `npm run build` pass.
- `npm test` passes 119/119. That includes 19 new tests: 7 for the workbench in PGlite, 3 for the workbench UI and daily pack, and 9 for the review fixes in PGlite.
- **PostgreSQL 16** (fresh cluster):
  - 14 migrations applied, and a second run applied none.
  - `test:postgres` passed 8/8 and `test:postgres:http` passed 5/5.
  - RLS is on all 34 public tables.
  - No `SECURITY DEFINER` routine is executable by `anon`.
  - No `o2c_private` routine is executable by `authenticated`.
- **Visual check:** the Collections screen with sample props at 1440px and 390px. No sideways scrolling, no errors (Chromium).

**Not verified live:** no hosted migration, and no live email or agent run.

## Slice 2: collections and credit — 2026-10-16

**Added:**
- **Migration** `202610160003_collections_credit.sql`. It adds five tables: contacts, the collections email outbox, payment promises, credit limits and credit holds. All writes go through `SECURITY DEFINER` routines with maker/checker.
- **Email sending** through Resend, using `fetch` and an idempotency key. Sending happens only after independent approval, with SKIP LOCKED claiming and up to three attempts.
- **Statements.** A PDF open-items statement (`pdf-lib` 1.17.1, the one new dependency, which you approved for this purpose) at `GET /api/statements/:customerId`, and optionally attached to emails.
- **Collections screen.** Worklist, contacts, credit limit, hold place and release, promises, the email outbox with approve/reject, and the statement download.
- **Agent tools.** `propose_collection_message` replaces `draft_collection_message`. New: `get_collections_worklist`, `get_customer_account` and `place_credit_hold`. There is no release tool.
  - The collections agent now proposes emails for human approval.
  - The credit risk agent places holds on customers over 90 days overdue, over their limit, or with two or more broken promises.
- **Run trace.** Now shows guardrail steps and email proposals.

**Tested locally:**
- `npm run typecheck` and `npm run build` pass.
- `npm test` passes 100/100, including 8 new tests:
  - viewers cannot add contacts, and invalid emails are refused;
  - a message without a contact, or with an invoice that is not overdue or is disputed, is refused;
  - the total comes from the ledger;
  - makers cannot approve their own messages;
  - delivery claims once, retries twice, marks a message `failed` after the third failure, and never resends a sent message;
  - the statement is attached and the message id is the idempotency key;
  - an agent can place a hold, but neither an agent, a maker, nor the person who placed it can release it;
  - credit limits need an independent checker;
  - broken promises, the worklist and statement totals match the fixtures;
  - the statement PDF parses;
  - the Resend client sends the right headers and attachment encoding, and reports errors.
- **PostgreSQL 16** (fresh cluster):
  - 12 migrations applied, and a second run applied none.
  - `test:postgres` passed 8/8 and `test:postgres:http` passed 5/5.
  - RLS is on all 32 public tables.
  - Anonymous users cannot execute any `SECURITY DEFINER` routine.
- **Visual check.** The Collections screen was rendered with sample props at 1440px and 390px. No sideways scrolling and no errors (Chromium).

**Not verified live:**
- No email has been sent through Resend. That needs `RESEND_API_KEY`, `COLLECTIONS_FROM` and a verified sending domain.
- No hosted database migration.
- No live agent run using the new tools.

## Agent operations screens — 2026-10-16

**Added:** three workspaces, built as server components with no new client JavaScript.
- **Agent operations:**
  - KPI row: run success, median and p95 run time, pending approvals and the oldest one's age, AED auto-posted today.
  - The health score with its inputs and weights. With no finished runs it reads "Not enough runs yet".
  - An agent-to-tool handoff map. Line width shows volume and red marks failures.
  - A context comparison for the selected handoff, comparing the tool schema with the input of the last failed call.
  - Open incidents and model cost by agent.
- **Incidents:** the incident list with "Investigate", which opens the run trace. Approvers and admins see a resolve button.
- **Guardrails:**
  - Define a rule, then simulate it over 30 days. The simulation runs on the server through a GET form.
  - Create the rule in Monitor.
  - The tracked list shows version history, stage proposals, and approve/reject for a different approver.

Panels use the new 12px radius, and KPI values use Space Grotesk at 36px.

**Tested locally:**
- `npm test` passes 92/92, including four new render tests:
  - empty states, never an estimated score;
  - recorded health and the context comparison;
  - viewers get no proposal forms, and makers cannot approve their own change;
  - only approvers and admins can resolve incidents.
- Typecheck and build pass.
- The three screens were rendered with sample props and the compiled CSS at 1440px and 390px. No sideways scrolling and no errors in Chromium.

**Not verified:** the screens have not been seen in a signed-in workspace against live data. A separate traces screen and an insights screen were not built: run traces stay in AI agents, and cost and latency by agent and tool are on Agent operations.

## Agent operations backend: guardrails, incidents and read models — 2026-10-16

**Added:**
- Migration `202610160002_agent_operations.sql`. It adds three tables: guardrails, guardrail versions and incidents.
- Guardrail lifecycle with maker/checker on every stage change.
- Simulation by replay of recorded tool calls.
- Six incident detectors.
- Operations read models: overview with health score, agent-to-tool edges, and edge failures.
- Guardrail evaluation in the tool loop, which fails closed if rules cannot be loaded.
- A trigger that enforces Block-stage amount and deny rules on agent proposals sent by any path.
- New `/api/agents` intents: `guardrail_create`, `guardrail_stage`, `guardrail_decide`, `incident_resolve`.
- The cron route also sweeps for incidents.
- See `docs/ARCHITECTURE.md`, section "Agent operations".

**Tested locally:**
- `npm run typecheck` and `npm run build` pass.
- `npm test` passes 88/88, including 10 new tests:
  - every stage change needs an independent checker;
  - agents cannot change guardrails;
  - a Block-stage cap stops an agent proposal sent by direct RPC, and does not affect humans;
  - simulation counts match a fixture;
  - each detector opens once, and running detection again opens nothing;
  - the health score equals the hand-computed 56;
  - edges match the fixture;
  - the tool loop never runs a blocked call;
  - rules evaluate in the fixed order, and inputs hash canonically.
- **PostgreSQL 16** (fresh cluster):
  - `db:migrate` applied 11 migrations, and a second run applied none.
  - `test:postgres` passed 8/8 and `test:postgres:http` passed 5/5.
  - RLS is on all 27 public tables.
  - Anonymous users cannot execute any `SECURITY DEFINER` routine in `public` or `o2c_private`.

**Not verified live:** no hosted database migration and no live agent run.

**Not built yet:** the operations screens (overview, agent map, traces, incidents, guardrails, insights). The `require_contact` rule waits for the customer contacts table in slice 2.

## Navy and teal theme, Geist type — 2026-10-16

**Changed:** the purple palette and the Inter/Sora fonts are gone.
- Colours: deep ink navy for text and brand, with one teal action colour (`#11736A` light, `#3FB8A8` dark). The status colours are unchanged. Surfaces are flat, with 1px hairlines.
- Fonts: Geist for interface text, Space Grotesk for page titles and KPI values, and JetBrains Mono for amounts. Tabular figures are always on for numbers.
- Applied in three places: `STYLEGUIDE.md`, the app's tokens in `src/app/globals.css`, its fonts in `src/app/layout.tsx`, and the slice 2 prototype.

**Contrast:** every text pair in light and dark passes WCAG AA, computed from the token values. The lowest pair is 4.95:1.

**Tested locally:** `npm run typecheck` passed, `npm test` passed 79/79, and `npm run build` passed. The prototype rendered all 14 screens at 390px and 1440px, in light and dark, with and without reduced motion, with no horizontal overflow and no console errors (Chromium only).

**Not verified live:** the restyled app pages have not been reviewed on Vercel or in a signed-in workspace. Component-level spacing and sizes in the app still follow the old scale until the B3 UI build.

## Security hardening and pre-launch fixes — 2026-10-16

**Red-team findings fixed, each with a regression test that fails on the previous code:**
- **Medium. Daily auto-execution limit could be exceeded.** It counted policy postings by proposal date. A proposal raised on an earlier day and auto-posted today escaped today's limit. `202610160001_security_hardening.sql` now counts by journal posting date, and the console's "auto-posted today" figure uses the same source.
- **Medium. Memory exhaustion through a crafted .xlsx upload.** The reader capped each workbook part at 20 MB of declared size but had no total cap, so a 2 MB upload with 20 sheets could force about 1.2 GB. It now caps each part at 12 MB and the whole workbook at 24 MB.

**Reviewed with no finding:**
- Secrets: none in git history or client bundles.
- RLS: on all 24 tables.
- Route handlers: Origin, session, MFA and rate-limit checks are present; the cron route uses a timing-safe secret check.
- Agent role: still cannot approve, execute or stage.
- Copilot threads and files: owner-only.
- Rendering: no raw-HTML sinks.

**Pre-launch audit fixes:**
- Open Graph tags and a title template.
- `robots.txt` disallowing all crawling.
- Per-page titles.
- A branded 404 page.
- Lighter font loading.
- A privacy page marked as a draft pending legal review, linked from the sign-in footer.

**New documents:** `docs/PRD.md`, `docs/APP_FLOW.md`, `docs/TRACKER.md` and `docs/SCHEMA.md`. The schema document is generated by `npm run docs:schema` and checked by a test.

**Tested locally:**
- Typecheck passes, 79/79 tests pass, and the production build passes.
- On a disposable PostgreSQL 16, all 10 migrations applied and a second run applied nothing.
- `test:postgres` passed 8/8 and `test:postgres:http` passed 5/5 on repeated runs. One earlier attempt on a freshly created cluster failed before its tests ran and did not reproduce in 5 further runs; CI will confirm.

**Not verified live:** nothing in this entry has run against the hosted deployment.

## Agent runtime, copilot and AR pack — 2026-10-15

**Built:**
- Claude tool-use agents (cash application, collections, credit risk, reporting),
  each running under a per-tenant agent identity with run-bound sessions.
- Live Agent Console: an SSE tail of append-only `agent_steps`, plus run history,
  cost, daily schedules through Vercel Cron, and an auto-execution policy.
  - The policy is off by default.
  - An admin proposes it and a different approver activates it.
  - It posts only exact matches within per-item and daily AED limits.
- Copilot with streamed answers, scoped tools and CSV/.xlsx analysis.
- AR pack with countback DSO, 30-day CEI and a multi-sheet .xlsx export.
- The overview DSO and CEI cards now show computed values.

New migration: `202610150001_agent_runtime.sql`. It is forward-only and leaves
earlier migrations unchanged.

New dependency: `@anthropic-ai/sdk` 0.134.0.

**Removed:**
- `review-source.zip`.
- The retired OAuth stub routes.
- The unused `downloadWorkbook`.
- The deterministic agent-job UI. Its SQL tables and functions remain for history,
  but they are no longer called.
- The stale Supabase skill. Its RLS auditor moved to `scripts/db-audit.sql`.

Historical documents moved to `docs/archive/`.

**Tested locally:**
- Strict TypeScript, the full unit and embedded-PostgreSQL suite, and a production build.
- New database tests:
  - The agent role cannot approve, execute or stage.
  - Auto-posting is refused when the policy is off, over a limit or inexact, and
    the policy must be activated by an independent approver.
  - The schedule fan-out runs once per day.
  - DSO and CEI match fixture arithmetic.
  - Copilot conversations are private to their owner.
- An end-to-end agent run with a scripted model (claim-once, tools through RLS,
  policy posting, recorded step order, cost, session revocation).
- The .xlsx reader round trip.

**Not verified live:**
- No call to the live Claude API was made from this environment.
- The hosted Vercel and PostgreSQL deployment has not been migrated or exercised.
  Before claiming it is active, set `ANTHROPIC_API_KEY` and `CRON_SECRET`, run
  `npm run db:migrate` against the target, then run one manual agent run and one
  copilot question as real users.

## Dashboard statistics — 2026-10-15

Added an explicit server refresh that preserves tenant, entity, workspace and page.
The overview distinguishes an entity with no invoice records from a populated
ledger and links to import review. DSO and CEI cards now state that their
reporting-period calculations are not connected; importing open invoices alone
does not implement these KPIs. No financial records or database migrations changed.

# Deployment qualification — 2026-10-13

## PR #4 CodeRabbit repair — 2026-10-14

The ready PR received eight actionable review comments. Fixes use a forward
source-file policy migration with transaction-local entity selection, retain
migration error causes/rollback uncertainty, validate agent input before budget
reservation, map source-staging conflicts, validate import UUIDs, check MFA-key
configuration and make invitation GET read-only with same-origin POST activation.
The external-review guide now targets the consolidated candidate archive.

Existing applied migrations are unchanged. Apply
`202610140001_source_scope.sql` on the dedicated PostgreSQL target before
claiming the new hosted source-file policy is active. Existing tenant membership
authorizes its entities; this hardening scopes each source-file operation to the
selected authorized entity and does not introduce separate per-entity grants.
Regression coverage includes repeated link scans, CSRF activation denial,
malformed import IDs, same-tenant entity separation and pooled scope cleanup.
Local TypeScript, 56 control tests and build passed after the repair. Hosted
real-user and production finance qualification remain separate release gates.

## Consolidation update — 2026-10-14

The owner selected standalone PostgreSQL/custom Auth. Candidate
`codex/unified-cloud-audit` combines this implementation with the light workspace,
cloud devcontainer and customer design sources. See [unified audit](UNIFIED_AUDIT.md).
A dedicated Neon staging project has seven applied migrations and a verified
non-owner runtime role; all public tables have RLS. It contains no users, tenants,
entities, memberships or business records. Candidate preview DB/MFA settings are
branch-scoped. Original provider records and production configuration are preserved.
Hosted real-user login, maker/checker finance workflows, autonomous scheduling,
provider execution and a running Codespace remain unqualified.

Candidate local checks passed strict TypeScript, 56 tests and a production build.
Dependency installation audit reported zero vulnerabilities. The read-only
`npm run audit:cloud` verified the dedicated hosted runtime connection, non-owner
role, RLS on all 18 public tables, empty anonymous workspace access and denial of
anonymous identity-table reads. These checks inserted no hosted test fixtures.

## Current scope

Next.js now connects directly to standalone PostgreSQL through a restricted pg
pool. Supabase SDKs, public project variables and hosted Auth/Storage calls are
removed. Finance tables retain exact decimal contracts, RLS, tenant/entity scope,
independent maker/checker, versions, idempotency and transactional posting.

Authentication uses app-managed scrypt hashes and opaque HttpOnly sessions stored
as token hashes. Imported bcrypt credentials are supported. Invitations and TOTP
enrollment/challenges run in the application; encrypted secrets and consumed counters
protect factors. Enrolled MFA is enforced by server access and database RLS.
Google/Microsoft provider callbacks are retired; new OIDC login is not implemented.
Public signup, automatic recovery email and MFA recovery codes are not implemented.

Validated private CSV bytes and staged rows now commit atomically in PostgreSQL.
Streamed-byte limits, CSRF, nonce CSP, durable login/API rate limits, private response
caching and disabled production browser source maps remain in effect.

## Rollout

Follow docs/POSTGRESQL_MIGRATION.md and docs/PRODUCTION_PROVISIONING.md.
Use a fresh dedicated PostgreSQL target; do not run the new baseline in place over
the old provider schema. Preserve UUIDs, exact financial records, source bytes and
MFA during any existing-data transfer. Current migrations provision no business
records or default accounts. No hosted data, credentials or deployment settings
have been changed by this implementation.

Vercel needs a restricted pooled DATABASE_URL, MFA_ENCRYPTION_KEY, Redis URL/token,
AUTH_RATE_LIMIT_SECRET and AUTH_SITE_URL. DATABASE_MIGRATION_URL is operator-only
and must not be deployed. Remote TLS certificates are verified. PostgreSQL 17 is
the local integration target; Neon is recommended for serverless deployment.

## Verification

The final source gates are npm run verify and npm audit. Local integration uses
npm run test:postgres on a dedicated disposable loopback database. The validation
record for this revision is recorded after final checks below.

Hosted connection, actual user invitations, HTTPS/session cookies, Redis behavior,
source restoration, MFA recovery and real finance workflows remain live rollout
gates. Previous provider evidence is archived in docs/archive/RELEASE_20261008.md;
it does not qualify the new deployment.

## Supported limits

Controlled CSV imports cover unpaid invoices and bank lines; historical settlements,
FX, credits, refunds, write-offs, period locks and statutory GL exports need governed
implementations. Analysis jobs do not deliver customer messages or post journals.
Forecast/ECL runs require actual approved source inputs. Full-dataset export,
billing, external worker scheduling, ERP/bank connectors, retention and tested
backup/restore remain outside this source migration.

### Local validation record

The final revision passed strict TypeScript, all 56 unit/embedded-database tests,
a production build, eight real PostgreSQL integration checks and five Next.js HTTP
checks. PostgreSQL 17 migrations applied successfully and a second migration run
skipped every unchanged file. Integration was exercised with both loopback trust
and password-authenticated PostgreSQL connections; runtime calls used a restricted
non-owner role. npm audit reported zero known vulnerabilities. Production static
assets contained no browser source maps. The HTTP suite mocks Redis transport;
it does not prove live Lua execution or Neon/Vercel connectivity. Disposable local
containers and test datasets were removed after verification.
