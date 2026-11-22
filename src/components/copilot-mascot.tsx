import { useId } from "react";

export function CopilotMascot({ className = "", thinking = false }: { className?: string; thinking?: boolean }) {
  const gradientId = `copilot-cat-${useId().replaceAll(":", "")}`;
  return <span aria-hidden="true" className={`copilot-mascot${thinking ? " is-thinking" : ""}${className ? ` ${className}` : ""}`}>
    <span className="copilot-mascot-halo"/>
    <svg viewBox="0 0 180 180" fill="none" focusable="false" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`${gradientId}-shell`} x1="36" y1="32" x2="141" y2="148" gradientUnits="userSpaceOnUse"><stop stopColor="#FFFFFF"/><stop offset=".42" stopColor="#D8ECFF"/><stop offset="1" stopColor="#8AB7EA"/></linearGradient>
        <linearGradient id={`${gradientId}-shell-side`} x1="57" y1="72" x2="153" y2="131" gradientUnits="userSpaceOnUse"><stop stopColor="#ECF7FF"/><stop offset=".56" stopColor="#B7D7FA"/><stop offset="1" stopColor="#6F9DD3"/></linearGradient>
        <linearGradient id={`${gradientId}-ear-inner`} x1="55" y1="28" x2="73" y2="49" gradientUnits="userSpaceOnUse"><stop stopColor="#FFB9D8"/><stop offset="1" stopColor="#6E9BE5"/></linearGradient>
        <linearGradient id={`${gradientId}-screen`} x1="62" y1="48" x2="127" y2="128" gradientUnits="userSpaceOnUse"><stop stopColor="#193C70"/><stop offset=".52" stopColor="#102849"/><stop offset="1" stopColor="#071A35"/></linearGradient>
        <linearGradient id={`${gradientId}-eye`} x1="69" y1="77" x2="91" y2="108" gradientUnits="userSpaceOnUse"><stop stopColor="#FFFFFF"/><stop offset=".22" stopColor="#89F3FF"/><stop offset=".58" stopColor="#2FC8F5"/><stop offset="1" stopColor="#4274F5"/></linearGradient>
        <linearGradient id={`${gradientId}-chest`} x1="62" y1="125" x2="119" y2="163" gradientUnits="userSpaceOnUse"><stop stopColor="#F6FCFF"/><stop offset=".54" stopColor="#C6E3FF"/><stop offset="1" stopColor="#76A9E5"/></linearGradient>
        <linearGradient id={`${gradientId}-tail`} x1="123" y1="117" x2="158" y2="151" gradientUnits="userSpaceOnUse"><stop stopColor="#79B9FF"/><stop offset=".55" stopColor="#397FE0"/><stop offset="1" stopColor="#244EAE"/></linearGradient>
        <radialGradient id={`${gradientId}-gloss`} cx="0" cy="0" r="1" gradientTransform="matrix(37 0 0 19 77 55)" gradientUnits="userSpaceOnUse"><stop stopColor="#FFFFFF" stopOpacity=".74"/><stop offset="1" stopColor="#BFE5FF" stopOpacity="0"/></radialGradient>
      </defs>
      <ellipse cx="91" cy="158" rx="43" ry="8" fill="#2D68B4" fillOpacity=".14"/>
      <g className="copilot-cat-tail">
        <path d="M117 126c22-4 35 4 37 16 2 11-8 17-18 12" stroke="#183F8E" strokeOpacity=".2" strokeWidth="13" strokeLinecap="round"/>
        <path d="M117 124c21-4 34 4 36 16 2 10-8 15-17 10" stroke={`url(#${gradientId}-tail)`} strokeWidth="9" strokeLinecap="round"/>
        <path d="M124 124c12-2 20 0 25 5" stroke="#C6E5FF" strokeOpacity=".9" strokeWidth="2.2" strokeLinecap="round"/>
      </g>
      <g className="copilot-cat-body">
        <path d="M65 122c6 13 15 20 27 20s21-7 27-20l15 10c8 5 12 14 12 24v2H43v-2c0-10 4-18 12-24l10-10Z" fill={`url(#${gradientId}-chest)`} stroke="#719ED1" strokeWidth="3" strokeLinejoin="round"/>
        <path d="M72 137c5-6 12-9 20-9s15 3 20 9l-3 19H75l-3-19Z" fill="#F8FCFF" stroke="#92B6E1" strokeWidth="2.5"/>
        <path d="M83 140h18l-3 11H86l-3-11Z" fill="#2A72D8"/>
        <circle cx="92" cy="145" r="3.1" fill="#8CF2FF"/>
        <path d="M56 129c-8 4-12 10-14 17 7 2 13-1 18-7m70-10c8 4 12 10 14 17-7 2-13-1-18-7" fill={`url(#${gradientId}-shell-side)`} stroke="#719ED1" strokeWidth="2.5" strokeLinejoin="round"/>
        <path d="M62 137c-4 3-6 6-7 10m78-10c4 3 6 6 7 10" stroke="#FFFFFF" strokeOpacity=".9" strokeWidth="2" strokeLinecap="round"/>
      </g>
      <g className="copilot-cat-head">
        <path d="m49 65-7-37c-1-8 6-12 12-7l27 25m48 19 9-37c2-8-5-12-11-7l-29 27" fill={`url(#${gradientId}-shell)`} stroke="#5E91D0" strokeWidth="4" strokeLinejoin="round"/>
        <path d="m51 51-3-21 22 18m52 3 6-22-23 19" fill={`url(#${gradientId}-ear-inner)`}/>
        <path d="m51 40-2-11 11 9m66 3 4-12-12 10" fill="#FFFFFF" fillOpacity=".8"/>
        <path d="M43 78c0-27 19-45 49-45s50 18 50 45v20c0 28-21 47-50 47S43 126 43 98V78Z" fill={`url(#${gradientId}-shell)`} stroke="#648FBF" strokeWidth="3.5"/>
        <path d="M54 80c0-21 14-34 38-34s39 13 39 34v17c0 22-15 35-39 35S54 119 54 97V80Z" fill={`url(#${gradientId}-screen)`} stroke="#8DC6FF" strokeWidth="2.4"/>
        <path d="M59 76c2-15 14-25 33-27 15-2 27 3 34 13-10-6-22-9-36-6-13 2-23 9-31 20Z" fill={`url(#${gradientId}-gloss)`}/>
        <path d="M57 72c7-12 19-18 34-18m32 5c3 3 5 6 6 10" stroke="#FFFFFF" strokeOpacity=".76" strokeWidth="2.4" strokeLinecap="round"/>
        <g className="copilot-cat-eyes">
          <path d="M68 83c0-6 5-10 11-10 8 0 13 7 13 17 0 11-5 18-13 18-7 0-11-5-11-13V83Z" fill={`url(#${gradientId}-eye)`}/>
          <path d="M93 90c0-10 5-17 13-17 6 0 11 4 11 10v12c0 8-4 13-11 13-8 0-13-7-13-18Z" fill={`url(#${gradientId}-eye)`}/>
          <path d="M74 82c2-3 5-4 8-3m19 1c2-2 5-3 8-2" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round"/>
          <ellipse cx="80" cy="91" rx="2.3" ry="7" fill="#173B73"/>
          <ellipse cx="106" cy="91" rx="2.3" ry="7" fill="#173B73"/>
          <circle cx="76" cy="81" r="2.2" fill="#FFFFFF"/><circle cx="102" cy="81" r="2.2" fill="#FFFFFF"/>
        </g>
        <path d="M87 108c3-3 7-3 10 0l-5 4-5-4Z" fill="#FF9DBD"/>
        <path d="M92 111c-2 5-6 7-10 5m10-5c2 5 6 7 10 5" stroke="#B8E8FF" strokeWidth="2" strokeLinecap="round"/>
        <path d="M58 99h-9m12 5-9 3m72-8h9m-12 5 9 3" stroke="#88CCFF" strokeWidth="1.8" strokeLinecap="round"/>
        <path d="M50 81h4m81 0h4" stroke="#3F8EE7" strokeWidth="4" strokeLinecap="round"/>
        <circle cx="49" cy="80" r="3" fill="#8CF2FF"/><circle cx="140" cy="80" r="3" fill="#8CF2FF"/>
        <path d="M67 65c7-7 15-10 24-10m25 1c3 2 6 4 8 7" stroke="#FFFFFF" strokeOpacity=".72" strokeWidth="2.2" strokeLinecap="round"/>
      </g>
      <circle cx="135" cy="48" r="4" fill="#8CF2FF"/>
      <path d="M135 41v-3m0 20v-3m-7-4h-3m20 0h-3" stroke="#5CC9F4" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  </span>;
}
