"use client";

import { Printer } from "lucide-react";
import { Button, type BoutonVariante } from "@/components/ui/button";

// Impression native du navigateur (window.print) — pas de librairie PDF : le
// dialogue d'impression propose « Enregistrer en PDF ». Masqué à l'impression.
export function PrintButton({
  label = "Imprimer",
  variante = "primaire",
}: {
  label?: string;
  variante?: BoutonVariante;
}) {
  return (
    <Button
      variante={variante}
      onClick={() => window.print()}
      className="print:hidden"
    >
      <Printer className="size-4" aria-hidden="true" />
      {label}
    </Button>
  );
}
