import type { MetadataRoute } from "next";

// Served at /manifest.webmanifest. Together with the service worker in
// public/sw.js this lets phones add PaperScroll to the home screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PaperScroll",
    short_name: "PaperScroll",
    description: "A scrollable feed of the latest academic papers from arXiv.",
    start_url: "/",
    display: "standalone",
    background_color: "#FBF8F1",
    theme_color: "#FBF8F1",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
