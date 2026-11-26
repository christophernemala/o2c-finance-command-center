# Motion guidance

## Decide whether to animate

Use motion only when it serves at least one verified purpose: spatial consistency, state indication, explanation, feedback, or preventing a jarring change. “Looks cool” is not sufficient for frequent finance UI. Source: [Emil review standards](https://github.com/emilkowalski/skills/blob/main/skills/review-animations/STANDARDS.md).

Estimate interaction frequency before implementation. Emil's review standards say 100+ uses/day (including keyboard shortcuts and command-palette toggles) means no animation; tens/day means remove or drastically reduce; occasional use may get standard motion; rare/first-time moments may receive delight. Apply this as a budget, not a fabricated count.

## Use the simplest fitting tool

- CSS transitions: state changes.
- CSS keyframe animations: predetermined motion.
- WAAPI: programmatic control with CSS-grade performance/interruptibility.
- Motion library: springs, layout, exit and gesture work when needed.
- Do not add a library for a simple fade.

This mapping and the “do not install just for a fade” rule are from [Emil's animate skill](https://github.com/emilkowalski/skills/blob/main/skills/animate/SKILL.md). VengeanceUI has component-specific use of Framer Motion, GSAP, CSS and WebGL/R3F; it does not prescribe one stack for every component. Verify each [registry entry](https://github.com/Ashutoshx7/VengeanceUI/blob/main/public/r/index.json) and implementation.

## Choose properties and keep motion interruptible

Prefer `transform` and `opacity`. Avoid `transition: all`; name properties. Avoid layout-triggering properties unless a source-documented case (for example, measured accordion height) is appropriate. Do not update React state per pointer frame. Use transitions for rapidly retriggered UI and a velocity-seeded spring for gesture release. Source: [animation performance](https://github.com/emilkowalski/skills/blob/main/skills/animation-performance/SKILL.md), [gestures](https://github.com/emilkowalski/skills/blob/main/skills/gestures/SKILL.md), and [animate](https://github.com/emilkowalski/skills/blob/main/skills/animate/SKILL.md).

## Accessibility and verification

- Honor reduced motion; retain helpful opacity/color changes when they aid comprehension, remove positional movement and overshoot. Source: [Emil animate skill](https://github.com/emilkowalski/skills/blob/main/skills/animate/SKILL.md).
- Gate hover-specific motion to `@media (hover: hover) and (pointer: fine)`. Do not rely on hover for touch. Source: [Emil gestures skill](https://github.com/emilkowalski/skills/blob/main/skills/gestures/SKILL.md).
- Preserve any component's own reduced-motion and aria behavior. VengeanceUI explicitly asks agents to preserve these in its [conventions](https://github.com/Ashutoshx7/VengeanceUI/blob/main/.cursor/skills/vengeance-ui/conventions.md); its [global CSS](https://github.com/Ashutoshx7/VengeanceUI/blob/main/src/app/globals.css#L255-L260) reduces durations/iterations.
- Slow the animation or inspect it frame-by-frame, test touch on a real device, and measure before applying `will-change`. Sources: [review standards](https://github.com/emilkowalski/skills/blob/main/skills/review-animations/STANDARDS.md) and [performance guidance](https://github.com/emilkowalski/skills/blob/main/skills/animation-performance/SKILL.md).

## Finance-specific boundary

Do not animate balances, create a false live stream, imply that a proposal was approved, or suggest a customer was contacted. The app contract requires server-confirmed status and reduced-motion support: [DESIGN.md](../../DESIGN.md) and [STYLEGUIDE.md](../../STYLEGUIDE.md).