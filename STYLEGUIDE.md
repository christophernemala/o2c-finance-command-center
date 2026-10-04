# O2C visual system

Reference: https://stripe.com/en-nl (user-selected visual direction).
Original O2C product implementation; do not copy Stripe branding or assets.

- Semantic CSS variables in `src/app/globals.css` map into Tailwind utilities.
- Light: canvas #F6F8FB, white surfaces, ink #0A2540, muted #52667A,
  primary #5841D8, border #DCE3ED. The darker violet supports readable button text.
- Dark: canvas #0C1626, surface #132338, ink #EDF3FC, muted #B1BFD3,
  primary #B2A3FF, border #334960. Dark buttons use navy text.
- Use navy navigation, violet active accents, and a restrained gradient on sign-in.
  Financial evidence stays on opaque surfaces.
- System font stack; no third-party font requests. Tabular financial numerals.
- Page headings 30px, body 14px, metadata 12px. Consistent Tailwind spacing.
- Controls and navigation targets at least 44px. Rounded controls 8px; panels 12px.
- Never truncate monetary values. Use horizontal scrolling for long amount columns.
- Status text accompanies color; no color-only approvals. Focus is always visible.
- Light/dark themes preserve semantic states. Respect reduced motion. No animated money.
- Palette literals belong in tokens or the documented navy/gradient brand surfaces.
- Test responsive layout, keyboard use, contrast, pending/error states and both themes.
