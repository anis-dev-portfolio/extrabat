import { redirect } from "next/navigation";

// Compat : la gestion des membres vit désormais dans Paramètres → Utilisateurs.
export default function MembresPage() {
  redirect("/app/parametres/utilisateurs");
}
