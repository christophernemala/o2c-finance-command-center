import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

/*
 * Switch, checkbox and spinner styles are adapted from Uiverse.io elements (MIT licence, see
 * docs/THIRD_PARTY_NOTICES.md) and rebuilt on the design tokens in globals.css.
 */

/** An on/off setting. A real checkbox with role="switch", so it submits like one and is announced as a switch. */
export function Switch({ label, className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "role"> & { label: ReactNode }) {
  return <label className={cn("ds-switch-row", className)}><input {...props} type="checkbox" role="switch" className="ds-switch"/><span>{label}</span></label>;
}

/** Busy indicator. Decorative unless given a label; pair it with visible text such as "Loading…". */
export function Spinner({ label, size, className }: { label?: string; size?: number; className?: string }) {
  return <span className={cn("ds-spinner", className)} style={size ? { width: size, height: size } : undefined}
    {...(label ? { role: "status", "aria-label": label } : { "aria-hidden": true })}/>;
}
