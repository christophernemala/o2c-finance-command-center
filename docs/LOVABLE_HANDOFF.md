# Lovable production handoff

Target repository: `christophernemala/o2c-finance-command-center`.
Review branch: `codex/feat/production-workspaces` (draft PR #1).

## Verify the target before editing

The connected Lovable workspace currently contains nine projects, but none is named
for this repository and no project has been proven to use its GitHub branch. Do not
edit a similarly named Finance Control Hub, AR Flow Insights, Accounts Command Center,
or Finance Hub Pro project. First verify the exact GitHub repository and branch in
Lovable. If that evidence is unavailable, stop without creating a duplicate project.

Figma access is available, but no Figma file or node was supplied for this handoff.
Use the checked-in `DESIGN.md` and `STYLEGUIDE.md` as the reviewed design source until
the product owner identifies a specific Figma file.

## Preserve the implemented architecture

- Next.js 16 App Router, React 19, strict TypeScript, Tailwind 4.
- Supabase SSR/Auth and PostgreSQL. The browser app uses only the public project URL
  and publishable key. Never add a service-role key to Vercel application variables.
- Decimal.js and decimal-string transport for AED. Database amounts are numeric.
- Tenant/entity scope, PostgreSQL RLS, security-definer command boundaries,
  independent maker/checker approval, version checks, idempotency, and audit evidence.
- Server Components by default. Local storage is limited to the non-sensitive theme.

Do not introduce Clerk, Prisma, a second auth system, an SPA catch-all rewrite, or a
`dist` output directory. Do not downgrade Next.js. Add a dependency only for a
concrete reviewed feature that the existing stack cannot provide.

## Product and visual contract

Supported routes are `/login`, `/dashboard`, `/customers`, `/invoices`, `/cashflow`,
and `/reconciliation`. The locked palette is `#0B1224`, `#8B7CF8`, `#6DD3C5`,
`#F6F5F8`, `#A89CFF`, and `#E9E5FF`. Apply it through existing semantic tokens and
shared components. Do not copy third-party branding or assets.

No demo accounts, seeded finance rows, generated companies, TRNs, invoices, balances,
PDC dates, agent runs, payment proof, ECL rates, or fake connection status. Missing
integrations and governed inputs remain explicitly unavailable.

Total AR and overdue AR come from the authenticated full-entity database snapshot.
The six custom SVG charts also use full-entity SQL aggregates, not paginated rows.
DSO and CEI remain unavailable without governed sales/collection-period inputs.
The 13-week direct-method forecast reads preserved independently approved
`cashflow_runs`; follow `docs/CASHFLOW_INPUTS.md` for source ingestion. No adapter is
connected by this change. Invoice due dates alone are not a cash forecast.

## Production login contract

Password login uses `supabase.auth.signInWithPassword` on the server. A successful
credential check is followed by `workspace_access`. If the user has no real membership,
the session is signed out and the same generic `Incorrect email or password.` message
is shown. A valid member is redirected to `/dashboard` with the first authorized
tenant selected. The application never creates a tenant or membership during login.
Zod validates server inputs. Configure the durable Redis limiter using the three
server-only variables in `.env.example`; follow `docs/SECURITY.md`. Missing sign-in
protection disables login. Do not replace it with an in-memory map or browser state.

The actual schema uses `public.memberships` and roles `viewer`, `maker`, `approver`,
and `admin`. It does not contain `tenant_memberships`, tenant slugs, or an `owner` role.
The migration already enables RLS and includes `member_read` with
`user_id = auth.uid()`. Do not add a recursive membership-management policy.

Create the first real tenant, AED entity, Auth user, and `admin` membership through a
trusted database administrator after selecting an active Supabase project. Use
`docs/PRODUCTION_PROVISIONING.md`; never put credentials or real user passwords in Git.

## Provider status observed on 2026-10-05

- Supabase exposes one project, `vaxsnungigkeqxaolqvo`, and it is `INACTIVE`. No live
  migration, user, tenant, or membership was created.
- Vercel builds pass, but the connector returns 403 for team scope
  `christophers-projects-896fb086`. Deployment protection cannot be changed or verified
  through the current connection.
- Lovable has no verified project connected to this repository.

These facts block live authentication and production qualification. They are not
reasons to add fallback authentication or sample records.

## Validation before any push or promotion

Run `npm run typecheck`, `npm test`, and `npm run build`. Verify all six product routes,
live Supabase JWT/RLS behavior with at least two tenants, maker/checker separation,
revoked-role behavior, retry/idempotency, live security headers, and the protected or
public status intended for that environment. Report local, provider, and browser
evidence separately. Do not merge or promote because a build alone succeeds.

The reusable review specifications are in `docs/INVOICE_ARITHMETIC_AUDITOR.md` and
`docs/ACCESSIBILITY_AUDIT.md`.
