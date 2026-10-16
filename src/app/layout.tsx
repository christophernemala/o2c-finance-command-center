import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
const bodyFont = localFont({ src: "./fonts/geist-latin-variable.woff2", weight: "100 900", style: "normal", variable: "--font-body", display: "swap", fallback: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"] });
// All fonts are bundled; headings and figures are not preloaded.
const headingFont = localFont({ src: "./fonts/space-grotesk-latin-variable.woff2", weight: "300 700", style: "normal", variable: "--font-heading", display: "swap", preload: false });
const moneyFont = localFont({ src: "./fonts/jetbrains-mono-latin-variable.woff2", weight: "100 800", style: "normal", variable: "--font-money", display: "swap", preload: false });
const description = "Controlled receivables, cash application, and financial review.";
function siteOrigin() { try { return new URL(process.env.AUTH_SITE_URL ?? "http://127.0.0.1:5174"); } catch { return new URL("http://127.0.0.1:5174"); } }
export const metadata: Metadata = {
  metadataBase: siteOrigin(),
  title: { default: "O2C · Finance Command Center", template: "%s · O2C" },
  description, robots: { index: false, follow: false },
  openGraph: { type: "website", siteName: "O2C Finance Command Center", title: "O2C · Finance Command Center", description },
};
export default function Layout({ children }: { children: React.ReactNode }) { return <html lang="en" data-theme="light" className={`${bodyFont.variable} ${headingFont.variable} ${moneyFont.variable}`}><body><a className="skip button" href="#main">Skip to content</a>{children}</body></html>; }
