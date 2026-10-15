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
- Policy-posted amounts for today (Asia/Dubai), plus this amount, are no more than
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
