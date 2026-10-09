# O2C visual system

Reference: https://stripe.com/en-nl (user-selected visual direction).
Original O2C product implementation; do not copy Stripe branding or assets.

- Semantic CSS variables in `src/app/globals.css` map into Tailwind utilities.
- The current user-approved direction is a light, iOS-like finance workspace.
  This supersedes the earlier navy navigation and dark-theme direction.
- Figma draft tokens: pearl canvas `#F6F7FB`, white surfaces `#FFFFFF`, ink
  `#202635`, muted text `#626C80`, primary purple `#5654D6`, soft purple
  `#EEEEFF`, borders `#E4E7EF`, and teal `#147D73`.
- Purple primary controls use white text; navigation uses a white rail, dark text,
  and soft-purple active states. Sign-in artwork uses pale lavender and mint.
- All themes resolve to these light tokens, including a stale `data-theme`
  attribute. There is no dark-theme control or browser-storage theme preference.
- Financial evidence stays on opaque surfaces. Decorative gradients and shadows
  support the auth shell; they must not replace required evidence or data states.
- Inter for body text, Sora 600 for headings, and JetBrains Mono for financial
  numerals are bundled by `next/font` at build time and served from this application.
  Fonts make no third-party requests from the user's browser.
- Page headings 30px, body 14px, metadata 12px. Consistent Tailwind spacing.
- Controls and navigation targets at least 44px. Form controls and buttons are
  48px high with 14px corners; shared panels use 22px corners and auth cards 28px.
- Text links use `--link` and keyboard focus uses a three-pixel `--focus` outline.
  Keep label, input boundary and focus contrast visible against pale surfaces.
- Never truncate monetary values. Use horizontal scrolling for long amount columns.
- Status text accompanies color; no color-only approvals. Focus is always visible.
- Light surfaces preserve semantic states. Respect reduced motion. No animated money.
- Palette literals belong in tokens or documented decorative auth surfaces.
- Test responsive layout, keyboard use, contrast and pending/error states. A real
  authenticated workspace review remains necessary before visual release approval.
