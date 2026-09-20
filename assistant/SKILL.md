# Assistant Skill — F9 O2C Command Center

This skill file configures how the **assistant agent** must behave when working on `o2c-finance-command-center`. It is inspired by Prompt Genie–style autoprompting, but runs inside this repo and codebase.

The goals are:
- No hallucinations
- No incomplete tasks
- 3–4 review/audit passes before confirming any change
- Strict use of SKILLS and ARCHITECTURE/ORCHESTRATION docs

---

## 1. Behaviour Rules

1. **Read specs before acting**
   - Always read:
     - `README.md`
     - `AGENTS.md`
     - `SKILLS.md`
     - `ORCHESTRATION_PLAN.md`
     - `ARCHITECTURE.md`
   - For design and UX, cross-check `DESIGN.md` (when added).

2. **No hallucinations**
   - Do not invent:
     - Financial formulas
     - Database schema fields
     - API endpoints
     - UI components that are not defined in specs
   - Use only:
     - Deterministic logic from `SKILLS.md`
     - Architecture patterns from `ARCHITECTURE.md`
     - Implementation phases from `ORCHESTRATION_PLAN.md`.

3. **Task completeness**
   - Every task must be fully implemented before it is marked done:
     - Code written
     - Type-checks passing
     - Linting passing
     - Relevant tests updated or added
     - Docs updated when needed.

4. **Review and audit cycles**
   - For each task, perform at least **three review passes**:
     - **Review 1 — Logic & specs**
       - Check implementation against SKILLS and specs.
     - **Review 2 — Types & safety**
       - Check TypeScript types, Zod schemas, and RLS/role logic.
     - **Review 3 — UX & edge cases**
       - Check UI behaviour, empty states, errors, loading.
     - **Optional Review 4 — Performance & clarity**
       - Check for unnecessary complexity and performance issues.

5. **Diff-based thinking**
   - Before changing code, inspect current implementation and explain:
     - What will change
     - Why it changes
     - How it affects tests and data.

---

## 2. Prompting & Autopilot Pattern

### 2.1 Task prompt template

When starting a task, use an internal prompt structure similar to Prompt Genie:

1. **Context**
   - Summarize the current feature and related specs.

2. **Goal**
   - Describe exactly what needs to be built or fixed.

3. **Constraints**
   - No new repos
   - No demo users
   - No secrets in UI
   - Respect RLS and governance.

4. **Plan**
   - List 3–6 steps to complete the task.

5. **Checks**
   - List the validation and review steps.

### 2.2 Execution phases

- **Phase A — Read & plan**
  - Read specs and existing code.
  - Write a short internal plan.

- **Phase B — Implement**
  - Write or update code in small, focused changes.

- **Phase C — Review**
  - Run the 3–4 review cycles above.

- **Phase D — Document**
  - Update relevant `.md` files when behaviour or schema changes.

---

## 3. Use of SKILLS and YAML

### 3.1 SKILLS.md

- Treat `SKILLS.md` as the **logic bible**:
  - Aging buckets
  - IFRS 9 ECL matrix
  - Reconciliation scoring
  - Risk scoring
  - Chart specifications.

- Never alter these rules without explicit spec changes.

### 3.2 Additional skills files

- When present, use:
  - `skills/api-governance.yml` — API call policies
  - `skills/bug-scan.yml` — pre-commit bug scanning checklist
  - `skills/transitions-dev/*.md` — motion and transitions
  - `skills/emilkowalski/*.md` — UI animation and toast/drawer usage

- These skills must be executed or checked before:
  - Introducing new API calls
   - Changing motion and animations
   - Confirming UI changes.

---

## 4. Frontend & Backend Implementation Rules

### 4.1 Frontend

- Use React + TypeScript.
- Use Tailwind + shadcn/ui (or equivalent) for layout and components.
- Use Transitions.dev and Emil Kowalski skills for motion.
- Use Supabase client + TanStack Query for data fetching.
- Use React Hook Form + Zod for forms.

### 4.2 Backend

- Use Supabase Postgres for data and Supabase Auth for identity.
- Apply RLS on all tenant-specific tables.
- Implement domain logic (aging, ECL, FX, credit limits) as pure functions.
- Use Zod in server/edge functions for validation.

### 4.3 Governance

- All agent actions must pass through control plane:
  - Validate DTOs
  - Assign confidence & risk
  - Log actions in `agent_audit_trail`
  - Require human approval for high-risk tasks.

---

## 5. Bug & Manipulation Prevention

- Before extracting or transforming data:
  - Check types and schemas.
  - Ensure no direct user-controlled input reaches SQL without validation.

- Before confirming a task:
  - Run automated tests (where available).
  - If adding new behaviour, add tests.

- Never suppress errors silently; report and log them.

---

This `assistant/SKILL.md` file must be read and followed by the assistant agent before performing any work in this repository.
