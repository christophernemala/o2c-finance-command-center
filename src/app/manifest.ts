import type { MetadataRoute } from "next";
/** Installable web app. Opens the signed-in workspace; nothing financial is cached for offline use. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "O2C Finance Command Center", short_name: "O2C", description: "Controlled receivables, cash application, and financial review.",
    start_url: "/dashboard", scope: "/", display: "standalone", orientation: "portrait-primary", background_color: "#f3f6fc", theme_color: "#0b1224",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
