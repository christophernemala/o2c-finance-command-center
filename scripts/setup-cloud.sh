#!/usr/bin/env bash
set -euo pipefail

# Run from any directory. Requires Node 24 and npm.
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"

node --version
npm --version
npm ci --cache "${TMPDIR:-/tmp}/o2c-npm-cache" --no-audit --no-fund
npm run build
npm run generate:data
npm run workflow:daily

python3 -m venv .venv
.venv/bin/python -m pip install --require-hashes --cache-dir "${TMPDIR:-/tmp}/o2c-pip-cache" -r backend/requirements-dev.txt
.venv/bin/python -m pytest backend/tests/test_auth.py -q

echo "Setup complete. Follow docs/AUTHENTICATION.md to configure SMTP and provision an account."
echo "Start Flask and Vite as documented; login requires the backend and email verification."
