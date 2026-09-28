// Chargeurs Prisma du planning — le pendant « données » de lib/planning.ts
// (qui reste pur). TOUTES les requêtes sont scopées organisation via le
// conducteur ou le dossier (les tables HoraireRecurrent/Absence ne portent
// pas organisationId : le conducteur vérifié de l'org est le point de
// passage obligé, même pattern que planifierVisite).
import type { Prisma } from "@/lib/generated/prisma/client";
import {
  ajouterJoursLocal,
  debutJourLocal,
  detecterConflits,
  type Conflit,
  type ContexteConducteur,
  type Creneau,
  type Fenetre,
} from "@/lib/planning";

// Accepte le client Prisma comme un client de transaction.
type Db = Prisma.TransactionClient;

// Visite chargée pour le planning : le contexte de conflits + de quoi peindre
// les blocs (dossier, adresse, numéro).
export type VisitePlanning = {
  id: string;
  debut: Date;
  dureeMinutes: number;
  nomClient: string;
  conducteurId: string;
  dossierId: string;
  adresse: string;
  numero: number;
  latitude: number | null;
  longitude: number | null;
  departement: string | null;
};

export type ContexteCharge = Omit<ContexteConducteur, "visites"> & {
  visites: VisitePlanning[];
};

// Les visites qui CHEVAUCHENT la borne de début (commencées avant la fenêtre,
// finissant dedans) doivent être attrapées : on élargit le `gte` de 24 h
// (durée max d'une visite = 8 h, marge large) puis on filtre en mémoire.
const MARGE_MS = 24 * 60 * 60 * 1000;

async function requeteVisites(
  db: Db,
  organisationId: string,
  fenetre: Fenetre,
  conducteurIds?: readonly string[],
  exclureVisiteId?: string,
): Promise<VisitePlanning[]> {
  const lignes = await db.visite.findMany({
    where: {
      statut: "PLANIFIEE",
      dossier: { organisationId },
      ...(conducteurIds ? { conducteurId: { in: [...conducteurIds] } } : {}),
      ...(exclureVisiteId ? { id: { not: exclureVisiteId } } : {}),
      datePlanifiee: {
        gte: new Date(fenetre.debut.getTime() - MARGE_MS),
        lt: fenetre.fin,
      },
    },
    select: {
      id: true,
      datePlanifiee: true,
      dureeMinutes: true,
      numero: true,
      conducteurId: true,
      dossier: {
        select: {
          id: true,
          nomClient: true,
          adresse: true,
          latitude: true,
          longitude: true,
          departement: true,
        },
      },
    },
    orderBy: { datePlanifiee: "asc" },
  });

  return lignes
    .filter(
      (v) =>
        v.datePlanifiee.getTime() + v.dureeMinutes * 60_000 >
        fenetre.debut.getTime(),
    )
    .map((v) => ({
      id: v.id,
      debut: v.datePlanifiee,
      dureeMinutes: v.dureeMinutes,
      nomClient: v.dossier.nomClient,
      conducteurId: v.conducteurId,
      dossierId: v.dossier.id,
      adresse: v.dossier.adresse,
      numero: v.numero,
      latitude: v.dossier.latitude,
      longitude: v.dossier.longitude,
      departement: v.dossier.departement,
    }));
}

function requeteHoraires(
  db: Db,
  organisationId: string,
  conducteurIds?: readonly string[],
) {
  return db.horaireRecurrent.findMany({
    where: {
      conducteur: { organisationId },
      ...(conducteurIds ? { conducteurId: { in: [...conducteurIds] } } : {}),
    },
    select: {
      conducteurId: true,
      jourSemaine: true,
      heureDebut: true,
      heureFin: true,
    },
  });
}

// Chevauchement d'absence : la période couvre [dateDebut, dateFin + 1 jour) —
// même marge élargie qu'au-dessus, la précision est refaite en mémoire par
// detecterConflits.
function requeteAbsences(
  db: Db,
  organisationId: string,
  fenetre: Fenetre,
  conducteurIds?: readonly string[],
) {
  return db.absence.findMany({
    where: {
      conducteur: { organisationId },
      ...(conducteurIds ? { conducteurId: { in: [...conducteurIds] } } : {}),
      dateDebut: { lt: fenetre.fin },
      dateFin: { gte: new Date(fenetre.debut.getTime() - MARGE_MS) },
    },
    select: {
      conducteurId: true,
      dateDebut: true,
      dateFin: true,
      motif: true,
    },
  });
}

// Contextes de conflits d'un ensemble de conducteurs sur une fenêtre.
// À utiliser HORS transaction (requêtes parallèles) — dans une transaction,
// passer par verifierCreneau (séquentiel).
export async function chargerContextes(
  db: Db,
  organisationId: string,
  fenetre: Fenetre,
  opts: {
    conducteurIds?: readonly string[];
    exclureVisiteId?: string;
    ouvertureOrg: { heureDebut: number; heureFin: number };
  },
): Promise<Map<string, ContexteCharge>> {
  const { conducteurIds, exclureVisiteId, ouvertureOrg } = opts;

  const [visites, horaires, absences] = await Promise.all([
    requeteVisites(db, organisationId, fenetre, conducteurIds, exclureVisiteId),
    requeteHoraires(db, organisationId, conducteurIds),
    requeteAbsences(db, organisationId, fenetre, conducteurIds),
  ]);

  const contextes = new Map<string, ContexteCharge>();
  const contexte = (conducteurId: string): ContexteCharge => {
    let ctx = contextes.get(conducteurId);
    if (!ctx) {
      ctx = { visites: [], horaires: [], absences: [], ouvertureOrg };
      contextes.set(conducteurId, ctx);
    }
    return ctx;
  };

  for (const id of conducteurIds ?? []) contexte(id);
  for (const v of visites) contexte(v.conducteurId).visites.push(v);
  for (const h of horaires) {
    contexte(h.conducteurId).horaires.push({
      jourSemaine: h.jourSemaine,
      heureDebut: h.heureDebut,
      heureFin: h.heureFin,
    });
  }
  for (const a of absences) {
    contexte(a.conducteurId).absences.push({
      dateDebut: a.dateDebut,
      dateFin: a.dateFin,
      motif: a.motif,
    });
  }

  return contextes;
}

// Re-vérifie UN créneau pour UN conducteur — version transaction-safe
// (requêtes séquentielles), appelée DANS la transaction des actions
// planifier/replanifier : le serveur reste le juge, l'UI n'est qu'un confort.
export async function verifierCreneau(
  db: Db,
  organisationId: string,
  conducteurId: string,
  creneau: Creneau,
  ouvertureOrg: { heureDebut: number; heureFin: number },
  exclureVisiteId?: string,
): Promise<Conflit[]> {
  // Fenêtre = le jour du créneau, marges gérées par les requêtes.
  const debutJour = debutJourLocal(creneau.debut);
  const fenetre: Fenetre = {
    debut: debutJour,
    fin: ajouterJoursLocal(debutJour, 1),
  };
  const ids = [conducteurId] as const;

  const visites = await requeteVisites(
    db,
    organisationId,
    fenetre,
    ids,
    exclureVisiteId,
  );
  const horaires = await requeteHoraires(db, organisationId, ids);
  const absences = await requeteAbsences(db, organisationId, fenetre, ids);

  const ctx: ContexteConducteur = {
    visites,
    horaires,
    absences,
    ouvertureOrg,
  };
  return detecterConflits(creneau, ctx);
}
