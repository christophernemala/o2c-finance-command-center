# Animation recipes and source limits

This file records values that appear in Emil Kowalski's checked-in guidance. They are examples/ranges for matching interaction classes, not a new global token system. Check the linked source and the local app tokens before reuse.

## Easing and duration mapping

Source: [Emil animation skill](https://github.com/emilkowalski/skills/blob/main/skills/animate/SKILL.md) and [review standards](https://github.com/emilkowalski/skills/blob/main/skills/review-animations/STANDARDS.md).

| Use case | Source guidance |
|---|---|
| Entering/exiting | `ease-out` |
| Moving/morphing | `ease-in-out` |
| Hover/color | `ease` |
| Constant progress | `linear` |
| Default | `ease-out`; do not use `ease-in` for UI |
| Button press | 100–160ms |
| Tooltip/small popover | 125–200ms |
| Dropdown/select | 150–250ms |
| Modal/drawer | 200–500ms; documented larger-surface exception |
| General UI | under 300ms, subject to the specific interaction |

The checked-in curves include `cubic-bezier(0.23, 1, 0.32, 1)` for ease-out, `cubic-bezier(0.77, 0, 0.175, 1)` for ease-in-out, and `cubic-bezier(0.32, 0.72, 0, 1)` for drawer motion. Do not treat them as the app's mandatory global CSS variables.

## Examples, not defaults

- Press feedback recipe: scale `0.97` and 160ms `var(--ease-out)`; review standards describe subtle press scale in the `0.95–0.98` range.
- Entrances: avoid `scale(0)`; the source gives `0.9–0.97` plus opacity as a popover/entrance example.
- Springs: the source examples include `{ type: "spring", duration: 0.5, bounce: 0.2 }` and `{ type: "spring", mass: 1, stiffness: 100, damping: 10 }`. It describes `0.1–0.3` bounce for playful/drag contexts. Select only when the interaction calls for spring behavior.
- Stagger: product/UI examples use 30–80ms between items and should finish in about 300ms; choreography says not to apply uniform stagger or delay interaction.
- Drag: track the pointer 1:1 without easing/spring; use a velocity-seeded spring on release. The gesture guide gives framework-specific distance/velocity examples; no single universal threshold exists.
- Reduced motion: remove movement/position animation but retain explanatory opacity/color where helpful; a source example uses a 0.2s opacity fade.

Sources: [recipes](https://github.com/emilkowalski/skills/blob/main/skills/animate/RECIPES.md), [choreography](https://github.com/emilkowalski/skills/blob/main/skills/choreograph/SKILL.md), [gestures](https://github.com/emilkowalski/skills/blob/main/skills/gestures/SKILL.md).

## VengeanceUI values are per component

The [Animated Button source](https://github.com/Ashutoshx7/VengeanceUI/blob/main/src/components/ui/animated-button.tsx#L24-L82) has its own hover/tap scales and spring. The [tooltip](https://github.com/Ashutoshx7/VengeanceUI/blob/main/src/components/ui/animated-tooltip.tsx#L34-L65) defines its own variants. Do not generalize those values across the catalog.

## Never ship

Do not animate high-frequency/keyboard UI, use `transition: all`, use `ease-in` for UI, animate large layout dimensions without justification, use a keyframe that restarts on rapid toggle/gesture input, or let a stagger block interaction. These prohibitions are documented in [Emil review standards](https://github.com/emilkowalski/skills/blob/main/skills/review-animations/STANDARDS.md) and [animate skill](https://github.com/emilkowalski/skills/blob/main/skills/animate/SKILL.md).