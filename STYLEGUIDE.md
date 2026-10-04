# O2C visual system

Reference: https://stripe.com/en-nl (user-selected visual direction).
Original O2C product implementation; do not copy Stripe branding or assets.

- Semantic CSS variables in `src/app/globals.css` map into Tailwind utilities.
- Locked brand palette from the approved login reference: navy `#0B1224`, violet
  `#8B7CF8`, teal `#6DD3C5`, light canvas `#F6F5F8`, button `#A89CFF`, and
  light violet `#E9E5FF`.
- Light: `#F6F5F8` canvas, white surfaces, `#0B1224` ink, `#A89CFF`
  controls with navy text, and `#E9E5FF` supporting surfaces.
- Dark: `#0B1224` canvas, `#151E34` surfaces, light ink, and the same violet/teal
  accents. Keep finance evidence on opaque surfaces.
- Use navy navigation, violet active accents, and a restrained gradient on sign-in.
  Financial evidence stays on opaque surfaces.
- Prefer Inter for body text, Sora for headings, and JetBrains Mono for financial
  numerals when those fonts are locally available. The system fallbacks make no
  third-party font request and preserve tabular financial numerals.
- Page headings 30px, body 14px, metadata 12px. Consistent Tailwind spacing.
- Controls and navigation targets at least 44px. Rounded controls 8px; panels 12px.
- Never truncate monetary values. Use horizontal scrolling for long amount columns.
- Status text accompanies color; no color-only approvals. Focus is always visible.
- Light/dark themes preserve semantic states. Respect reduced motion. No animated money.
- Palette literals belong in tokens or the documented navy/gradient brand surfaces.
- Test responsive layout, keyboard use, contrast, pending/error states and both themes.
