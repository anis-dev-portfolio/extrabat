import { execSync } from "node:child_process";
import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

// Marqueur de version calculé à la compilation et INLINÉ dans le bundle client
// (via `env`). Affiché dans l'UI conducteur : permet de savoir quelle version
// tourne réellement sur un téléphone (un service worker peut resservir un
// vieux shell — sans marqueur visible, impossible de le diagnostiquer).
function versionBuild(): string {
  const sha =
    process.env.VERCEL_GIT_COMMIT_SHA ??
    (() => {
      try {
        return execSync("git rev-parse HEAD", {
          stdio: ["ignore", "pipe", "ignore"],
        })
          .toString()
          .trim();
      } catch {
        return "";
      }
    })();
  const jour = new Date().toISOString().slice(0, 10);
  return sha ? `${sha.slice(0, 7)} · ${jour}` : `dev · ${jour}`;
}

// Service worker PWA (app/sw.ts → public/sw.js, git-ignoré). Désactivé en dev :
// un SW qui cache l'app-shell rend le rechargement à chaud imprévisible.
const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  // La sync métier gère elle-même le retour du réseau. Un reload Serwist
  // sur `online` pouvait tuer l'upload qu'elle venait de relancer. Les mises à
  // jour de build sont gérées explicitement par app/app/pwa-update.tsx.
  reloadOnOnline: false,
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_VERSION_BUILD: versionBuild() },

  // Router Cache client : réutilise pendant 30 s le rendu d'une page dynamique
  // déjà visitée (défaut Next 15 = 0 s → chaque re-navigation repaie le cycle
  // serveur complet). Sûr ici : toutes les mutations passent par des Server
  // Actions qui revalidatePath/revalidateTag, ce qui purge cette entrée.
  experimental: { staleTimes: { dynamic: 30 } },

  // Keep the Postgres driver (used by the Prisma driver adapter) out of the
  // server bundle so its dynamic requires resolve at runtime.
  serverExternalPackages: ["pg"],

  // En-têtes de sécurité appliqués à toutes les routes. CSP volontairement
  // limitée à frame-ancestors : une CSP complète exigerait des nonces pour les
  // scripts/styles inline de Next.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default withSerwist(nextConfig);
