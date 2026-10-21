# Plan: Agent Operations redesign, then slice 2 (collections and credit)

## Context

Slice 1 (Claude agents, Agent Console, copilot, AR pack) is built and CI-green in [christophernemala/o2c-finance-command-center#6](https://github.com/christophernemala/o2c-finance-command-center/pull/6). You asked for the design and UI/UX first, and supplied an OrchestrateIQ-style spec. The parts of it adopted here:

- health score
- live agent network map
- handoff "context comparison"
- incidents
- traces
- simulate-fix with tracked fixes (Monitor / Warn / Block)
- cost insights
- docked copilot

You also shared BrutCode's inspiration sources: Landing Love, Mexibest, Dead Simple Sites, Odd Web, W3K. I'll take pacing, white-space hierarchy and interaction ideas from them, without copying anything one-to-one.

Your decisions:

| Decision | Choice |
|---|---|
| Brand | Keep **O2C Command Center**, purple tokens from `STYLEGUIDE.md` |
| Guardrails (simulate-fix, tracked fixes) | **Design and build for real** |
| Agent map scope (your answer didn't pick an option) | My default: **real agents plus greyed roadmap nodes**. Order, Inventory, Fulfillment, Shipping and Invoicing appear as "Needs ERP connector", with no fake numbers. Say if you want otherwise. |
| Email | Resend through `fetch`, maker/checker approval before sending |
| Statements | Server-generated PDF (`pdf-lib`) |

**Not adopted from what you pasted:**
- **The spec's invented figures** (47 agents, $12,840 compute, 97.8%). Every number on screen comes from `agent_runs`, `agent_steps`, approvals and the ledger. Before data exists, screens show empty states.
- **The "AI Invoice Analyzer" prompt.** It is a different product (accounts payable, OpenAI, Supabase, Stripe) and conflicts with this stack and AGENTS.md. Two of its ideas fit our roadmap instead: invoice-PDF extraction for AR documents (slice 3) and Stripe billing (slice 4). Its launch advice matches my view: ship collections, then get 10 UAE finance teams paying.
- **Unreachable links.** `fable5-skills-library.vercel.app` and `ezintegrations.ai` (Goldfinch) did not resolve from this sandbox. I read `rNex/o2c_agentmesh`, and two of its ideas are worth taking: composite confidence (never the model's own score) and write actions always gated by a human, which we already do in PostgreSQL.

## Step 0: PR #6 base fix (approved)

PR #6 targets `main`, which holds an old, unrelated Vite/Supabase app. This app's line is `codex/light-finance-workspace`, which PR #5 merged into.

1. Retarget the PR with `mcp__github__update_pull_request(base: "codex/light-finance-workspace")`.
2. Confirm the PR shows clean, with 4 commits.
3. Check CI.
4. Re-arm the safety-net check-in.

Making that branch the repository default is your step in GitHub Settings.

## Step 0a: pre-launch audit fixes and the AI project document set (you said "Go")

**Pre-launch audit fixes (from the 20-point report):**

| Fix | Change |
|---|---|
| A | `metadataBase`, a title template and Open Graph tags in `src/app/layout.tsx` |
| B | `src/app/robots.ts` with disallow-all |
| C | A title on each page (login, signup, verify, security), plus `generateMetadata` in `src/app/page.tsx` using the active workspace name |
| D | `src/app/not-found.tsx`, branded and linking back to the workspace |
| E | `src/app/privacy/page.tsx` as a clearly marked **draft** listing the data collected and the subprocessors. It is linked from the login footer and states "pending legal review". |
| F | Lighter font loading |

Each fix gets a render test (`tests/workspace.test.ts` pattern) and the verify trio.

**Document set (your PRD / TechSpec / AppFlow / Design / Schema / ImplementationPlan / Tracker / Rules list).** Existing files are reused and linked from an index, not duplicated:

| Your doc | File here | Action |
|---|---|---|
| PRD.md | `docs/PRD.md` | New: goal, UAE target users, core features (slices 1–2), success metrics, non-goals |
| TechSpec.md | `docs/ARCHITECTURE.md` | Exists; add the operations and guardrails sections in B |
| AppFlow.md | `docs/APP_FLOW.md` | New: personas, journeys 1–6, screen map (from Phase A) |
| Design.md | `DESIGN.md` + `STYLEGUIDE.md` | Exist; add rows for new screens |
| Schema.md | `docs/SCHEMA.md` | New: every table, key columns, relationships, RLS and write routines. Generated from the migrations and checked against them by a test |
| ImplementationPlan.md | `docs/ROADMAP.md` | Exists; slice and milestone phasing |
| Tracker.md | `docs/TRACKER.md` | New: done / in progress / blocked; updated at every delivery |
| Rules.md | `AGENTS.md` | Exists; this is the coding rules file |

The README gets a "Project documents" index pointing to all eight.

## Step 0b: red-team security audit of PR #6 (from your pasted rubric)

I'll run this before the redesign, against the current code (PR #6 head), using the `security-review` skill plus a manual pass over your five priority areas:

1. **Secrets:** keys in client bundles, `.env` and git history (`git log -p` grep for key patterns), `NEXT_PUBLIC_` misuse.
2. **Database:** RLS on every finance table (the audit query already shows 24/24), cross-tenant reads through every `SECURITY DEFINER` routine, and the agent role's reach.
3. **Auth and authorization:** every route handler (`src/app/api/**`) checks session, MFA, role and Origin. The cron route checks `CRON_SECRET`.
4. **Compliance:** an audit event for every money movement, including policy auto-posts. No PII in logs. AI provider data minimisation.
5. **Business logic:** races on `agent_auto_post` and the daily limit, double posting, negative balances, idempotency-key reuse, and prompt injection through customer names, bank references and uploaded files.

Output: findings ranked Critical / High / Medium with file:line, exploit path and patch. Real findings get fixed and pushed to PR #6 with tests before any new feature work.

Not adopted from that paste:
- **Switching to Supabase, Stripe or shadcn.** The current stack is deliberately standalone PostgreSQL.
- **KYC/AML.** It applies to payment or money-transmission businesses, not to AR software for a company's own receivables. I'd record a PDPL and data-processing review in the roadmap instead.

MFA already exists, and so does audit logging.

---

## Phase A: design (prototype v2, review gate)

Republish the prototype at the same URL (https://claude.ai/artifact/QHec351kb1r7qBWU3TYnsw) with the existing purple tokens and Inter / Sora / JetBrains Mono. Treatment:
- clean backgrounds (no decoration behind data);
- generous white space;
- one orchestrated motion: live pulse on running nodes and dots moving along edges, both disabled under reduced motion.

All sample data stays labelled "Prototype data".

**Navigation:**

```
Top bar:  Overview · Agent map · Traces · Incidents · Guardrails · Insights   [Live ● | 24h ▾ | ⌘K | 🔔 | avatar]
Rail:     Work → Collections · Customers · Cash application · Approvals
          Records → Receivables · Imports · Audit      Reports · Settings
Dock:     Copilot panel (bottom-right, collapsible) on every screen
```

**Screens:**

| Screen | What it shows | Data source (real) |
|---|---|---|
| **Overview** | Health score gauge with its formula disclosed. KPI row: run success %, median run latency, pending approvals (and oldest age), auto-posted AED today, model cost (period). Agent map mini-view. Open incidents. Cost by agent bars. AR position strip (open / overdue / DSO / CEI). | `agent_runs`, `agent_steps`, `approvals`, `report_ar_pack` |
| **Agent map** | Node graph: Bank import → Cash application agent → Approval (policy or human) → Posting; Collections agent → Outbox → Approval → Resend; Credit risk agent → Holds; Reporting agent → Report; Copilot. Greyed roadmap nodes: Order intake, Credit check at order, Fulfillment, Shipping, Invoicing ("Needs ERP connector"). Edge width shows volume; labels show success % and p50 latency. Filters: failures, slow, high cost, loops, stuck. A live handoff stream at the bottom. | Tool calls and their results grouped by edge |
| **Context comparison** (edge drawer) | For a failing handoff: required fields from the tool's zod schema versus what the agent sent, with status Match / Missing / Invalid. A callout, e.g. "contact_id missing in Collections → Outbox; 3 retries". | Zod issues already recorded in `tool_result` errors |
| **Traces** | End-to-end run timeline: thinking summary, tool calls, results, proposals and decisions, with durations. Includes the approval and send steps. | Existing `agent_steps` plus linked approvals and messages |
| **Incidents** | Cards: open, critical, MTTD, MTTR, wasted cost. Table: severity, agent, kind (tool error spike / loop / stuck run / failed send / refusal / limit hit), runs affected, cost impact, guardrail stage. "Investigate" jumps to the trace or edge. | New `agent_incidents`, derived by SQL detectors |
| **Guardrails** (simulate-fix) | Three steps: (1) define a rule from templates (require field X, block tool above AED Y, max N identical calls per run, require contact before draft); (2) simulate by replaying it over the last 30/90 days of recorded tool calls, showing "would have caught X/Y failures, 0 false positives, USD Z saved"; (3) create it in Monitor mode. The tracked list has Promote to Warn / Block, Hold and Rollback, with a full history. | New `agent_guardrails` plus a deterministic replay over `agent_steps` (no model calls) |
| **Insights** | Cost and latency by agent and by tool; bottleneck ranking; suggestions written by the reporting agent (labelled AI and sourced). | Aggregates over steps and runs |
| **Collections, Customer account, Approvals, Statement** | As in prototype v1 (worklist and drawer, outbox, unified inbox, 5-tab customer page, PDF preview). | Slice 2 tables |

**Health score.** A weighted mean of five signals over the selected window: run success 30%, approval age 20%, incident severity 20%, tool error rate 15%, send success 15%. The tooltip shows the formula and each input. With no data, the screen shows "Not enough runs yet" instead of a number.

### A2. Polish pass from `emilkowalski/skills` apple-design

This pass is applied to the prototype first and then carried into B3. Everything is CSS-only, with no new dependency. None of our screens is gesture-driven, so a spring library is not justified.

**Press feedback**
- Buttons, nav items and map nodes react on press, not on release: `:active` scales to 0.97 over 100 ms.
- No artificial delays anywhere on the input path.

**Spatial consistency**
- The edge drawer and the customer drawer enter from the right and exit to the right, along the same path.
- The copilot dock opens from its launcher button (`transform-origin` set to the trigger) and closes back into it.
- The ⌘K palette scales from the top centre.

**Materials, applied sparingly**
- The sticky top bar and the dock are translucent layers using `backdrop-filter`, with a soft fade where content scrolls under them instead of a 1px divider.
- Translucent surfaces are never stacked.
- Data tables and money figures always sit on solid surfaces.
- Modal tasks (approve, send) get a dimming scrim. Parallel panels (dock, drawers) get none, so the user keeps their place.

**Accessibility media queries**
- `prefers-reduced-motion`: already in place. It replaces slides with 150 ms cross-fades rather than removing feedback entirely.
- `prefers-reduced-transparency`: new. Translucent surfaces become solid.
- `prefers-contrast: more`: new. Surfaces become solid with defined borders.

**Typography**
- Letter-spacing depends on size: Sora headings at −0.02em, body text at 0, small caps labels at +0.04em.
- Line-height is tighter on display text and looser on body text.
- Spacing uses `rem`, so the user's text-size setting scales the layout.

**Not adopted from that skill**
- Velocity handoff, momentum projection and rubber-banding. They are for drag, swipe and sheet gestures, which this desktop finance workflow does not have.
- Sound and haptics.

### Not adopted from your latest links

**`tashfeenahmed/freellmapi`.** It routes requests across about 34 free-tier LLM providers behind a single OpenAI-compatible endpoint. I recommend against it, for three reasons:

1. **Customer data would go to providers we don't control.** Customer names, balances and bank references would reach providers outside our subprocessor list and data-processing terms, and some free tiers train on the data they receive. That conflicts with the privacy page and AGENTS.md.
2. **It removes the API features the agent runtime depends on.** An OpenAI-compatible shim drops adaptive thinking summaries, server-side refusal fallbacks, prompt caching and our tool schema handling.
3. **It reverses your earlier decision.** You chose the Claude API.

If you want lower model cost, the right lever is the existing `AI_MODEL` and effort settings: Sonnet for the copilot, Opus for agents. That keeps one vetted subprocessor.

**`fable5-skills-library.vercel.app`.** The sandbox proxy refused the connection again (403), so I could not read it. If it has specific skills you want, paste their contents and I'll assess them.

The apple-design link you pasted carries an `mcp_token` query parameter. Strip such parameters before sharing links.

**Gate:** you review prototype v2, including the A2 polish pass. The build starts after your approval.

**Status (2026-10-16):**
- Prototype v2 is published at the link above.
- PR #6 is clean. CI is green on head `a2838a7`, and there are no review threads.
- Still to do: render-check v2 at 390px and 1440px, in light and dark, and with reduced motion. This happens before B1 starts.
- Phase B waits for your approval of the prototype.

---

## Phase B: build (after design approval)

### B1. Guardrails, incidents and agent operations

Migration `202610160001_agent_operations.sql`.

**`agent_guardrails`:**
- Fields: `id`, tenant, entity, `kind`, `params jsonb`, `stage in ('monitor','warn','block','rolled_back')`, `maker`, `checker`, `version`, `simulation jsonb`.
- Every stage promotion is maker/checker.
- Kinds:
  - `require_field`
  - `max_amount` (numeric(15,2))
  - `max_identical_calls`
  - `require_contact`
  - `deny_tool`

**`agent_incidents`:**
- Fields: kind, severity, agent, run ids, opened/resolved, `cost_usd`, guardrail link.
- Detectors in SQL (`detect_agent_incidents(window)`):
  - tool error rate above threshold;
  - same tool and input three or more times in one run (loop);
  - run stuck over 20 minutes;
  - refusal or max-tokens stop;
  - failed send.
- Run at the end of every agent run and by cron.

**Enforcement:** `src/lib/ai/guardrails.ts` evaluates active guardrails before each tool call in `runLoop`:
- **monitor:** record only;
- **warn:** a step is recorded and the tool still runs;
- **block:** the tool returns an `is_error` result and the step is recorded.

Amount limits are also enforced in SQL routines, so a direct RPC cannot bypass them.

**Simulation:** `simulate_guardrail(params, window)` replays recorded `tool_call` steps in pure SQL and TypeScript. It returns caught failures, false positives (calls that later succeeded) and cost avoided.

**Read routines:**
- `agent_ops_overview(window)`: health inputs, KPIs, cost by agent.
- `agent_edges(window)`: nodes and edges with counts, success and p50 latency.
- `edge_failures(edge)`: context comparison from the zod issues already stored.

### B1a. Hardening from the external plan review (verdict "ship as-is")

1. **Credit holds stay asymmetric.**
   - `customer_holds.placed_by_kind in ('agent','human')`.
   - `released_by` must be a human approver; enforced by a CHECK plus the routine.
   - No release tool exists for agents; a built-in `deny_tool` rule covers `release_*`.
   - Documented in ARCHITECTURE and in the guardrail wizard.
2. **`max_identical_calls`** is counted per run. "Identical" means sha256 of the canonical JSON (sorted keys) of `tool` plus `input`. The `input_hash` is stored on the step so the edge drawer can show the looping payload.
3. **`deny_tool`** scope can be global, per agent kind or per entity. **`require_approval`** is added to ROADMAP as a future kind.
4. **Stuck-run detector** uses the last-step timestamp (`agent_runs.updated_at`) older than 10 minutes while the run is still running, not start time alone. A long tool call that keeps recording steps is therefore not flagged.
5. **Incident `cost_usd`** comes from the same `agent_runs.cost_usd` source as `agent_ops_overview`.
6. **Deterministic evaluation order** in `guardrails.ts`: `deny_tool` → `max_amount` → `require_field` / `require_contact` → `max_identical_calls`.
   - The order is documented.
   - A block returns a structured `is_error` result shaped `{ blocked_by, rule_id, stage, reason }`, so the agent can reason about it.
7. **Simulation runs before promotion as well as on creation.** The wizard shows caught / false positive / cost avoided before the maker submits. The checker sees the same simulation snapshot, stored in `simulation jsonb`.
8. **Guardrail versions are append-only.** Each promotion inserts a new version row (`guardrail_id, version`, unique), so rollback re-activates a prior version and history is never mutated.
9. **Outbox claim** uses `FOR UPDATE SKIP LOCKED` with an `approved` → `sending` transition, so cron and `after()` cannot double-send. The Resend message id is stored on success for reconciliation.
10. **Agent map** uses a layered SVG layout. A force-directed layout fallback for large graphs goes in ROADMAP.
11. **UI labels** match stage names: Monitor / Warn / Block / Rolled back.

### B2. Collections and credit (slice 2, unchanged)

Migration `202610160002_collections_credit.sql`:
- Tables: `customer_contacts`, `collection_messages` (outbox, maker/checker, send states), `invoice_events`, `payment_promises`, `credit_limits`, `customer_holds`.
- Routines are `SECURITY DEFINER` and idempotent. `total_overdue` is recomputed in SQL, and an independent checker is required throughout.

Server:
- `src/lib/email/resend.ts`: fetch with an idempotency key.
- `src/lib/collections/send.ts`: claim, then optional PDF, then send, then complete; triggered via `after()`, with a cron retry.
- `src/lib/statements/pdf.ts` (`pdf-lib`) and `GET /api/statements/[customerId]`.
- New intents in `src/app/api/commands/route.ts` and `src/lib/validation.ts`.

Agents:
- `draft_collection_message` becomes `propose_collection_message`.
- New tools `get_customer_account` and `get_broken_promises`.
- Credit holds: the agent may place one, only a human releases it. This is my default; flag it if you disagree.

### B3. UI

- New pages and components:
  - `src/app/ops/{overview,map,traces,incidents,guardrails,insights}`
  - `src/components/ops/*`: gauge, SVG node map with a simple layered layout (no graph library), edge drawer, guardrail wizard
  - `collections.tsx`, `customers/[id]`
  - unified approvals inbox
  - copilot dock
- Reuse `Panel`, `Badge`, `Money`, `Empty`, `MutationForm`, `RunStream`, `StepView` and `formatAed`.
- Server components by default; client code only for the map interaction, the stream, the dock and the wizard.

### B4. Docs

README, ARCHITECTURE (operations layer and guardrails), RELEASE (local vs live), ROADMAP, DESIGN rows, and `docs/design/SLICE2_UX.md`.

## Verification

**Phase A:**
- The prototype has no horizontal scroll at 390px and 1440px.
- Light and dark both work.
- Reduced motion stops the animations.
- You sign off.

**Phase B, local** (`npm run typecheck && npm test && npm run build`), with new PGlite suites:
- **Guardrails:**
  - maker/checker on promotion;
  - block mode stops the tool and records a step;
  - an amount limit is also enforced by direct RPC;
  - simulation counts match a fixture set of recorded steps.
- **Incidents:** each detector fires exactly once per fixture case.
- **Ops reads:** edge aggregates and health inputs match hand-computed fixtures.
- **Collections, statements, send:** the existing slice 2 test list.
- **Render tests:** empty and forbidden states for the new screens.

**Real PostgreSQL 16:**
- Run migrations twice.
- `test:postgres` and `test:postgres:http`.
- The RLS and anonymous-execute audit.

**Live (owner):**
- Set `RESEND_API_KEY` and `COLLECTIONS_FROM`.
- Run the migrations.
- Do one agent run and one approved test email.
- RELEASE.md marks this unverified until it is done.

**Git:** conventional commits on `claude/elegant-goldberg-v8g58h`, PR against `codex/light-finance-workspace`, then watch CI.
