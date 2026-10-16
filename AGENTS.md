# AI Rules — O2C Finance Command Center

- Maintainer: Christopher Nemala, Dubai. Stack: Next.js App Router, strict
  TypeScript, Tailwind, direct PostgreSQL, app-managed sessions, Vercel. Default currency AED.
- Follow `DESIGN.md` and `STYLEGUIDE.md`. Inspect `src/components/ui`,
  `src/lib/postgres`, and `src/types` before adding alternatives.
- Never generate records, approvals, bank evidence, invoice documents, or execution
  status for application users. Test fixtures belong only in `tests/`.
- Financial database records use `numeric(15,2)`. Transport monetary values as
  decimal strings. Use `src/lib/money.ts`; never convert money to Number.
- Every write requires server authentication plus tenant/entity-scoped database
  authorization. Runtime credentials must use a non-owner role without BYPASSRLS; never deploy the migration-owner connection.
- Approvals and execution are distinct. Enforce independent maker/checker,
  proposal/record versions, decimal limits, idempotency, and transactional posting
  in PostgreSQL, including direct RPC calls. UI permissions are supplemental.
- AI agents act through the tenant's `agent` identity: read, propose, record findings.
  They never approve. The only posting without a human checker is `agent_auto_post`
  under an active `agent_policies` row (admin proposes, a different approver activates;
  off by default; per-item and daily AED limits; exact reference-and-amount matches only;
  `checker_basis='policy'` audited). Do not widen this without a new reviewed policy type.
- LLM tools map one-to-one to allow-listed PostgreSQL routines. Never give a model raw
  SQL, credentials, or a tool that sends external messages without human approval.
- Use Server Components by default. Client state is restricted to actual interactions.
  Do not cache financial data in browser storage or use optimistic financial updates.
- Do not add dependencies unless required for a concrete feature or meaningful check.
- Verify with `npm run typecheck`, `npm test`, and `npm run build`. Record separately
  what was tested locally and what was verified on live PostgreSQL/Vercel.
- Never claim unimplemented connectors, outbound messaging, e-invoicing, calibrated ECL, SSO, compliance certification,
  or complete enterprise readiness. Maintain `docs/RELEASE.md` as scope evolves.
- Conventional commits: `<type>(<scope>): <lowercase description under 72 chars>`.
  Scopes: ar-dashboard, invoice, collections, treasury, agents, auth, db.
