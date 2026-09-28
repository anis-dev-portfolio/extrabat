import type { Metadata, Viewport } from "next";
import { Ubuntu, Ubuntu_Sans } from "next/font/google";
import "./globals.css";

// Identité ISOBAT : Ubuntu pour la marque et les titres, Ubuntu Sans pour l'UI.
const ubuntu = Ubuntu({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  variable: "--font-ubuntu",
  display: "swap",
});

const ubuntuSans = Ubuntu_Sans({
  subsets: ["latin"],
  variable: "--font-ubuntu-sans",
  display: "swap",
});

// [pixels physiques largeur, hauteur, device-pixel-ratio] des iPhones couverts.
const SPLASHS_IPHONE: readonly [number, number, number][] = [
  [750, 1334, 2], // SE 2/3, 8
  [1242, 2208, 3], // 8 Plus
  [1125, 2436, 3], // X, XS, 11 Pro, 12/13 mini
  [828, 1792, 2], // XR, 11
  [1242, 2688, 3], // XS Max, 11 Pro Max
  [1170, 2532, 3], // 12, 13, 14, 16e
  [1284, 2778, 3], // 12/13 Pro Max, 14 Plus
  [1179, 2556, 3], // 14 Pro, 15, 15 Pro, 16
  [1290, 2796, 3], // 14 Pro Max, 15 Plus, 16 Plus
  [1206, 2622, 3], // 16 Pro
  [1320, 2868, 3], // 16 Pro Max
];

export const metadata: Metadata = {
  title: {
    default: "ExtraBat — ISOBAT",
    template: "%s — ExtraBat",
  },
  description: "Suivi de chantier et d'expertise humidité",
  // Installée sur l'écran d'accueil iOS : plein écran, barre de statut lisible
  // (texte noir sur le header blanc), icône dédiée (fond plein, iOS remplace
  // la transparence par du noir).
  appleWebApp: {
    capable: true,
    title: "ISO-BAT",
    statusBarStyle: "default",
    // Écrans de démarrage générés par scripts/generer-icones.mjs — la liste
    // des résolutions doit rester alignée avec SPLASHS dans ce script.
    startupImage: SPLASHS_IPHONE.map(([largeur, hauteur, dpr]) => ({
      url: `/splash/splash-${largeur}x${hauteur}.png`,
      media: `(device-width: ${largeur / dpr}px) and (device-height: ${hauteur / dpr}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait)`,
    })),
  },
  icons: {
    apple: "/icones/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#12A8BC",
  // Dessine sous l'encoche / la Dynamic Island ; les shells compensent via
  // env(safe-area-inset-*).
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className={`${ubuntu.variable} ${ubuntuSans.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
