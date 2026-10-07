"use client";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
export function ThemeButton() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.dataset.theme === "dark");
  }, []);
  function toggle() {
    const next = !dark; setDark(next); document.documentElement.dataset.theme = next ? "dark" : "light";
  }
  return <button type="button" className="button secondary" onClick={toggle} aria-label={dark ? "Use light theme" : "Use dark theme"}>{dark ? <Sun size={16}/> : <Moon size={16}/>}<span className="hidden sm:inline">{dark ? "Light" : "Dark"}</span></button>;
}
