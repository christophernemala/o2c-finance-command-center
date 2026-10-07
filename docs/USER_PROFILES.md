# Auth profiles

Apply `20261006115901_user_profiles.sql` after the existing finance migrations,
first in staging. Review existing `public.profiles` and Auth triggers before deployment.
The migration intentionally rejects an existing profiles table rather than silently
accepting incompatible columns or permissions. It does not replace other Auth triggers.

Profiles contain display attributes only. Financial access continues to require a
confirmed Auth identity and a real `public.memberships` entry resolved through
`workspace_access()`. There is no profile role, automatic admin, or tenant provisioning.

An Auth insert creates a profile. Existing real Auth users are backfilled. Auth email
and provider changes synchronize those fields, preserving edited display attributes.
Email is nullable and is not a second unique identity key; `auth.users.id` is canonical.
Users can select only their own row and update only `full_name` and `avatar_url`.
Names are limited to 200 characters, avatars to 2048. Treat both as untrusted display
data; render names as text and validate avatar origins before adding an image UI.
Database triggers maintain `updated_at`; clients cannot alter identity or timestamps.
Profile deletion follows Auth deletion, subject to other existing Auth foreign keys.

Privileged synchronization runs in `o2c_private` with a fixed empty search path and
qualified object names. Anonymous and authenticated roles cannot call those functions
through the API. Keep `o2c_private` outside the Data API exposed-schema list.

The embedded PostgreSQL test exercises existing-user backfill, new users without email,
own-row reads and edits, other-user isolation, protected-column write denials, anonymous
denials, no membership creation, Auth identity synchronization and deletion cascade.
It does not prove hosted Auth signup/OAuth behavior. Before production, test the exact
migration on staging with real password signup/invites, enabled OAuth providers, existing
Auth triggers, JWT-backed own-row requests and cross-user denial. Trigger failures can
block Auth writes; do not swallow them or deploy an untested trigger to production.

No generated users, tenants, invoices, balances, or other financial records are added.
