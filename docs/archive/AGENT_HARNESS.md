# Autonomous AR harness dossier

Design under Frontier Infra guidance. Status: proposed runtime extension;
conformance `UNSCORED`. Existing deterministic analysis and finance controls are
implemented; external workers, governance-health enforcement and delivery are not.

## 1. Outcome and boundary

Give each source-backed receivable an accountable next action and auditable outcome.
Keep money, authority, matching conservation and posting deterministic. Use a
machine-shaped deterministic driver for initial scheduled analysis; bounded models
may later propose extraction/classification, never calculate or approve ledger effects.
If models select workflow edges, explicitly classify that extension as an orchestrator.

Durable effects: analysis jobs, evidence packets, review requests, approved provider
delivery and governed posting. Full statutory GL, autonomous credit changes and
unapproved settlements are outside the first slice. Ledger-affecting actions,
high-value transactions, credit changes and settlements require independent review.

## 2. Trust roles

| Role | Target principal / authority | Required separation |
| --- | --- | --- |
| Proposer | Scoped AR/Collections/Treasury worker; proposes evidence-backed action | Cannot ratify its own scope or success criteria |
| Ratifier | Authorized human policy owner/checker; fixes action ceiling and evidence | Different from proposer |
| Worker | Fresh bounded job session; read source and emit proposal | No unrestricted DB/provider credentials |
| Verifier | Deterministic source/version/conservation checks; provider outcome lookup | Different from worker; fresh authoritative evidence |
| Operator | Platform administrator; pause/halt and controlled recovery | Cannot silently bypass maker/checker |
| Receipt sink | Separate append-only archive principal | Governed worker cannot erase it |

Current SQL checks share a database failure domain with financial storage; an
independent archive/verifier principal is pending. This limits trust claims.

## 3. State machine

Proposed states: queued, leased, verifying, waiting_for_review, approved, executing,
succeeded, retryable_failure, terminal_failure, outcome_unknown, quarantined, halted.
Existing jobs support only queued/completed; these new states require forward DDL.

Persist intent, contract hash/expiry, source versions and idempotency identity before
dispatch. Claim by atomic lease with owner/expiry; renew heartbeat while working.
Persist verified proposal before requesting human review. Revalidate identity,
approval expiry, source versions and exact amounts immediately before effect.
Persist effect intent before calling provider; confirm by provider acknowledgement
and authoritative lookup. Timeout after dispatch becomes outcome_unknown. Resume
by reconciling stored intent/receipt, not by asking a model to repeat the action.
Expired leases retry only within budgets; exhausted work is terminally quarantined.

## 4. Ports and adapters

| Port | Contract / implementation direction | Failure behavior |
| --- | --- | --- |
| Queue/state | PostgreSQL durable outbox, atomic leases, scoped unique effect key | Transaction rollback; no unrecorded dispatch |
| Worker | Fresh context from contract and source refs; separate bounded adapter | No ledger authority; cap tokens/time/cost |
| Verifier | Exact decimal/source version checks plus provider lookup | Missing/stale evidence denies effect |
| Governance | SQL command authorization plus planned external-action gate | No connector/admin bypass |
| Receipt sink | Transactional DB audit plus independent immutable export | Failed required receipt blocks authority |
| Alerts | Approved operator channel with ACK deadline | ACK failure throttles then halts |
| Ground truth | Scoped DB snapshot and original source/provider receipts | Source unavailable means unavailable |

## 5. Governance and mutation matrix

Effective authority is the minimum of operator dial, ratified contract ceiling and
fresh scoped verifier trust. Missing rollback evidence means irreversible; missing
or stale verification gives no mutation authority. Human approvals bind the payload,
scope, versions and expiry. Expired approval denies execution.

| Mutation | Gate / authority | Verification / recovery |
| --- | --- | --- |
| Import/archive | Real maker, scoped validation, independent commit reviewer | Digest/control totals/atomic commit |
| Receipt/allocation posting | Existing versioned SQL approval and independent checker | Amount conservation, one posting per effect |
| Analysis enqueue | Authenticated scope; planned queue/rate/spend budget | Stored job ID and source/as-of evidence |
| Model call | Planned ratified task/token/spend ceiling | Schema/citations validated; no financial mutation |
| Customer message | Planned channel authorization and explicit delivery policy | Provider idempotency/receipt; unknown outcome reconciliation |
| Settlement/credit change | Human gate; unsupported until implemented | Fresh exact evidence and verified ledger path |
| Auth invitation | Trusted operator, real email and explicit role | Single-use/expiry; no fabricated default user |

Required future governance events: contract ratified/revoked, dial changed,
override requested/effective, gate allowed/denied/escalated. Each records scope,
actor, contract/payload hash, evidence refs, timestamp, expiry and predecessor digest.
No signing/tamper-proof claim until an independent key/sink is implemented.

## 6. Operational controls and override runbook

Store-enforced effect identity: tenant + entity + action + source identity/version
+ ratified payload digest. Reject concurrent duplicate dispatch. Budgets must cover
attempts, elapsed time, concurrency, model tokens and spend; exact ceilings require
an approved provider/workload budget before enabling model calls.

Operator halt revokes future dispatch, signals leases and blocks in-flight effects
at the gate; confirm in an independent receipt sink. Target halt SLO: five seconds,
to be measured. Dial-down target: sixty seconds. Unknown outcomes must be reconciled
before unhalting. No automatic recovery may erase evidence or raise authority.

## 7. Four-layer health and evidence plan

| Layer | Required evidence | Current qualification |
| --- | --- | --- |
| Process | Fresh application heartbeat | HTTP rendering only |
| Scheduler | Due claim/ACK progress, lease/backlog freshness | External scheduler absent |
| Execution | Real source/provider auth, credit and representative worker result | Provider-backed autonomy absent |
| Governance | Denial, allow, halt and audit receipts | Source SQL tests; hosted real-user checks pending |

Aggregate mutation permission fails closed unless all required critical checks are
fresh and passing. A green web process cannot hide a failed scheduler/provider/gate.
No fabricated runtime-health manifest is published. Use the canonical Frontier
schema/reducer when runtime health is implemented; do not invent a compatibility API.

First thin slice: scheduled read-only aging refresh into a durable evidence packet.
Acceptance: correct exact totals, scope, versions, one packet per source version,
restart recovery, bounded retries and truthful unavailable status. Chaos/negative
checks: kill after claim/before ACK; concurrent replay; expired lease; wrong tenant;
lying worker; edited/unratified contract; stale verifier; expired approval; forged
rollback; direct provider bypass; provider auth/credit failure while HTTP is alive;
operator halt; audit export failure. Every failure must deny effects and preserve
evidence. Maintain an anomaly registry for duplicates, stale data, saturation and
silent worker failure. Quarterly, rerun the original failures and retire obligations
only when verified evidence permits. Deferred: external actions, model calls,
signatures/independent sink, live health reducer and chaos qualification.
