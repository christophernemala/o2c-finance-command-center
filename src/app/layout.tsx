import type { Metadata } from "next";
import { Inter, Sora, JetBrains_Mono } from "next/font/google";
import "./globals.css";
const bodyFont = Inter({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const headingFont = Sora({ subsets: ["latin"], weight: "600", variable: "--font-heading", display: "swap" });
const moneyFont = JetBrains_Mono({ subsets: ["latin"], variable: "--font-money", display: "swap" });
export const metadata: Metadata = { title: "O2C · Finance Command Center", description: "Controlled receivables, cash application, and financial review.", robots: { index: false, follow: false } };
export default function Layout({ children }: { children: React.ReactNode }) { return <html lang="en" className={`${bodyFont.variable} ${headingFont.variable} ${moneyFont.variable}`}><body><a className="skip button" href="#main">Skip to content</a>{children}</body></html>; }
