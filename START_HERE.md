# Start here — O2C Finance Command Center

This repository is the single source of truth for the O2C application. Use this
page to choose the correct code, cloud workflow, design, and release checklist.
The project has a governed implementation and a proposed light workspace;
production cutover and real-account onboarding are still pending.

## Which version should I use?

| Purpose | Use | Status |
| --- | --- | --- |
| Accepted application source | [Default branch](https://github.com/christophernemala/o2c-finance-command-center) | Governed Next.js/Supabase foundation. Being on the default branch does not establish live deployment readiness. |
| Current development and light UI | [Add light O2C workspace and recorded agent cards](https://github.com/christophernemala/o2c-finance-command-center/pull/3) | Open draft proposal on `codex/light-finance-workspace`; work here until release gates are satisfied. |
| Older continuation notes | [Document cloud continuation, Figma design and AR/O2C architecture](https://github.com/christophernemala/o2c-finance-command-center/pull/2) | Open draft handoff; compare useful notes against the current source rather than treating it as a second application. |
| Screen designs | [O2C — Finance Workspace Design](https://www.figma.com/design/M1jFrwjc16qDMTpSf3RBI3?node-id=2-2) | Five SVG screen designs and a visual foundation. Native Figma components, auto-layout and interactive prototype remain pending. |
| Architecture | [O2C governed cloud architecture](https://www.figma.com/board/lYiw6zDVRDua7Y6boXR3Jr) | FigJam diagram of the implemented hosting, identity, data, storage and limiter boundaries. |
| Reproducible design source | [Design handoff](docs/design/README.md) | Versioned SVG and Mermaid source in this repository. |
| Private history and evidence | Owner's private Google Drive continuation archive | Private context only; keep credentials, business records and private conversations out of this public repository. |

Legacy Lovable screens and ConnectHub images are visual references. They do not
authorize adding demo authentication, invented financial records, connected-channel
claims or customer identities to this application.

## Where everything belongs

- **GitHub:** application code, migrations, tests, public-safe documentation and design source.
- **GitHub Codespaces:** cloud development using the checked-in devcontainer.
  Configuration is prepared; a running Codespace and its approved usage budget
  must be verified before claiming the cloud development environment is ready.
- **GitHub Actions:** cloud verification; use the checks for the exact commit being reviewed.
- **Vercel:** hosted preview and eventual production deployment.
- **Supabase:** real identity, authorized tenant/entity memberships, financial
  records, audit evidence and private original CSV files.
- **Figma/FigJam:** inspectable screen designs and architecture.
- **Private Google Drive:** private continuation packages and historical evidence.

The Codex sidebar section **O2C Finance Command Center** groups the identified
O2C conversations. It is a navigation group, not a filesystem directory, a merged
conversation, or a registered Codex project. Existing local working copies are
not deleted or moved by this organization.

## Repository map

| Location | Purpose |
| --- | --- |
| `src/app/` | Next.js pages, server routes and authenticated workspace views |
| `src/components/` | Reusable application UI |
| `src/lib/` | Shared server, database and exact-decimal finance utilities |
| `supabase/migrations/` | Versioned database, authorization and governed command changes |
| `tests/` | Focused automated verification |
| `.devcontainer/` | Cloud development configuration |
| `.github/workflows/` | Cloud CI |
| `docs/` | Provisioning, security, operations and release gates |
| `docs/design/` | Versioned design and architecture source |

Follow [the cloud workflow](docs/CLOUD_WORKFLOW.md) for development. Reuse the
existing components, database utilities and types before creating alternatives.
Cloud code and governed cloud records remain authoritative; temporary local
copies and browser state must never become the financial system of record.

## Remaining work before a production launch

1. Invite real users and provision the intended company, AED legal entity and
   memberships using [production provisioning](docs/PRODUCTION_PROVISIONING.md).
   The cloud inspection recorded on 8 October 2026 found no Auth users or memberships;
   re-check live state before provisioning, since this observation can change.
2. Verify the exact Vercel target, framework, environment and deployment. A ready
   build or a visible login page is insufficient evidence of successful application access.
3. Prove real login, authorized scope, cross-tenant denial, independent review,
   imports, posting and audit behavior on the hosted environment.
4. Complete the [release gates](docs/RELEASE.md) before merging or promoting the
   proposed workspace.
5. Treat LLM services, external background schedulers, customer-message delivery,
   and ERP/bank adapters as pending integrations. Current agents perform durable
   source-based analysis; designs must not imply these external services are connected.

Financial values remain exact decimal strings and database numeric values.
Profiles are display-only; workspace access depends on governed memberships.
Ledger-affecting actions retain independent human approval.

## Visual references awaiting review

The owner supplied [Vibe UI](http://vibeui.online),
[Emil Kowalski's GitHub profile](https://github.com/emilkowalski), and
[Mitte MCP](https://mitte.ai/mcp), plus dashboard and inbox reference images.
These links are recorded as references, not verified dependencies, installed MCP
servers, integrated services or approved changes to the application stack.
