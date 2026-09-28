import { cn } from "@/lib/ui";

export type BadgeTon =
  | "neutre"
  | "primaire"
  | "ardoise"
  | "bleu"
  | "violet"
  | "ambre"
  | "vert"
  | "rouge";

// Contrastes vérifiés ≥ 4.5:1 (texte 800/900 sur fond 50/100).
const TONS: Record<BadgeTon, string> = {
  neutre: "border-neutral-300 bg-neutral-100 text-neutral-700",
  primaire: "border-primary-200 bg-primary-50 text-primary-800",
  ardoise: "border-slate-300 bg-slate-100 text-slate-800",
  bleu: "border-blue-200 bg-blue-50 text-blue-800",
  violet: "border-violet-200 bg-violet-50 text-violet-800",
  ambre: "border-amber-300 bg-amber-50 text-amber-900",
  vert: "border-green-200 bg-green-50 text-green-800",
  rouge: "border-red-200 bg-red-50 text-red-800",
};

export function Badge({
  ton = "neutre",
  className,
  children,
}: {
  ton?: BadgeTon;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        TONS[ton],
        className,
      )}
    >
      {children}
    </span>
  );
}
