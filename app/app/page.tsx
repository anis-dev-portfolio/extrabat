import { redirect } from "next/navigation";
import { requireUser, isBackOffice } from "@/lib/auth";

// Hub /app : réoriente chaque utilisateur vers sa vue selon son rôle.
// ASSISTANTE / ADMIN -> back-office (kanban) ; CONDUCTEUR -> ses visites ;
// OUVRIER -> ses chantiers.
export default async function AppHubPage() {
  const user = await requireUser();
  if (isBackOffice(user.role)) redirect("/app/dossiers");
  redirect(user.role === "OUVRIER" ? "/app/mes-chantiers" : "/app/mes-visites");
}
