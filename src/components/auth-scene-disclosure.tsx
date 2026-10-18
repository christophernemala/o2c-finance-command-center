"use client";
import { useState } from "react";
import { AuthVisual } from "./auth-visual";

/** Mount WebGL only when requested, so the closed scene uses no animation frames. */
export function AuthSceneDisclosure() {
  const [open, setOpen] = useState(false);
  return <details className="auth-scene-disclosure" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>Explore the interactive banking scene</summary>
    {open && <AuthVisual/>}
  </details>;
}
