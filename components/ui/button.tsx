import { cn } from "@/lib/ui";

export type BoutonVariante = "primaire" | "secondaire" | "danger" | "fantome";
export type BoutonTaille = "sm" | "md" | "pouce";

const BASE =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-md font-medium transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-standard active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";

const VARIANTES: Record<BoutonVariante, string> = {
  primaire: "bg-primary-600 text-white hover:bg-primary-700 hover:shadow-sm",
  secondaire:
    "border border-neutral-300 bg-white text-neutral-800 shadow-xs hover:bg-neutral-100",
  danger: "bg-red-600 text-white hover:bg-red-700",
  fantome: "text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900",
};

const TAILLES: Record<BoutonTaille, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  // Cible tactile ≥ 44 px : formulaires terrain du conducteur.
  pouce: "h-12 px-5 text-base",
};

// Hauteur tactile mobile (≥ 44 px) pour un bouton `sm` fréquent au doigt : à
// passer en className — min-h ne conflicte pas avec le h-8 de la taille
// (cn() ne fusionne pas les conflits Tailwind), desktop inchangé.
export const TACTILE_MOBILE = "min-h-11 sm:min-h-0";

// Pour appliquer le style bouton à autre chose qu'un <button> (ex. <Link>).
export function boutonClasses(
  variante: BoutonVariante = "primaire",
  taille: BoutonTaille = "md",
  className?: string,
): string {
  return cn(BASE, VARIANTES[variante], TAILLES[taille], className);
}

export function Button({
  variante = "primaire",
  taille = "md",
  className,
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: BoutonVariante;
  taille?: BoutonTaille;
}) {
  return (
    <button
      type={type}
      className={boutonClasses(variante, taille, className)}
      {...props}
    />
  );
}
