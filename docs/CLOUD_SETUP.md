# Reproducible cloud development setup

This project demonstrates an O2C finance dashboard built with React, TypeScript,
and Vite, with deterministic finance data and offline Excel reporting.

## Install and validate

Use Node.js 24 and npm. From the repository checkout, run:

```bash
bash scripts/setup-cloud.sh
```

The script installs dependencies from the committed lockfile, checks TypeScript,
builds the production app, generates 1,250 finance records, and creates the daily
Excel finance pack and sample invoice PDFs. Outputs are ignored by Git in
`dist/`, `local-data/`, and `reports/`. No API keys or database are required.

## Start development

```bash
npm run dev -- --strictPort
```

Vite serves the application on port 5174. In a cloud environment, use the existing
checkout: each task is already isolated, so a separate Git worktree is unnecessary
unless explicitly requested. Restart the server in each new task; running
processes are not part of a saved environment snapshot.

## Validation scope

Onboarding verified the production build, generated record counts, the 17-sheet
Excel pack, 12 PDF headers, and development-server HTML and compiled React module
responses. Browser interactions were not tested, and no automated test suite is
currently configured.
