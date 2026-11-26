"use client";

import { motion, useReducedMotion } from "framer-motion";

/** Decorative connector only; all workflow meaning remains in the adjacent semantic list. */
export function AgentFlowArcs() {
  const reduceMotion = useReducedMotion();
  const reduced = Boolean(reduceMotion);
  const points = [120, 360, 600, 840];

  return <svg className="agent-flow-arcs" viewBox="0 0 960 92" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="o2c-agent-flow" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0%" stopColor="#9dc3f7"/>
        <stop offset="52%" stopColor="#1769d2"/>
        <stop offset="100%" stopColor="#a7cbff"/>
      </linearGradient>
    </defs>
    <motion.path d="M 120 46 C 190 4, 290 88, 360 46 S 530 4, 600 46 S 770 88, 840 46"
      fill="none" stroke="url(#o2c-agent-flow)" strokeWidth="2" strokeLinecap="round"
      initial={false} animate={{ pathLength: 1 }}
      transition={{ duration: reduced ? 0 : 1.1, ease: "easeOut" }}/>
    {points.map((x, index) => <motion.circle key={x} cx={x} cy="46" r="5" fill="#fff" stroke="#1769d2" strokeWidth="2"
      initial={false} animate={{ opacity: 1 }}
      transition={{ duration: reduced ? 0 : 0.25, delay: reduced ? 0 : 0.2 + index * 0.16 }}/>) }
  </svg>;
}
