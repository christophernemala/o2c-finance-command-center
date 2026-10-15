import type { Metadata } from "next";
import { Inter, Sora, JetBrains_Mono } from "next/font/google";
import "./globals.css";
const bodyFont = Inter({ subsets: ["latin"], variable: "--font-body", display: "swap" });
// Headings and figures load after body text; only the weights in use are fetched.
const headingFont = Sora({ subsets: ["latin"], weight: "600", variable: "--font-heading", display: "swap", preload: false });
const moneyFont = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-money", display: "swap", preload: false });
const description = "Controlled receivables, cash application, and financial review.";
function siteOrigin() { try { return new URL(process.env.AUTH_SITE_URL ?? "http://127.0.0.1:5174"); } catch { return new URL("http://127.0.0.1:5174"); } }
export const metadata: Metadata = {
  metadataBase: siteOrigin(),
  title: { default: "O2C · Finance Command Center", template: "%s · O2C" },
  description, robots: { index: false, follow: false },
  openGraph: { type: "website", siteName: "O2C Finance Command Center", title: "O2C · Finance Command Center", description },
};
export default function Layout({ children }: { children: React.ReactNode }) { return <html lang="en" data-theme="light" className={`${bodyFont.variable} ${headingFont.variable} ${moneyFont.variable}`}><body><a className="skip button" href="#main">Skip to content</a>{children}</body></html>; }
