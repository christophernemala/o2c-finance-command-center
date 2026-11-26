export function ProductBrand({ inverse = false }: { inverse?: boolean }) {
  return <div className={`product-brand${inverse ? " product-brand-inverse" : ""}`} aria-label="O2C Finance Command Center">
    <span className="product-brand-mark" aria-hidden="true"><svg viewBox="0 0 40 40" fill="none">
      <rect x="1" y="1" width="38" height="38" rx="12" fill="url(#o2c-mark-bg)"/>
      <path d="M9 27.5h22" stroke="white" strokeOpacity=".42" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M10 23.5 16 18l5 3 9-9" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="16" cy="18" r="2" fill="#F8FCFF"/><circle cx="21" cy="21" r="2" fill="#62E2D4"/><circle cx="30" cy="12" r="2.4" fill="#FFD58D"/>
      <defs><linearGradient id="o2c-mark-bg" x1="2" y1="2" x2="39" y2="39" gradientUnits="userSpaceOnUse"><stop stopColor="#3379F6"/><stop offset=".58" stopColor="#155EEF"/><stop offset="1" stopColor="#6945C8"/></linearGradient></defs>
    </svg></span>
    <span className="product-brand-type"><strong>O2C</strong><span>FINANCE COMMAND</span></span>
  </div>;
}
