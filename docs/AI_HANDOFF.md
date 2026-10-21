# Shared Claude / Codex handoff

Repository: `christophernemala/o2c-finance-command-center`.
Active working branch: **`codex/cinematic-login`**. Both models use this branch.
Base: `claude/elegant-goldberg-v8g58h` at `4098b5b`, including the work in PR #6.
A model name in a branch is just a label; it does not restrict who can edit it.

## Starting or switching models

Only one model should write at a time. Ask the outgoing model to commit and push
its work and update this file with checks, outstanding issues and the next task.
The incoming model must inspect its existing changes before switching branches.
In a clean checkout:

```sh
git fetch origin
git switch codex/cinematic-login
git pull --ff-only origin codex/cinematic-login
git status --short --branch
```

If the local branch does not exist, use
`git switch --track origin/codex/cinematic-login`.
If changes or divergent history exist, preserve them and investigate. Never use
reset --hard, force-push, a new project or an automatic merge to hide divergence.
Read AGENTS.md, this handoff and docs/RELEASE.md before editing.

## Current work

The login and email-code screens use the requested navy cinematic shell, recovered
binary portrait, blue glass card and password visibility toggle. Three.js particles
are decorative, desktop-only, respect reduced motion, and pause in hidden tabs or
offscreen. Existing server authentication and provider availability rules remain.
The finance workspace keeps its light visual system.

The public preview is for review, not a production release. Do not copy production
secrets into a new branch, migrate a live database, send real messages, or promote
production just to make a design preview look complete.

## Branch map as inspected on 2026-10-21

- GitHub default: `codex/light-finance-workspace` (protected).
- Vercel production: `master`; default and production currently differ.
- PR #6: latest finance work, Claude branch into default.
- PR #3: default into master; PR #2: older documentation into master.
- Three older branches are fully contained in this candidate:
  `codex/feat/production-workspaces`, `codex/postgresql-migration`,
  `codex/unified-cloud-audit`. They are eligible for deletion after publication.
- `main`, `f9-implementation`, the two `cursor/*` branches and
  `codex/cloud-continuation-handoff` contain unique commits. Preserve them until
  those commits are reviewed. Do not treat an old branch as disposable by name.

## Verification and remaining work

Run typecheck, tests and build on each substantive change. If the tsx CLI cannot
create its IPC pipe in a restricted workspace, the equivalent runner is:
`node --import tsx --test --test-concurrency=1 tests/*.test.ts`.
GitHub CI also covers real PostgreSQL integration; local tests do not prove hosted
login, provider delivery, tenancy controls or financial posting with real users.

Remaining: review the actual preview on desktop/mobile, configure any missing
preview-only providers through the owner, and validate authenticated workflows
with authorized test accounts. Broader security/financial acceptance and deciding
when PR #6 and PR #3 should merge are separate release tasks.
