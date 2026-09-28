// Géocodage best-effort via l'API Adresse (BAN) — gouvernement français,
// gratuite, sans clé, bonne couverture Île-de-France. Ne lève JAMAIS : un
// réseau down, une réponse vide ou un JSON invalide renvoie simplement
// `null`, pour ne jamais bloquer la création/édition d'un dossier.
//
// Ce module est importable côté client (autocomplétion) comme côté serveur :
// il ne doit dépendre d'aucun module serveur.
const BAN_URL = "https://api-adresse.data.gouv.fr/search/";
const TIMEOUT_MS = 5_000;

// Score BAN (0-1) minimum pour considérer une adresse comme géocodée. En
// dessous (ou aucun résultat), le dossier reste "non géocodé" : corrigible en
// rééditant l'adresse jusqu'à ce qu'elle matche mieux.
export const SCORE_GEOCODAGE_MIN = 0.5;

// Toute l'activité est en Île-de-France : un résultat BAN hors IDF est
// forcément un mauvais match de commune homonyme (ex. « Villepinte » existe
// aussi dans l'Aude, « rue de l'Université » partout en France) — on le
// rejette plutôt que de fausser les distances de tournée de 600 km.
export const DEPARTEMENTS_AUTORISES: readonly string[] = [
  "75",
  "77",
  "78",
  "91",
  "92",
  "93",
  "94",
  "95",
];

// Biais géographique passé à BAN (`lat`/`lon`) : favorise les résultats
// proches du cœur d'activité (est francilien) pour désambiguïser les
// homonymes AVANT le filtre par département.
const BIAIS_LATITUDE = 48.9;
const BIAIS_LONGITUDE = 2.55;

export type ResultatGeocodage = {
  latitude: number;
  longitude: number;
  score: number;
  departement: string | null;
};

export function estDepartementAutorise(
  departement: string | null,
): departement is string {
  return departement !== null && DEPARTEMENTS_AUTORISES.includes(departement);
}

// `context` BAN a la forme "77, Seine-et-Marne, Île-de-France" — le code
// département est le premier segment.
function extraireDepartement(context: unknown): string | null {
  if (typeof context !== "string") return null;
  const code = context.split(",")[0]?.trim();
  return code || null;
}

// Construit l'URL /search avec le biais géographique — partagée entre le
// géocodage serveur et l'autocomplétion client.
export function urlRechercheBan(q: string, limit: number): string {
  const params = new URLSearchParams({
    q,
    limit: String(limit),
    lat: String(BIAIS_LATITUDE),
    lon: String(BIAIS_LONGITUDE),
  });
  return `${BAN_URL}?${params.toString()}`;
}

// Extrait un ResultatGeocodage valide (coordonnées, score suffisant,
// département autorisé) d'une feature BAN brute. Null si inexploitable.
export function resultatDepuisFeatureBan(
  feature: unknown,
): ResultatGeocodage | null {
  if (typeof feature !== "object" || feature === null) return null;
  const f = feature as {
    geometry?: { coordinates?: unknown };
    properties?: { score?: unknown; context?: unknown };
  };
  const coords = f.geometry?.coordinates;
  const score = f.properties?.score;
  if (
    !Array.isArray(coords) ||
    coords.length !== 2 ||
    typeof score !== "number" ||
    score < SCORE_GEOCODAGE_MIN
  ) {
    return null;
  }

  const [longitude, latitude] = coords;
  if (typeof longitude !== "number" || typeof latitude !== "number") {
    return null;
  }

  const departement = extraireDepartement(f.properties?.context);
  if (!estDepartementAutorise(departement)) return null;

  return { latitude, longitude, score, departement };
}

export async function geocoderAdresse(
  adresse: string,
): Promise<ResultatGeocodage | null> {
  try {
    const reponse = await fetch(urlRechercheBan(adresse, 1), {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!reponse.ok) return null;

    const donnees = await reponse.json();
    return resultatDepuisFeatureBan(donnees?.features?.[0]);
  } catch {
    return null;
  }
}

// Coordonnées transmises par l'autocomplétion d'adresse (champs cachés de la
// suggestion BAN CHOISIE par l'utilisateur — pas de re-géocodage du texte).
// Mêmes exigences que le géocodage serveur : valeurs plausibles, score
// suffisant, département autorisé — sinon null et on retombe sur le
// best-effort serveur.
export function geocodageDepuisFormulaire(
  formData: FormData,
): ResultatGeocodage | null {
  const latitude = Number(formData.get("geoLatitude"));
  const longitude = Number(formData.get("geoLongitude"));
  const score = Number(formData.get("geoScore"));
  const departement = String(formData.get("geoDepartement") ?? "").trim();

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(score) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180 ||
    score < SCORE_GEOCODAGE_MIN ||
    score > 1 ||
    !estDepartementAutorise(departement)
  ) {
    return null;
  }

  return { latitude, longitude, score, departement };
}
