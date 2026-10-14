# O2C project organization and cleanup

Recorded on 8 October 2026.

## Active source

The repository default is now `codex/light-finance-workspace`. Opening the
repository selects the current light workspace. The former `master` branch
remains historical source for recovery; no merge from that branch was performed
as part of this change.

The active source removes `src/components/theme-button.tsx` and uses light
tokens in `src/app/globals.css`. The dashboard, authentication, tenant/entity
authorization, exact-decimal calculations and independent approval paths remain
part of the current governed implementation.

## Verified cleanup

- Grouped fourteen identified O2C conversations under the Codex sidebar section
  **O2C Finance Command Center**.
- Added the root project index and its README link.
- Inspected the current cloud Git tree for identical blob hashes; no
  byte-identical duplicate tracked files were found.
- Removed the local `o2c-current-preview.png` after verifying that its SHA-256
  hash exactly matched retained `o2c-hosted-preview.png`.
- Verified that all 297 files in the unpacked continuation directory match the
  retained ZIP archive. The directory has not been removed.
- Preserved older working copies, including the copy with uncommitted Auth work.

Automatic approval review rejected bulk local filesystem cleanup as blocked by
policy and did not provide a more specific reason. That command removed no files.
A narrower removal of the single verified duplicate image succeeded.

## Remaining boundaries

This is source organization and visual-source retirement. It does not change
the currently deployed Vercel production branch or retire an identified hosted
deployment. Real onboarding and hosted finance workflow verification remain
release gates. The light default branch is not evidence of production readiness.

The sidebar section is a navigation group; it does not register a Codex project
or merge conversation histories. Private archives and business evidence stay
outside this public repository.
