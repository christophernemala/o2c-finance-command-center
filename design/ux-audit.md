# UX audit

Scope: every route in `src/app` as it stands on PR #6 head (`bcfd90e`).
Method: a code review of the pages and components. The pages have not yet been rendered in a browser at 375 px. That visual check is part of the design-system step and will confirm or correct the mobile findings below.

## Routes and what the user does there

### Signed out

| Route | Purpose |
|---|---|
| `/login` | Password sign-in, Google/Microsoft buttons when configured, link to email-code sign-in |
| `/login/code` | Request a six-digit code, then enter it |
| `/signup` | Registration request, which an administrator reviews |
| `/auth/verify` | Authenticator (MFA) code after sign-in |
| `/auth/security` | Enrol an authenticator, link Google/Microsoft |
| `/privacy` | Draft privacy notice |

### Signed in

There is one route, `/`, which shows one of 17 views chosen by `?view=`.

| View | What the user does |
|---|---|
| `overview` (also `/dashboard`) | KPIs (open, overdue, DSO, CEI), aging, recent activity |
| `receivables` (also `/invoices`) | Invoice list, paged |
| `reconciliation` (also `/reconciliation`) | Cash application: match bank lines to invoices, approve, post |
| `approvals` | Maker/checker queue |
| `collections` | Worklist, call list, follow-ups, licence alerts, hold proposals, customer drawer, outbox |
| `customers` (also `/customers`) | Outstanding by category, region or account; segment upload |
| `notes` | Credit and debit notes: propose, approve, post |
| `cashflow` (also `/cashflow`) | 13-week cashflow |
| `reports` | AR pack, daily Excel export |
| `agents` | Run agents, see runs and steps |
| `operations` | Agent health, agent map, edge failures |
| `incidents` | Agent incidents |
| `guardrails` | Create or simulate guardrails, promote them |
| `copilot` | Chat with uploads |
| `ecl` | ECL review |
| `imports` and `/imports/[id]` | Import review |
| `audit` | Audit explorer |

The `/dashboard`, `/invoices`, `/customers`, `/cashflow` and `/reconciliation` routes are six-line wrappers that call the root page with a fixed `view`.

## Top 10 problems

### 1. A failed query shows a blank view, not an error

**Where:** `src/app/page.tsx`. When an RPC fails, `analysis` is never set. The agents, operations, collections, customers, notes, incidents and guardrails views all behave this way.

**Effect:** the page renders the frame with nothing in it. The user cannot tell whether the view is empty, failed, or forbidden.

**Fix:** each view returns a tagged result, and an `ErrorState` names the problem (forbidden, unavailable or invalid) with a retry link.

### 2. The error boundary is generic, and errors in the layout are not caught

**Where:** `src/app/error.tsx` exists. It shows "Workspace unavailable" with a retry button for every kind of failure. There is no `global-error.tsx`.

**Effect:** a forbidden view, an outage and a bad link all read the same. An error thrown in the root layout itself falls through to Next's default page, which has no navigation and no way back.

**Fix:** route `error.tsx` through the design-system `ErrorState`, so the copy depends on the kind of failure. Add `global-error.tsx` for errors thrown in the layout.

### 3. Tables overflow on phones

**Where:** 14 `<table>` elements across 10 components. Only 4 are wrapped in `overflow-x-auto`. Examples include `workspace.tsx` (receivables, cash application), `reports.tsx`, `customers.tsx` and `chart-explorer.tsx`.

**Effect:** at 375 px, wide finance tables push the page sideways or get clipped.

**Fix:** one `DataTable` that is sortable and filterable. Below 640 px it becomes stacked cards: the label on the left, the value on the right, and the key amount pinned at the top.

### 4. Mobile navigation is a collapsed list with 17 items

**Where:** `workspace.tsx:58`. On mobile the sidebar becomes a `<details>` element labelled "Workspaces · …".

**Effect:** every move takes two taps, and there is no persistent way to get back to the main views.

**Fix:** a bottom tab bar with five items (Overview, Receivables, Collections, Agents, More), with 44 px targets and safe-area padding. "More" opens a sheet with the remaining views. Desktop keeps the sidebar.

### 5. Missing KPIs look the same as an error, and as zero

**Where:** `page.tsx`. When `report_ar_pack` fails or does not validate, DSO and CEI quietly show "Unavailable".

**Effect:** the user can't tell "not enough data yet" from "the report failed".

**Fix:** `StatTile` gets three explicit states:
- a value, with its as-of date;
- "Not enough data", with a reason;
- "Couldn't load", with a retry.

### 6. Money is AED-only, and units are not always shown

**Where:** `formatAed` everywhere. Labels say "(AED)". Input patterns allow only 2 decimals.

**Effect:** the app cannot be used for any other currency, and some figures are shown without a currency code.

**Fix:** a `Money` component that always shows the currency code and that currency's own number of decimals (KWD 3, JPY 0). Inputs take their pattern from the entity's currency. This is the Phase 2 back-end work.

### 7. "Today" is Dubai time for everyone

**Where:** `page.tsx` sets `asOf` from `Asia/Dubai`. The same assumption is in `export/route.ts`, `ai/config.ts` and SQL `dubai_today()`.

**Effect:** an entity in Kolkata or New York gets the wrong overdue status and wrong daily totals around midnight.

**Fix:** a time zone per entity, `entity_today(entity)`, and a `DateTime` component that labels the zone.

### 8. Every view loads the full workspace snapshot

**Where:** `page.tsx` calls `snapshot(...)` before branching on `view`, even for copilot or guardrails.

**Effect:** slower page loads. This also makes the Lighthouse mobile-performance target harder to meet.

**Fix:** each view loads only what it shows. The header data (tenant, entity, counts) is one small query.

### 9. Loading state is one page-wide spinner

**Where:** the single root `loading.tsx`, with no skeletons.

**Effect:** the layout jumps when content arrives, which counts against Lighthouse's layout-shift (CLS) score. Long agent or report queries feel frozen.

**Fix:** a `Skeleton` that matches each view's layout. Slow panels stream in through `<Suspense>`.

### 10. Forms are validated differently on the client and the server

**Where:** server routes use zod (for example `api/collections/route.ts`). Client forms rely on HTML `pattern` attributes that repeat the rules by hand, such as the 2-decimal regex.

**Effect:** the two drift apart. For example, the browser accepts a value that the server then rejects with a generic "failed" redirect.

**Fix:** one zod schema per intent in `src/lib/validation`. The client checks with the same schema before submitting and shows field-level messages. The server messages map to fields.

## Smaller issues

These go into the design-system and page steps:

- Status feedback uses `role="status"` in some places and nothing in others. Toasts need one live region.
- The empty-tenant and empty-entity screens (`page.tsx`) are bare text. Use `EmptyState` with the next action.
- After a mutation, the result arrives only as a `?message=` query flag, which persists on refresh. Show a toast and clear the flag.
- The entity switcher exists, but there is no currency switcher and no consolidated view. Both arrive in Phase 2.

## Core flows (target)

1. **Login:** email and password, or email code, or Google/Microsoft, then MFA if enrolled, then the last-used tenant and entity, then Overview.
2. **Dashboard overview:**
   - Per entity or consolidated, chosen with the switcher.
   - Shows DSO, overdue total, aging buckets (0–30, 31–60, 61–90, 90+) and collected this month.
   - Every figure has a currency code and an as-of date in the entity's time zone.
   - Consolidated figures show the exchange rate used and its date.
3. **Receivables:** a filterable `DataTable` (status, bucket, customer, currency). A row opens the invoice sheet.
4. **Customer detail:** a sheet with balance, aging, contacts, promises, remarks, holds and statement PDF.
5. **Collections and aging:** worklist ranked by priority, then the customer sheet. From there the user logs a remark, proposes a message (sent only after a checker approves it), records a promise, or proposes a hold.
6. **AI agent actions:**
   - The user starts a run and watches its steps stream in.
   - Proposals land in Approvals, and a different person approves them.
   - Auto-post happens only under an active policy.
7. **Settings:** entities (currency and time zone), exchange rates (manual or CSV import, maker/checker), and members and roles.
