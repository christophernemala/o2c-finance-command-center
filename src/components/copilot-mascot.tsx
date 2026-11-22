export function CopilotMascot({ className = "", thinking = false }: { className?: string; thinking?: boolean }) {
  return <span aria-hidden="true" className={`copilot-mascot${thinking ? " is-thinking" : ""}${className ? ` ${className}` : ""}`}>
    <span className="copilot-mascot-halo"/>
    <svg viewBox="0 0 180 180" fill="none" focusable="false">
      <ellipse cx="91" cy="158" rx="43" ry="8" fill="#5A8CCF" fillOpacity=".16"/>
      <path className="copilot-cat-tail" d="M119 126c21-1 34 7 34 19 0 11-11 14-20 8" stroke="#3787EA" strokeWidth="8" strokeLinecap="round"/>
      <path d="m48 62-5-38c-1-7 7-10 12-5l25 27m46 16 8-38c1-7-6-10-11-5l-26 28" fill="#C7E2FF" stroke="#4E93EC" strokeWidth="5" strokeLinejoin="round"/>
      <path d="m51 48-2-20 17 15m53 5 5-20-18 16" fill="#82C8FF"/>
      <path d="M47 75c0-27 19-43 44-43s45 16 45 43v14c0 27-19 44-45 44S47 116 47 89V75Z" fill="#F7FBFF" stroke="#8CB7E8" strokeWidth="4"/>
      <path d="M56 70c0-17 13-28 35-28s36 11 36 28v19c0 19-14 30-36 30S56 108 56 89V70Z" fill="#102849"/>
      <path d="M63 63c7-9 17-14 28-14 12 0 22 5 29 14" stroke="#D9EDFF" strokeWidth="3" strokeLinecap="round"/>
      <g className="copilot-cat-eyes">
        <path d="M72 80v9m0-4c0-6 8-6 8 0v4m20-9v9m0-4c0-6 8-6 8 0v4" stroke="#71E3FF" strokeWidth="4" strokeLinecap="round"/>
      </g>
      <path d="M84 101c5 4 11 4 16 0" stroke="#93DFFF" strokeWidth="2.5" strokeLinecap="round"/>
      <circle cx="50" cy="77" r="4" fill="#64CFFF"/><circle cx="134" cy="77" r="4" fill="#64CFFF"/>
      <path d="M69 121c4 12 12 19 22 19s19-7 23-19l14 10c8 5 12 14 12 23v2H48v-2c0-9 4-18 12-23l9-10Z" fill="#DDF0FF" stroke="#8CB7E8" strokeWidth="3" strokeLinejoin="round"/>
      <path d="M74 136c4-5 10-8 17-8s13 3 18 8l-3 20H77l-3-20Z" fill="#F7FBFF" stroke="#9ABEE8" strokeWidth="2.5"/>
      <path d="M85 140h12l-2 9h-8l-2-9Z" fill="#3184EA"/>
      <circle cx="91" cy="144" r="2" fill="#8CF2FF"/>
      <path d="M56 128c-8 3-13 10-15 19 7 2 14-1 19-7m72-12c8 3 13 10 15 19-7 2-14-1-19-7" fill="#C7E2FF" stroke="#7CAFEA" strokeWidth="3" strokeLinejoin="round"/>
      <path d="M63 54h5m42 0h5" stroke="#7BB7F2" strokeWidth="3" strokeLinecap="round"/>
      <circle cx="131" cy="48" r="4" fill="#8CF2FF"/>
    </svg>
  </span>;
}
