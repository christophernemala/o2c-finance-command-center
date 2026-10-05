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

echo "Setup complete. Start development with: npm run dev -- --strictPort"
