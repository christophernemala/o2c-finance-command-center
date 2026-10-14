# Autonomous AR platform — one project

The consolidated candidate is `codex/unified-cloud-audit` in the existing
`christophernemala/o2c-finance-command-center` repository. It combines the
standalone PostgreSQL/custom Auth implementation with the light workspace,
cloud devcontainer and versioned customer screen designs. It preserves the
existing exact-money, RLS, independent approval and transactional posting controls.

The owner selected standalone PostgreSQL with custom Auth on 14 October 2026.
Supabase is a retained historical provider, not the candidate's runtime backend.
Do not combine both identity systems or replay old balances as new invoices.

## Start here

| Need | Authoritative location |
| --- | --- |
| Findings and launch gaps | [Unified audit](docs/UNIFIED_AUDIT.md) |
| Cloud development and staging | [Cloud workflow](docs/CLOUD_WORKFLOW.md) |
| Agent architecture and approval boundaries | [Harness dossier](docs/AGENT_HARNESS.md) |
| Database migration and rollback | [PostgreSQL guide](docs/POSTGRESQL_MIGRATION.md) |
| Real-user setup | [Provisioning](docs/PRODUCTION_PROVISIONING.md) |
| Implemented UI contract | [Design](DESIGN.md) and [style guide](STYLEGUIDE.md) |
| Future customer screens | [Design gallery](docs/design/README.md) |
| Release evidence and limitations | [Release qualification](docs/RELEASE.md) |

AR, collections analysis, treasury reconciliation/cashflow, approvals, imports
and audit share one authenticated application and one scoped finance database.
Northstar Treasury's additional features require a controlled port into these
contracts. Its separate Supabase identity and service-role helper are not imported.

This repository is public. Keep chat transcripts, credentials, invitations and
business records in private storage. Existing branches and local work remain
recoverable. A source candidate, a hosted preview and a qualified production
service are distinct deliverables.
