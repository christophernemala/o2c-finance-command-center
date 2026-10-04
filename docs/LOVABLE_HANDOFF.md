# Lovable handoff

Target repository: `christophernemala/o2c-finance-command-center`.
Review branch: `codex/feat/production-workspaces`.

First verify the Lovable project's GitHub connection points to this exact repository.
Do not edit a similarly named Finance Control Hub project or create a separate copy.
Synchronize the reviewed branch using the project's supported GitHub workflow.

Preserve Next.js App Router, Supabase SSR, strict TypeScript, decimal-string financial
contracts, and the approved database command boundaries. Confirm the actual Lovable
runtime supports this stack before attempting a build or rewriting configuration.

Apply the user-selected https://stripe.com/en-nl visual direction through existing
`DESIGN.md`, `STYLEGUIDE.md`, semantic tokens, and shared components. The locked
tokens are `#0B1224`, `#8B7CF8`, `#6DD3C5`, `#F6F5F8`, `#A89CFF`, and `#E9E5FF`.
Do not copy Stripe branding or invent financial results to populate the interface.

Use the existing stack in this repository. It is Next.js 16 App Router, React 19,
strict TypeScript, Tailwind 4, Supabase SSR/PostgreSQL, and Decimal.js. Do not
downgrade to Next.js 14 or introduce Clerk, Prisma, Framer Motion, shadcn, Radix,
21st.dev, or UIverse unless a separate reviewed change demonstrates a concrete need.
Supabase Auth is the current identity authority; do not add a second auth system.

The supported product URLs are `/login`, `/dashboard`, `/customers`, `/invoices`,
`/cashflow`, and `/reconciliation`. Additional controlled workspaces remain available
through the existing navigation. DSO, CEI, and the 13-week cash forecast must stay
unavailable until their governed inputs are connected. Never hard-code `42 days`,
`87.3%`, forecast values, customer names, TRNs, invoice references, PDC dates, or
1,250 generated rows.

No demo accounts, seeded finance rows, fabricated agent runs, generated payment
proof, optimistic ledger posting, default ECL rates, or fake connection indicators.
When a real integration is absent, retain the explicit unavailable state.

Rejected configuration from the supplied draft prompt:

- Never use localStorage for authentication; it stores only the non-sensitive theme preference.
- Never disable robots rules or mirror third-party websites into this repository.
- Do not add an SPA catch-all rewrite or `dist` output. Vercel uses the checked-in
  Next.js configuration, `npm ci`, `npm run build`, and framework-managed output.
- Do not implement per-instance in-memory login throttling or application bcrypt.
  Configure Supabase Auth rate limits, password policy, MFA, and abuse protections
  in the selected live project, then verify them end to end.

Do not bypass maker/checker approval, execute real financial transactions, apply
production migrations, install paid integrations, or publish automatically. Report
changed files, build/test evidence, preview URL, and actual connection limitations.
