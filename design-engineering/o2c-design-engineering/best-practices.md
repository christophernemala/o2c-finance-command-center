# Agent best practices

These instruction patterns are adapted from [Prompt Master](https://github.com/nidhinjs/prompt-master), which guides prompt construction and verifiability. It is not a UI-design authority.

## Reusable task brief

For implementation or review work, state:

1. **Goal and target tool:** what must change and in which codebase/tool.
2. **Context:** current branch/route, relevant architecture, user decisions and failed attempts.
3. **Target state:** observable behavior and artifacts.
4. **Scope:** exact files/areas to inspect or change; explicit do-not-touch areas.
5. **Constraints:** source-attribution, security, privacy, budget, external-action and style rules.
6. **Allowed/forbidden actions:** distinguish editing from tests, provider calls, deployment, posting or external communication.
7. **Acceptance criteria:** concrete pass/fail checks, not vague “polished” claims.
8. **Evidence/output:** files, links, test commands/results, blockers and unverified items.

This structure follows Prompt Master's [Template M/N task briefs](https://github.com/nidhinjs/prompt-master/blob/main/references/templates.md#L396-L483) and [scope/context patterns](https://github.com/nidhinjs/prompt-master/blob/main/references/patterns.md#L7-L82).

## Finance task boundary template

> Goal: [observable O2C change]. Current state: [branch, route, data/source basis]. Target state: [specific UI and server behavior]. Scope: [files/schema and explicit exclusions]. Constraints: preserve tenant/entity authorization, forced RLS, decimal strings, maker/checker controls and provider truth. External actions: [none unless exact approved path]. Acceptance: [typecheck/lint/tests/build and responsive/accessibility checks]. Evidence: [citations, changed artifacts, screenshot route, verified remote state]. Report blockers and unknown integrations; do not claim unverified behavior.

## Factual grounding

- Anchor factual claims in exact repository files or authoritative source URLs.
- State assumptions and uncertainties; do not silently invent details.
- Request conclusions, assumptions, evidence and checks, not hidden chain-of-thought.
- Verify current model/tool/provider claims against official provider docs when the task requires them. Prompt Master source: [model recency gate](https://github.com/nidhinjs/prompt-master/blob/main/SKILL.md#L68-L75).
- Use examples only when they clarify the output format; never treat a UI example embedded in a prompt as proof of a product design system.

## Safety and workflow

Set stop conditions for schema/security changes, real customer communication, provider charges, deployment or merge. Keep milestone updates brief and only report results backed by the tool output or verified files. These are prompt/workflow practices from Prompt Master's [skill](https://github.com/nidhinjs/prompt-master/blob/main/SKILL.md) and [templates](https://github.com/nidhinjs/prompt-master/blob/main/references/templates.md), not additional visual design rules.