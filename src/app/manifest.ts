import type { MetadataRoute } from "next";
/** Installable web app. Opens the signed-in workspace; nothing financial is cached for offline use. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Closewise", short_name: "Closewise", description: "Controlled receivables, cash application, and financial review.",
    start_url: "/dashboard", scope: "/", display: "standalone", orientation: "portrait-primary", background_color: "#f4f4f6", theme_color: "#ffffff",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
