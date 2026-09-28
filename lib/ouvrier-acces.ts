// Fail-closed au build : le tirage aléatoire ne doit jamais partir côté client.
import "server-only";
import { randomInt } from "node:crypto";

// Mot de passe PROPRE À CHAQUE compte ouvrier, tiré au hasard à la création
// de l'accès (et à chaque « Nouveau mot de passe »). Il remplace l'ancien mot
// de passe partagé par toute l'équipe : connaître l'email d'un collègue ne
// suffit plus à entrer dans son compte.
//
// Pensé pour le terrain (pas d'invitation par email à ouvrir sur un
// chantier) : l'assistante le lit à voix haute ou le recopie. Minuscules et
// chiffres sans les caractères ambigus (i, l, o, 0, 1), en 3 groupes de 4 :
// « k7pm-4xrt-9wqa » — 31¹² ≈ 2^59 possibilités. Jamais stocké en clair :
// affiché UNE fois à l'assistante, puis seul Supabase Auth en garde le hash.
// L'ouvrier peut ensuite le changer depuis Paramètres → Mot de passe.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const GROUPES = 3;
const TAILLE_GROUPE = 4;

export function genererMotDePasseOuvrier(): string {
  for (;;) {
    const groupes = Array.from({ length: GROUPES }, () =>
      Array.from(
        { length: TAILLE_GROUPE },
        () => ALPHABET[randomInt(ALPHABET.length)],
      ).join(""),
    );
    const motDePasse = groupes.join("-");
    // Au moins une lettre ET un chiffre : compatible avec une politique de
    // mot de passe Supabase « lettres + chiffres ».
    if (/[a-z]/.test(motDePasse) && /[0-9]/.test(motDePasse)) {
      return motDePasse;
    }
  }
}
