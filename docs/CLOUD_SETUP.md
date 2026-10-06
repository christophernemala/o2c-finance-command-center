# Reproducible cloud development setup

Use the existing isolated checkout; do not create a Git worktree unless explicitly
requested. Use Node 24 and Python 3.12.

```bash
bash scripts/setup-cloud.sh
```

This installs dependencies, builds the React app, generates 1,250 finance records
and offline reports, installs hash-verified Flask dependencies in `.venv`, and
runs backend authentication tests. Generated files and databases are ignored.

Follow [authentication setup](AUTHENTICATION.md) to configure SMTP and secrets,
provision a work account, and start Flask on port 5000 plus Vite on port 5174.
The original logo, colors, theme, and stylesheet are preserved. Demo credentials
are removed; login requires a password and email verification.

Retained files can survive a snapshot; running servers must restart each task.
Live SMTP requires provider credentials and outbound connectivity configured
separately. Tests use a temporary local inbox, not live email.

See [validation commands](AUTHENTICATION.md#run-checks) and deployment limitations
before publishing a production service.
