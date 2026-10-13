# Auth profiles

Standalone `auth.users` identities retain canonical UUIDs and display metadata.
The ordered PostgreSQL migrations create profile synchronization triggers and
RLS. A user may read only their profile and update only `full_name` and `avatar_url`.
Email, provider, identity and timestamps cannot be changed through profile access.
Names are bounded to 200 characters, avatars to 2048; treat both as untrusted data.

Profiles grant no financial access. Memberships, tenant/entity foreign keys and
live session assurance authorize finance reads and writes. There is no profile
role or automatic administrator. Invitations assign a role only through an
explicit trusted operator command.

The `o2c_private` synchronization functions use an empty search path and qualified
objects. Anonymous and authenticated roles cannot execute them. Runtime identity
operations use a separate restricted backend role; finance transactions switch
to the authenticated role and remain subject to RLS.

Tests exercise profile backfill, identity synchronization, own-row edits,
cross-user isolation, protected columns, anonymous denial and no membership creation.
Actual hosted onboarding and recovery still require deployment checks. No synthetic
users or financial records are provisioned by application migrations.
