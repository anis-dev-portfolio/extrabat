"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { messageFromError } from "@/lib/erreurs";

export type ActionState = { error: string | null };

// Marquer UNE notification comme lue. updateMany scopé destinataireId :
// impossible de toucher la notification d'un autre utilisateur (une cible
// étrangère ne matche simplement rien) — même invariant que le scoping org.
// requireUser NU (exception assumée à la convention requireRoleActif) :
// accuser réception n'est pas une mutation métier — tous les rôles reçoivent
// désormais des notifications (conducteur, ouvrier, back-office), et une org
// suspendue doit pouvoir marquer les siennes lues (voir CLAUDE.md,
// « Jamais bloqués »).
export async function marquerNotificationLue(
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Notification introuvable." };

  try {
    await prisma.notification.updateMany({
      where: { id, destinataireId: user.id },
      data: { lu: true },
    });
  } catch (e) {
    return { error: messageFromError(e) };
  }

  // Rafraîchit la liste ET le layout (pastille de la cloche, recalculée à
  // chaque rendu — voir lib/notifications.ts).
  revalidatePath("/app/notifications");
  return { error: null };
}

// Tout marquer comme lu — même garde requireUser nu (exception « Jamais
// bloqués », voir ci-dessus), même scoping destinataireId.
export async function marquerToutLu(): Promise<ActionState> {
  const user = await requireUser();

  try {
    await prisma.notification.updateMany({
      where: { destinataireId: user.id, lu: false },
      data: { lu: true },
    });
  } catch (e) {
    return { error: messageFromError(e) };
  }

  revalidatePath("/app/notifications");
  return { error: null };
}
