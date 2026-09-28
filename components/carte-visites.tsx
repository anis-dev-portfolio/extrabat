"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import { cn } from "@/lib/ui";

// Carte des visites (Leaflet + tuiles OpenStreetMap — gratuit, sans clé,
// même esprit que la BAN). Elle montre la réalité géographique elle-même :
// l'assistante VOIT où sont les visites au lieu de faire confiance à un
// signal calculé. Marqueurs = cercles colorés (aucun asset image Leaflet à
// bundler), tooltip au survol. Le point `principal` (dossier à planifier)
// est peint par-dessus, plus gros.
//
// Leaflet touche `window` à l'import : chargé dynamiquement dans l'effet,
// jamais au module — le composant reste importable dans un arbre SSR.

export type PointCarte = {
  latitude: number;
  longitude: number;
  label: string; // tooltip : « 09:00 – 10:00 · M. Dupont »
  couleur: string; // hex CSS
  principal?: boolean;
};

// Couleurs des conducteurs sur la carte du planning (attribuées par index,
// stables pour une même liste triée). Pas de rouge : réservé au dossier à
// planifier.
export const COULEURS_CARTE = [
  "#2563eb", // bleu
  "#059669", // émeraude
  "#d97706", // ambre
  "#7c3aed", // violet
  "#0891b2", // cyan
  "#db2777", // rose
  "#65a30d", // olive
  "#475569", // ardoise
] as const;

export const COULEUR_DOSSIER = "#dc2626"; // rouge — le dossier à planifier

export function CarteVisites({
  points,
  className,
}: {
  points: PointCarte[];
  className?: string;
}) {
  const conteneurRef = useRef<HTMLDivElement>(null);
  const carteRef = useRef<LeafletMap | null>(null);
  const calqueRef = useRef<LayerGroup | null>(null);

  useEffect(() => {
    let annule = false;

    async function dessiner() {
      // CSS Leaflet chargée À LA DEMANDE avec le JS (chunk CSS séparé) : un
      // import statique l'embarquerait dans le CSS initial de toutes les pages
      // qui référencent ce module — y compris planning/page.tsx qui n'importe
      // que les constantes couleur côté serveur.
      const [L] = await Promise.all([
        import("leaflet"),
        import("leaflet/dist/leaflet.css"),
      ]);
      const conteneur = conteneurRef.current;
      if (annule || !conteneur) return;

      if (!carteRef.current) {
        carteRef.current = L.map(conteneur, {
          zoomControl: true,
          attributionControl: true,
          scrollWheelZoom: false, // la molette garde le scroll de la page
        });
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        }).addTo(carteRef.current);
        calqueRef.current = L.layerGroup().addTo(carteRef.current);
      }

      const carte = carteRef.current;
      const calque = calqueRef.current!;
      calque.clearLayers();

      if (points.length === 0) return;

      // Le principal en dernier : peint au-dessus des autres.
      const ordonnes = [...points].sort(
        (a, b) => Number(a.principal ?? false) - Number(b.principal ?? false),
      );
      for (const p of ordonnes) {
        L.circleMarker([p.latitude, p.longitude], {
          radius: p.principal ? 10 : 7,
          color: "#ffffff",
          weight: 2,
          fillColor: p.couleur,
          fillOpacity: p.principal ? 0.95 : 0.85,
        })
          .bindTooltip(p.label, { direction: "top", offset: [0, -8] })
          .addTo(calque);
      }

      const bornes = L.latLngBounds(
        points.map((p) => [p.latitude, p.longitude] as [number, number]),
      );
      carte.fitBounds(bornes, { padding: [28, 28], maxZoom: 14 });
    }

    dessiner();
    return () => {
      annule = true;
    };
  }, [points]);

  // Démontage : détruire l'instance Leaflet (sinon "Map container is being
  // reused" à la prochaine navigation).
  useEffect(() => {
    return () => {
      carteRef.current?.remove();
      carteRef.current = null;
      calqueRef.current = null;
    };
  }, []);

  return (
    <div
      ref={conteneurRef}
      role="img"
      aria-label="Carte des visites"
      // isolate : les contrôles Leaflet (z-index internes jusqu'à 1000)
      // restent confinés sous le header sticky du shell.
      className={cn(
        "relative isolate z-0 h-56 w-full rounded-md border border-neutral-200",
        className,
      )}
    />
  );
}
