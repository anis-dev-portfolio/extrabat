// Génère les icônes PWA (et l'apple-touch-icon) à partir du logo ISO-BAT.
// À relancer après tout remplacement de public/isobat-marque.png :
//   npm run icones
//
// Sorties (public/icones/) :
//   icone-192.png / icone-512.png          — icônes standard du manifest
//   icone-maskable-192.png / -512.png      — variantes maskable (Android) :
//     logo réduit dans la « safe zone » (~60 %) sur fond blanc plein, pour
//     survivre aux masques circulaires/squircle du launcher.
//   apple-touch-icon.png (180×180)         — icône d'écran d'accueil iOS,
//     fond blanc plein (iOS n'aime pas la transparence, il la remplace par du noir).
//
// Sorties (public/splash/) :
//   splash-<l>x<h>.png — écrans de démarrage iOS (logo centré sur fond blanc),
//     un par résolution d'iPhone. La liste des tailles doit rester alignée avec
//     les media queries de appleWebApp.startupImage dans app/layout.tsx.
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const SOURCE = path.resolve("public/isobat-marque.png");
const DEST = path.resolve("public/icones");
const FOND = { r: 255, g: 255, b: 255, alpha: 1 };

// Pose le logo centré dans un canvas carré `taille`, occupant `ratio` du côté.
async function icone(taille, ratio, sortie) {
  const logo = await sharp(SOURCE)
    .resize(Math.round(taille * ratio), Math.round(taille * ratio), {
      fit: "contain",
      background: FOND,
    })
    .png()
    .toBuffer();

  await sharp({
    create: { width: taille, height: taille, channels: 4, background: FOND },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(path.join(DEST, sortie));
  console.log(`✓ ${sortie}`);
}

// Résolutions d'iPhone (pixels physiques) couvertes par un splash dédié —
// mêmes couples que les media queries d'app/layout.tsx.
const SPLASHS = [
  [750, 1334], // SE 2/3, 8
  [1242, 2208], // 8 Plus
  [1125, 2436], // X, XS, 11 Pro, 12/13 mini
  [828, 1792], // XR, 11
  [1242, 2688], // XS Max, 11 Pro Max
  [1170, 2532], // 12, 13, 14, 16e
  [1284, 2778], // 12/13 Pro Max, 14 Plus
  [1179, 2556], // 14 Pro, 15, 15 Pro, 16
  [1290, 2796], // 14 Pro Max, 15 Plus, 16 Plus
  [1206, 2622], // 16 Pro
  [1320, 2868], // 16 Pro Max
];

const DEST_SPLASH = path.resolve("public/splash");

// Splash : logo centré (~30 % de la largeur) sur fond blanc plein écran.
async function splash(largeur, hauteur) {
  const cote = Math.round(largeur * 0.3);
  const logo = await sharp(SOURCE)
    .resize(cote, cote, { fit: "contain", background: FOND })
    .png()
    .toBuffer();

  const sortie = `splash-${largeur}x${hauteur}.png`;
  await sharp({
    create: { width: largeur, height: hauteur, channels: 4, background: FOND },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(path.join(DEST_SPLASH, sortie));
  console.log(`✓ ${sortie}`);
}

await mkdir(DEST, { recursive: true });
await mkdir(DEST_SPLASH, { recursive: true });
await icone(192, 0.82, "icone-192.png");
await icone(512, 0.82, "icone-512.png");
await icone(192, 0.58, "icone-maskable-192.png");
await icone(512, 0.58, "icone-maskable-512.png");
await icone(180, 0.74, "apple-touch-icon.png");
for (const [l, h] of SPLASHS) await splash(l, h);
