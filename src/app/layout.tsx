import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
const bodyFont = localFont({ src: "./fonts/inter-latin-variable.woff2", weight: "100 900", style: "normal", variable: "--font-body", display: "swap", fallback: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"] });
// All fonts are bundled; headings and figures are not preloaded.
const headingFont = localFont({ src: "./fonts/calistoga-latin-400.woff2", weight: "400", style: "normal", variable: "--font-heading", display: "swap", preload: false });
const moneyFont = localFont({ src: "./fonts/jetbrains-mono-latin-variable.woff2", weight: "100 800", style: "normal", variable: "--font-money", display: "swap", preload: false });
const description = "Controlled receivables, cash application, and financial review.";
function siteOrigin() { try { return new URL(process.env.AUTH_SITE_URL ?? "http://127.0.0.1:5174"); } catch { return new URL("http://127.0.0.1:5174"); } }
export const metadata: Metadata = {
  metadataBase: siteOrigin(),
  title: { default: "Closewise · Order-to-cash", template: "%s · Closewise" },
  description, robots: { index: false, follow: false },
  openGraph: { type: "website", siteName: "Closewise", title: "Closewise · Order-to-cash", description },
  // Home-screen app on iPhone: full-screen, with the status bar over the app's own top inset.
  appleWebApp: { capable: true, title: "Closewise", statusBarStyle: "default" },
  icons: { apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }] },
};
// viewport-fit=cover lets the layout use env(safe-area-inset-*) around the notch and home indicator.
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#ffffff" };
export default function Layout({ children }: { children: React.ReactNode }) { return <html lang="en" className={`${bodyFont.variable} ${headingFont.variable} ${moneyFont.variable}`}><body><a className="skip button" href="#main">Skip to content</a>{children}</body></html>; }
