# Repository consolidation (2026-10-15)

`o2c-finance-command-center` is the single product repository. Two other AR/O2C
repositories were audited, read-only, and should be deleted by the owner from
GitHub (Settings → Danger zone). This session cannot delete repositories.

## christophernemala/o2c-orchestration-saas: delete
An unmodified `npm create vite` starter (counter demo). It contains no O2C code,
data or logic. The README describes features that do not exist. Nothing was ported.

## christophernemala/o2c-orchestration-platform: delete (or make private first)
A React/Vite front-end demo:
- every screen renders bundled seed data;
- authentication is simulated in `localStorage`;
- money is JavaScript `number`;
- RLS policies use `using (true)`;
- the edge functions return `queued` without doing anything;
- the README claims SOC 2, SSO, cryptographic tamper detection and ERP adapters, none of which exist.

**Risk:** `supabase/seed.sql` attaches invented balances and bank transfers to real
UAE companies, and the docs reference a former employer by name. Both are public.
Remove that repository promptly.

### Ideas ported, rebuilt properly here

| Idea from the platform repo | Implementation here |
|---|---|
| Three-tier cash matching (match / review / exception) | `agent_cash_candidates` in SQL with `numeric` comparisons, exact and review tiers, plus the policy rule in `agent_auto_post` |
| Aging buckets in SQL | `agent_ar_overview` buckets (Current to 180+) |
| AI safety envelope (drafts only, approval required) | Agent role in PostgreSQL. Drafts are recorded as findings with `delivery: not sent`. Auto-posting is a deterministic SQL predicate. |
| Finance invariants (allocations ≤ open, journals balanced) | Already enforced by `propose_action` / `post_approved` and covered by tests |

Not ported: fake auth, seed data, float arithmetic, simulated integrations, landing
page, unrelated ML training files, and the Spec-Kit scaffolding.
