import type { MetadataRoute } from "next";

// Manifest PWA : installée sur l'écran d'accueil iPhone, l'app se lance en
// plein écran (standalone) avec l'icône ISO-BAT. Icônes générées depuis le
// logo par scripts/generer-icones.mjs (npm run icones).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ISO-BAT — Suivi de chantier",
    short_name: "ISO-BAT",
    description: "Suivi de chantier et d'expertise humidité",
    id: "/app",
    start_url: "/app",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#12A8BC",
    lang: "fr",
    icons: [
      {
        src: "/icones/icone-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icones/icone-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icones/icone-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icones/icone-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
