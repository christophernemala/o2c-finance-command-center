# Review checklist

## Source fidelity

- [ ] Every new design/interaction rule points to the source file/page that supports it.
- [ ] VengeanceUI component props, dependencies, exact route and implementation were inspected before reuse; behavior is not inferred from its name.
- [ ] Emil motion values are correctly described as contextual ranges/examples, not universal constants.
- [ ] Prompt Master is used only for agent-prompt structure, not claimed as UI design guidance.
- [ ] User screenshot and local STYLEGUIDE are distinguished from the three named source repositories.

## Finance truth and safety

- [ ] Tenant and legal entity are explicit; the query/data path remains selected-entity scoped and forced RLS remains intact.
- [ ] Monetary values remain decimal strings; no conversion to JavaScript `Number` or display truncation.
- [ ] KPI definition, source, retrieval time and as-of/basis remain visible.
- [ ] Empty and unavailable states remain truthful; no fake data, fake events, fabricated revenue saved, call outcome, Power BI connection or delivery.
- [ ] Any proposal remains distinct from approval and execution; independent checker, stale evidence, idempotency and audit behavior are not weakened.
- [ ] New external actions remain disabled until their actual provider, consent, safety checks and server workflow are implemented. No real communication in preview.

## Motion and interaction

- [ ] Motion has a purpose and an appropriate frequency budget.
- [ ] No `transition: all`, unneeded layout animation, `ease-in` UI motion, `scale(0)` entrance, state-per-frame gesture loop, or automatic repeated/keyframe animation on a dynamic toggle.
- [ ] Reduced motion, fine-pointer hover gating, keyboard behavior, focus and touch alternatives are implemented.
- [ ] Animation is interruptible and does not delay use of visible content.
- [ ] Real touch-device/performance claims are not made from a desktop-only run.

## Responsive/accessibility

- [ ] Desktop rail/header/content do not overflow at the tested widths.
- [ ] iPhone safe areas, bottom dock, 44px minimum targets and readable text survive the mobile viewport.
- [ ] Charts expose exact values in a table/matrix and all state remains understandable without color/motion.
- [ ] Tables have accessible headers and a mobile card/contained-scroll alternative.

## Verification and report

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] Capture desktop and iPhone-width previews from the local synthetic, read-only route; label screenshots synthetic.
- [ ] Summarize changed files, tests, limitations, unconfigured credential needs, and exact PR/commit state. Never claim live integration or production verification without it.

Prompt structure for this review follows [Prompt Master's auditable task patterns](https://github.com/nidhinjs/prompt-master/blob/main/references/templates.md#L396-L483); finance boundaries come from [AGENTS.md](../../AGENTS.md) and [DESIGN.md](../../DESIGN.md).