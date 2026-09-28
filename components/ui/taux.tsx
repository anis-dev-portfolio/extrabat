import { SEUIL_HUMIDITE } from "@/lib/metier";

// Taux d'humidité coloré selon le seuil métier : rouge au-delà du seuil
// (contre-visite nécessaire), neutre sinon. `seuil` par défaut = constante
// usine — les appelants qui ont l'organisation passent son seuil réglé
// (Organisation.seuilHumidite) pour rester cohérents avec le classement.
// Partagé par la liste des dossiers (app/app/dossiers/page.tsx) et la file
// « À traiter » (app/app/a-traiter/page.tsx).
export function Taux({
  taux,
  seuil = SEUIL_HUMIDITE,
}: {
  taux: number;
  seuil?: number;
}) {
  return (
    <span
      className={
        taux > seuil
          ? "font-semibold text-red-600"
          : "font-medium text-neutral-800"
      }
    >
      {taux}%
    </span>
  );
}
