// Distance à vol d'oiseau — sert de SIGNAL D'AIDE À LA DÉCISION pour
// l'assistante (quel jour/quelle visite regrouper), jamais à réordonner une
// tournée : c'est l'assistante qui ordonne les visites d'une même plage via la
// carte. Volontairement pas de moteur d'ordre de tournée (plus proche voisin /
// 2-opt) : la plage horaire est une fenêtre d'arrivée, pas un ordre imposé.

export type Point = { latitude: number; longitude: number };
export type Proximite = "proche" | "loin" | null;

// Seuils ajustables (même esprit que SEUIL_HUMIDITE dans lib/metier.ts).
// En dessous de PROCHE : à regrouper. Au-dessus de LOIN : signal d'alerte.
// Entre les deux : aucun signal (évite le bruit visuel).
export const DISTANCE_PROCHE_KM = 8;
export const DISTANCE_LOIN_KM = 25;

const RAYON_TERRE_KM = 6371;

export function distanceKm(a: Point, b: Point): number {
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * RAYON_TERRE_KM * Math.asin(Math.sqrt(h));
}

export function classerProximite(distance: number): Proximite {
  if (distance <= DISTANCE_PROCHE_KM) return "proche";
  if (distance >= DISTANCE_LOIN_KM) return "loin";
  return null;
}

export function formatDistanceKm(km: number): string {
  return `${Math.round(km)} km`;
}

// Distance minimale entre `cible` et les points géocodés de `autres` (ceux
// sans coordonnées sont ignorés). Null si `cible` n'est pas géocodée ou si
// aucun point comparable n'est disponible.
export function distanceMinKm(
  cible: Point | null,
  autres: readonly (Point | null)[],
): number | null {
  if (!cible) return null;
  let min: number | null = null;
  for (const point of autres) {
    if (!point) continue;
    const d = distanceKm(cible, point);
    if (min === null || d < min) min = d;
  }
  return min;
}
