import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ROLE_LABELS } from "@/lib/metier";
import { Badge, type BadgeTon } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import type { Role } from "@/lib/generated/prisma/enums";
import { BoutonSupprimer } from "@/components/ui/bouton-supprimer";
import { EnteteParametres } from "../entete";
import { AjouterMembreForm } from "./form";
import { retirerMembreAutorise } from "./actions";

const ROLE_TONS: Record<Role, BadgeTon> = {
  ADMIN: "primaire",
  ASSISTANTE: "violet",
  CONDUCTEUR: "bleu",
  // Les accès OUVRIER se donnent depuis Paramètres → Ouvriers (liaison à la
  // fiche garantie) — mais un compte provisionné apparaît dans la liste.
  OUVRIER: "vert",
};

export const metadata: Metadata = { title: "Utilisateurs" };

// Remplace l'ancienne page /app/membres (qui redirige ici) : comptes
// provisionnés + liste d'autorisation (seuls ces emails peuvent créer un
// compte à la 1re connexion, avec le rôle indiqué).
export default async function UtilisateursPage() {
  const user = await requireRole(["ADMIN"]);

  const [utilisateurs, membres] = await Promise.all([
    prisma.user.findMany({
      where: { organisationId: user.organisationId },
      orderBy: [{ role: "asc" }, { nom: "asc" }],
      select: { id: true, nom: true, email: true, role: true },
    }),
    prisma.membreAutorise.findMany({
      where: { organisationId: user.organisationId },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const emailsProvisionnes = new Set(
    utilisateurs.map((u) => u.email.toLowerCase()),
  );

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <EnteteParametres
        titre="Utilisateurs"
        description={`Comptes et accès de ${user.organisation.nom}.`}
      />

      <section className="space-y-3">
        <h2 className="font-display text-base font-medium text-neutral-900">
          Comptes de l&apos;équipe
        </h2>
        <Table>
          <thead>
            <tr>
              <Th>Nom</Th>
              <Th>Email</Th>
              <Th>Rôle</Th>
            </tr>
          </thead>
          <tbody>
            {utilisateurs.map((u) => (
              <Tr key={u.id}>
                <Td className="font-medium text-neutral-900">{u.nom}</Td>
                <Td className="text-neutral-600">{u.email}</Td>
                <Td>
                  <Badge ton={ROLE_TONS[u.role]}>{ROLE_LABELS[u.role]}</Badge>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-display text-base font-medium text-neutral-900">
            Emails autorisés
          </h2>
          <p className="text-sm text-neutral-500">
            Seuls ces emails peuvent créer un compte à la première connexion,
            avec le rôle indiqué. Retirer un email n&apos;affecte pas un compte
            déjà créé.
          </p>
        </div>

        <AjouterMembreForm />

        {membres.length === 0 ? (
          <EmptyState
            titre="Aucun email autorisé"
            description="Ajoutez l'email d'un futur membre pour lui ouvrir l'accès."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Email</Th>
                <Th>Rôle prévu</Th>
                <Th>Compte</Th>
                <Th className="w-12">
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {membres.map((m) => (
                <Tr key={m.id}>
                  <Td className="text-neutral-800">{m.email}</Td>
                  <Td>
                    <Badge ton={ROLE_TONS[m.role]}>{ROLE_LABELS[m.role]}</Badge>
                  </Td>
                  <Td className="text-neutral-500">
                    {emailsProvisionnes.has(m.email) ? (
                      <Badge ton="vert">Créé</Badge>
                    ) : (
                      <Badge ton="neutre">En attente</Badge>
                    )}
                  </Td>
                  <Td>
                    <BoutonSupprimer
                      action={retirerMembreAutorise}
                      id={m.id}
                      titre="Retirer cet email ?"
                      description={`${m.email} ne pourra plus créer de compte à la première connexion. Un compte déjà créé n'est pas affecté.`}
                      succes="Email retiré de la liste d'autorisation."
                      ariaLabel={`Retirer ${m.email}`}
                      className="flex size-11 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-700 sm:size-8"
                    />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>
    </div>
  );
}
