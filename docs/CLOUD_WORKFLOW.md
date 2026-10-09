# Cloud workflow

GitHub is the source of truth for application code and public documentation.
Edit in GitHub Codespaces, run verification in Codespaces or GitHub Actions,
and use Vercel for hosted previews. No Windows checkout is required.

## Open the cloud workspace

1. Open the repository on GitHub and select the branch under review.
   The current light UI work is on `codex/light-finance-workspace` (PR #3).
2. Select **Code → Codespaces → Create codespace on this branch**.
   The checked-in dev container uses Node 22 and runs `npm ci`.
3. Edit, commit and push inside the browser editor. Commit durable work before
   stopping the codespace; GitHub commits remain the durable source archive.
4. Run `npm run verify` and `npm audit --audit-level=high` in the cloud terminal.
   The existing GitHub Actions workflow runs these gates on every push and PR.
5. Inspect the Vercel preview associated with that commit. Financial workflows
   still require real Supabase users, memberships, and source records.

The Codespaces start screen controls account authorization, machine selection and
billing. This configuration does not create a running codespace or prove it boots.
Never copy a Windows checkout, local credential store, or local environment file
into it. Configure only required staging credentials as repository-scoped
Codespaces secrets. Use Vercel environment settings for hosted app secrets.

## Storage destinations

| Material | Durable destination | Access |
| --- | --- | --- |
| Application code, migrations, tests, public docs | GitHub commits | Repository visibility |
| Development runtime and temporary build outputs | GitHub Codespaces | Authorized developer |
| Hosted application | Vercel | Deployment configuration plus application Auth |
| Financial records, approvals, audit evidence | Supabase PostgreSQL | Tenant/entity authorization and RLS |
| Validated original CSV imports | Supabase Storage `o2c-source-files` | Private, scoped authenticated access |
| Private conversation history and continuation archives | Owner-controlled private Google Drive | Explicit private permissions |
| Secrets | Provider secret settings | Restricted provider access |

The repository is public. Do not commit private customer data, chat history,
bank evidence, credentials, or environment files. GitHub Actions logs must not
print them. Runtime caches and dependency folders are reproducible artifacts;
they are not source archives.

## Financial source files

The app already stores validated original CSV bytes in the private
`o2c-source-files` bucket before staging an import. Paths include tenant, legal
entity, uploader and the SHA-256 content digest. The bucket limit is 1 MB and its
allowed MIME type is `text/csv`. Application INSERT/SELECT policies require
authorized scope; application overwrite/delete is denied.

Cloud storage does not grant financial posting authority. Independent import
review and transactional database authorization remain required. This path
supports controlled CSV imports; it does not provide arbitrary PDF/image uploads
or migrate every file from a developer's computer.

Create or change buckets through the Supabase Storage API/dashboard. Do not use
direct SQL edits of Storage metadata for future bucket/object operations.
Preserve applied historical migrations; use reviewed forward changes.

## Browser and preview behavior

The light UI does not persist application state in browser localStorage or
sessionStorage. Supabase SSR uses session cookies for authentication; financial
records remain in Supabase. Temporary input/CSV previews exist only in browser
memory until the authenticated request uploads the file.

`npm run dev` listens on loopback port 5174 inside the codespace. Keep the
forwarded port private. Prefer Vercel for authenticated workflow testing:
Codespaces forwarding alone does not configure a trusted client-IP source,
Auth callbacks, Redis or production secrets. Never weaken Auth/RLS to preview UI.

## Verified state — 2026-10-08

- PR #1 is merged. PR #3 contains the proposed light UI and remains a draft.
- Live Storage metadata reports the private 1 MB CSV bucket.
- Live Auth users, memberships and stored objects were all zero at this check.
- The existing private continuation archive was confirmed in Google Drive;
  returned permission metadata contained only the owner.
- Codespaces enumeration returned HTTP 403 because the current GitHub credential
  lacks the `codespace` scope. No running workspace was created by this change.
- This update writes source directly to GitHub. Existing Windows copies are
  retained for recovery; no local deletion or full-device migration is claimed.

A bucket and passing CI do not establish real uploads or finance operations.
Complete real identity/workspace provisioning and verify uploads with ordinary
user JWTs before claiming live operational readiness.

## Provider references

- [GitHub dev containers](https://docs.github.com/en/codespaces/setting-up-your-project-for-codespaces/adding-a-dev-container-configuration/introduction-to-dev-containers)
- [Codespaces port forwarding](https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace)
- [Supabase Storage metadata design](https://supabase.com/docs/guides/storage/schema/design)
