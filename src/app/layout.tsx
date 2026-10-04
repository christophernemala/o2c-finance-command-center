import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "O2C · Finance Command Center", description: "Controlled receivables, cash application, and financial review.", robots: { index: false, follow: false } };
export default function Layout({ children }: { children: React.ReactNode }) { return <html lang="en"><body><a className="skip button" href="#main">Skip to content</a>{children}</body></html>; }
