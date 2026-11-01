import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Freetube",
    short_name: "Freetube",
    description: "A fast, installable, privacy-friendly YouTube client.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone", "minimal-ui"],
    orientation: "any",
    background_color: "#0f0f0f",
    theme_color: "#0f0f0f",
    categories: ["entertainment", "video", "music"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Search", url: "/search", description: "Search videos" },
      { name: "Shorts", url: "/shorts", description: "Swipe Shorts" },
      { name: "Library", url: "/library", description: "History and playlists" },
    ],
  };
}
