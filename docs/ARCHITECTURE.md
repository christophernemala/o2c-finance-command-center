# Architecture

## Layers

```
Browser (Server Components; client state only for chat input, uploads and the live run stream)
  │ same-origin HTTPS, CSP nonces, Origin checks, bounded bodies
Next.js route handlers
  ├─ session auth (opaque cookie → hashed session row) + TOTP assurance + Redis rate limits
  ├─ src/lib/postgres   financeClient: allow-listed routines only, parameterised values
  ├─ src/lib/ai         Claude client, tool registry, loop, agents, runner, copilot
  └─ src/lib/xlsx-read  bounded .xlsx/.csv reader (fflate, no new dependency)
PostgreSQL (source of truth and enforcement)
  RLS on every public table · SECURITY DEFINER routines for every write
  numeric(15,2) money · composite tenant/entity keys · append-only journals, audit, agent steps
```

`DATABASE_URL` is a non-owner login granted `o2c_app`. Before any query,
`transaction()` refuses superuser, BYPASSRLS or table-owner roles. User requests
set a transaction-local session hash and run `SET LOCAL ROLE authenticated`;
`auth.uid()` resolves the user from the live session table. Browser-supplied
roles, tenant IDs or tokens grant nothing.

## Agent runtime

| Piece | Where |
|---|---|
| Agent definitions (goal, tool subset, turn cap) | `src/lib/ai/agents.ts` |
| Tools (zod schema → JSON schema → one routine each) | `src/lib/ai/tools.ts` |
| Manual tool loop (thinking, refusals, max tokens, sequential tools) | `src/lib/ai/loop.ts` |
| Run execution (claim, agent session, step recording, finish) | `src/lib/ai/runner.ts` |
| Copilot turn (user session, streamed text) | `src/lib/ai/copilot.ts` |
| Schema, controls and read tools | `postgres/migrations/202610150001_agent_runtime.sql` |

### Run lifecycle

1. **Request.** A maker, approver or admin posts to `/api/agents`. The route calls
   `request_agent_run`, which is idempotent per run id, capped at 3 active runs per
   entity, and audited. Separately, Vercel Cron calls `/api/cron/agents`.
   `o2c_private.schedule_due_runs(date)` then queues one run per daily schedule,
   protected by a unique index on tenant, entity, kind and date.
2. **Claim.** `executeRun` runs after the HTTP response, using `after()`. It calls
   `o2c_private.claim_agent_run(run, sha256(token))` as the trusted server role.
   That call:
   - locks the run and requires it to be `queued`;
   - fails any run stuck in `running` for more than 20 minutes;
   - provisions the tenant's **agent identity** on first use (`auth.users.kind='agent'`,
     membership role `agent`, no password, so it cannot log in);
   - inserts a **20-minute session bound to this one run** (`o2c_private.agent_sessions`).
3. **Loop.** The runner calls Claude through `client.beta.messages.stream` with:
   - model `claude-opus-5-5`;
   - adaptive thinking with summarized display, so reasoning summaries can be shown;
   - effort `medium` for agents and `low` for the copilot;
   - automatic prompt caching;
   - server-side refusal fallbacks (`fallbacks: "default"`).

   Tools run one at a time, in order. Each input is validated with zod before it runs.
4. **Record.** Every thinking summary, message, tool call, tool result, proposal,
   auto-execution and error is written to `agent_steps` through
   `agent_record_step`. This table is append-only and has RLS. The console tails it
   over SSE (`/api/agents/runs/:id`), so what you watch is the database record, not
   a client-side guess.
5. **Finish.** `agent_finish_run` stores the summary, model, token counts and USD cost
   (list price, `src/lib/ai/pricing.ts`). If any of the run's proposals are still
   pending, it sets `awaiting_approval`. It writes audit evidence and deletes the
   agent session.

### What the agent role can and cannot do

| Can | Cannot |
|---|---|
| Read scoped AR, invoices, cash candidates, KPI pack | Approve anything (`decide_action` requires approver/admin) |
| `propose_action` (maker); proposals carry `agent_run_id` | Execute human-approved proposals (`execute_action`) |
| `agent_auto_post` on **its own** pending proposal | Stage or commit imports, change policies or schedules |
| Record findings and dunning drafts | Act outside its run (`require_run` checks the session's run id) |

### Policy auto-posting (`agent_auto_post`)

Posting without a human checker requires **all** of the following:

- An active `agent_policies` row for the entity, proposed by an admin and activated
  by a different approver or admin.
- `auto_execute = true`.
- The amount is no more than `per_item_limit`.
- Policy-posted amounts for today (Asia/Dubai, counted by journal posting date), plus this amount, are no more than
  `daily_limit`. The policy row is locked, so concurrent runs cannot both slip under the cap.
- An exact match. For receipts: the bank reference equals an undisputed invoice
  number of the same customer, and the amount equals that invoice's open balance.
  For allocations: the invoice open amount, the receipt residual and the proposed
  amount are equal, and the bank reference equals the invoice number.

When these hold, the approval is set to `checker_basis='policy'` with `policy_id`
and no human approver (a CHECK constraint enforces this). Posting reuses
`o2c_private.post_approved`, the same body human execution uses. Otherwise the
routine returns `awaiting_approval` with the reason, and the proposal stays in
the Approval inbox.

## Agent operations: guardrails and incidents

Migration `202610160002_agent_operations.sql`; evaluation in `src/lib/ai/guardrails.ts`.

### Guardrails

| Kind | Parameters | Stops |
|---|---|---|
| `deny_tool` | `tool` | Any call to that tool |
| `max_amount` | `tool` (`propose_receipt` or `propose_allocation`), `limit` (AED decimal) | A proposal above the limit |
| `require_field` | `tool`, `field` | A call where the field is missing or empty |
| `max_identical_calls` | `limit` (1-20) | The call after `limit` identical calls in one run |

- **Scope.** A rule applies to one agent kind or to all agents. It does not apply to the copilot, which already acts with the signed-in user's own permissions.
- **Stages.** A rule is created in **Monitor**, which records hits and changes nothing. Moving it to **Warn**, **Block** or **Rolled back** adds a new version row. That version takes effect only when an approver or admin other than its maker activates it. Version history is kept, and only one version is active at a time.
- **Evaluation.** The runner loads the active rules before the first model turn. If they cannot be loaded, the run fails rather than running unguarded. Before every tool call, rules are checked in a fixed order: `deny_tool`, then `max_amount`, then `require_field`, then `max_identical_calls`.
  - Each hit is recorded as a `guardrail` step.
  - Monitor and Warn record the hit, and the tool still runs.
  - Block skips the tool. The agent receives `{ blocked_by, rule_id, stage, reason }` as an error result, so it can adjust its next step.
- **Identical calls.** "Identical" means the same tool with the same input, compared as canonical JSON with keys sorted. The SHA-256 of that JSON is stored on each `tool_call` step.
- **Database enforcement.** Block-stage `deny_tool` and `max_amount` rules are also enforced by a trigger on `approvals` for any proposal that carries an `agent_run_id`. A direct RPC by the agent identity cannot bypass them.
- **Simulation.** `simulate_guardrail` replays recorded tool calls from the last N days in SQL, with no model calls. It reports how many calls the rule would have acted on, failures it would have caught, false positives (calls that later succeeded), and the cost of the affected runs. The API stores this 30-day snapshot with every new rule and every stage proposal, so the checker sees what the maker saw.

### Incidents

`o2c_private.detect_agent_incidents` runs at the end of every agent run and from the cron sweep. Each incident opens at most once per kind and run.

| Kind | Rule | Severity |
|---|---|---|
| `loop` | The same tool with the same input three or more times in one run | Warning |
| `tool_error_spike` | At least three failed tool results, and at least half of the run's results | Warning |
| `stuck_run` | Still running with no step recorded for 10 minutes | Critical |
| `model_stop` | Failed because the model declined, hit its output limit, or hit the turn cap | Warning |
| `run_failed` | Any other failed run | Critical |
| `guardrail_block` | A Block-stage rule stopped a call | Info |

Incident cost is the run's `cost_usd`, the same figure the overview sums. Approvers and admins resolve incidents.

### Operations read models

- **`agent_ops_overview(hours)`:** runs (finished, succeeded, running, median and p95 duration), pending approvals and the oldest one's age, AED auto-posted today, model cost in total and per agent, tool error rate, open incidents, and the health score.
- **Health score.** It is a weighted mean of four inputs:
  - run success × 30;
  - approval age × 20 (100 up to 4 hours, falling linearly to 0 at 48 hours);
  - open incidents × 20 (100, minus 40 per critical and 15 per warning, not below 0);
  - tool success × 15.

  The total is divided by 85, the sum of these weights. Send success (weight 15) joins the formula when outbound email ships. There is no score until at least one run has finished.
- **`agent_edges(hours)`:** call count, successes and median latency for each pair of agent and tool.
- **`edge_failures(agent, tool, hours)`:** recent failed calls with the input the agent sent, for the context comparison.

## Collections and credit

Migration `202610160003_collections_credit.sql`. Sender in `src/lib/collections/send.ts`, Resend client in `src/lib/email/resend.ts`, statement PDF in `src/lib/statements/pdf.ts` (pdf-lib).

| Record | Rule |
|---|---|
| `customer_contacts` | Makers and admins add and archive contacts. Email addresses are validated and stored in lowercase. Each customer has at most one primary contact. |
| `collection_messages` | Proposed by a maker, an admin or the collections agent within its run. There is no free-text recipient: the email goes to one of the customer's live contacts. The invoices must be overdue, undisputed and open, and belong to that customer. The total is recomputed from the ledger. An approver or admin other than the maker must approve before anything is sent. A customer has at most one message pending, approved or sending (unique index). The invoices and total are re-checked against the ledger at approval and again at sending; if anything changed, approval is refused ("Stale evidence") or the message fails instead of sending. Archiving a contact withdraws messages queued for it. |
| `payment_promises` | Makers and admins record them, directly or through a "promised" remark. Status is derived when read by `o2c_private.promise_state`: an invoice promise is **kept** once that invoice is fully paid (and treated as cancelled if the invoice was voided); an account promise is kept once nothing is overdue; otherwise it is **broken** after its date. A maker, approver or admin can also mark a promise kept or cancelled with a reason (`resolve_payment_promise`, audited). The worklist, the account view and the credit risk agent all read the same derived status. |
| `credit_limits` | A maker or admin proposes a limit, and a different approver or admin activates it. One active and one pending limit per customer. |
| `customer_holds` | A maker, approver, admin or the agent (within a run) may place a hold, and `placed_by_kind` records which. Only a **human** approver or admin who did not place the hold may release it. The agent has no release tool. |

**Send pipeline.** The steps are approve, claim, build, send, complete.
- Approving a message schedules delivery after the response (`after()`). The daily cron retries.
- `o2c_private.claim_collection_messages` moves messages from `approved` to `sending` using `FOR UPDATE SKIP LOCKED`. Two senders never take the same message.
- Before claiming, approved messages whose evidence is no longer current are marked `failed` with the reason.
- If the message asks for one, the sender builds the statement from the ledger at send time, listing only the message's approved invoices.
- It calls Resend with the message id as the `Idempotency-Key`.
- `complete_collection_message` records `sent` with the provider id. It must name the claimed attempt number, so a late worker whose claim was reclaimed cannot overwrite a newer attempt.
- A failed send returns to the queue until the third attempt, then becomes `failed`. A message stuck in `sending` for 15 minutes goes back to the queue, or becomes `failed` if that was the third attempt.
- Without `RESEND_API_KEY` and `COLLECTIONS_FROM`, nothing is claimed.

**Guardrails on direct RPC.** Block-stage `deny_tool` rules for `propose_collection_message` and `place_credit_hold` are enforced inside those routines when the caller is the agent (`o2c_private.assert_agent_tool_allowed`), not only in the TypeScript loop. Human callers are unaffected.

**Statements.** `GET /api/statements/:customerId` returns an open-items statement as a PDF, under the signed-in user's RLS scope. It lists every open posted invoice with amount, paid and open, plus total open and total overdue. Amounts are formatted from decimal strings.

## Collections workbench

Migrations `202610160004_collections_workbench.sql` and `202610160005_collections_hardening.sql`. Screen: the top of `/?view=collections`. Daily pack: `GET /api/export?report=daily`, built in `src/lib/daily-pack.ts`.

| Record or read | Rule |
|---|---|
| `customer_remarks` | Append-only (update and delete are rejected by trigger). Makers, approvers and admins log an outcome (`promised`, `payment_sent`, `partial_payment`, `dispute`, `no_answer`, `wrong_contact`, `escalated`, `other`), a channel, a note, an optional invoice and an optional next follow-up date within a year. A "promised" remark needs an amount and date and creates the payment promise in the same transaction; only makers and admins may record promises. Idempotent on the caller's id. |
| `customer_trade_licences` | Makers and admins record a licence number, issuing authority and expiry. Recording the same number again archives the earlier record. |
| `daily_call_list` | Overdue customers ranked by `overdue AED × (1 + min(oldest days, 360) / 90) × (1 + min(broken promises, 3) × 0.5)`, rounded to fils, with the parts shown as text. Customers whose latest remark sets a future follow-up, or was logged today (Dubai date), are left out. Deterministic: no model involved. |
| `my_follow_ups` | Customers whose latest remark's follow-up date has arrived; the signed-in user's by default, everyone's on request. |
| `licence_alerts` | Active licences expired or expiring within a window (0–365 days). |
| `remarks_logged` | Remarks logged on one Dubai business date, for the daily pack. |

The daily pack workbook has six sheets: Summary (with the score formula), Call list, Follow-ups due, Remarks today, Trade licences and Worklist. Amounts stay decimal strings and are validated at the boundary.

## Customer segments and outstanding breakdown

Migration `202610160006_customer_segments.sql`. Screen `/?view=customers` (`src/components/customers.tsx`), writes through `POST /api/customers`, CSV parsing in `src/lib/segments.ts`.

- `customers.category` and `customers.region` are optional text (1–60 characters; "Unassigned" is reserved for the empty group).
- `set_customer_segments` (makers and admins) takes 1–2,000 `{account, category, region}` rows. Every account must exist in the entity and appear once, or nothing changes. One audit event records the row count and a digest; a retry with the same id and rows is a no-op, different rows are an idempotency conflict. An empty value clears the field.
- The CSV parser requires the exact header `account,category,region` and refuses values starting with `=`, `+`, `-` or `@` (spreadsheet formula injection).
- `outstanding_breakdown(as_of, dimension, category, region)` groups open posted invoices by `category`, `region` or `customer`, with aging buckets by days past due (current ≤ 0, 1–30, 31–60, 61–90, over 90), disputed amount and share of the total. Filters narrow it for drill-down. Amounts are decimal strings.
- The reporting agent and the copilot read it through the `get_outstanding_breakdown` tool. The daily collections pack adds "By category" and "By region" sheets.

## Credit and debit notes

Migration `202610160007_adjustment_notes.sql`. Screen `/?view=notes` (`src/components/notes.tsx`), writes through `POST /api/notes` (intents `note_propose`, `note_decide`, `note_post`).

- `adjustment_notes` mirror documents issued in the source system: `reference` (the document number) is required and unique per entity and kind among non-rejected notes. The app does not issue tax credit notes.
- **Propose:** makers and admins, or the agent within a run. The agent may only propose credit notes with reason `short_payment` or `bank_charges`, never debit notes; Block-stage `deny_tool` and `max_amount` guardrails on `propose_credit_note` are enforced inside the routine. A credit note must name an invoice of the customer and may not exceed its open amount; the invoice version is captured. A debit note needs a due date and a reference not already used by a receivable.
- **Decide:** a human approver or admin other than the maker, on the current version. Approving a credit note fails if the invoice changed since proposal.
- **Post:** a separate call by a human maker, approver or admin, on the approved current version, while the approver still holds the approver or admin role. A credit note re-checks the invoice version and open amount, inserts a non-cash allocation (`allocations.note_id`, with `receipt_id` and `approval_id` null), bumps the invoice version and writes `adjustment_journals` (debit `sales_adjustments`, credit `accounts_receivable`). A debit note inserts a receivable (`invoices.document_type='debit_note'`, `source_note_id`) dated the Dubai business date, and journals debit `accounts_receivable`, credit `sales_adjustments`. Replays return the same journal.
- Because a credit note is an allocation, every open-balance calculation (worklist, statements, AR pack, aging, auto-post checks) includes it without separate code. Receipt residuals are unaffected. In the CEI basis, credit notes reduce ending AR like collections do.
- `short_payment_candidates(tolerance)` lists invoices that received a payment, are not disputed, have no note pending, and have an open remainder at or below the tolerance. The cash application agent reads it with tolerance 50.00 and proposes credit notes; overpayments are recorded as findings only.

## Copilot

`/api/copilot` streams server-sent events. It runs as the signed-in user, so RLS
and their role apply. Write tools (`propose_receipt`, `propose_allocation`) are
offered only to makers and admins, and approval is still required. Conversation
history is stored as text only in `copilot_threads` and `copilot_messages`, which
are owner-only and append-only. That makes every model request append-only.

Uploads go to `/api/copilot/files`:
- CSV up to 1 MB, or .xlsx up to 2 MB;
- the file is parsed once to reject corrupt uploads;
- it is stored in `copilot_files` (owner-only, SHA-256 digest, immutable).

`read_uploaded_file` pages rows to the model. The .xlsx reader only decompresses
the workbook, shared-string and sheet parts. Each part is capped at 20 MB
uncompressed (zip-bomb guard), and reads are capped at 5,000 rows and 60 columns.

## Reporting

`report_ar_pack(tenant, entity, as_of)`:
- **DSO (countback):** walks back through calendar months of posted invoice gross
  until the current open AR is consumed, over a 24-month horizon. Returns null if
  the history is insufficient.
- **CEI (30 days):** (Beginning AR + Credit sales − Ending AR) ÷ (Beginning AR +
  Credit sales − Ending current AR) × 100. Beginning AR uses allocations dated
  before the period.
- Every input is returned alongside the figures so finance can trace them back to the ledger.

## Prompt-injection posture

Customer names, bank references and file contents reach the model as tool
results. The system prompts tell the model to treat them as data. The control
does **not** rely on that instruction: PostgreSQL enforces what the session's
role may do, and the auto-post rule is a deterministic SQL predicate. A
compromised agent can, at worst, create pending proposals (a human sees them) or
auto-post an exact match that it could have posted legitimately anyway.

## Data the platform will not invent

The platform never generates customers, invoices, balances, TRNs, forecasts or ECL
rates. Empty data stays empty. A missing AI key is shown as "not configured" and is
never simulated.
