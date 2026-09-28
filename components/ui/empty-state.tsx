import { Marque } from "@/components/ui/marque";
import { cn } from "@/lib/ui";

// État vide = une invitation à agir : ce qui est vide, pourquoi, et quoi faire.
// Par défaut, la marque ISOBAT en filigrane (signature visuelle discrète).
export function EmptyState({
  titre,
  description,
  action,
  icone,
  className,
}: {
  titre: string;
  description?: string;
  action?: React.ReactNode;
  icone?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-neutral-300 bg-white px-6 py-10 text-center",
        className,
      )}
    >
      {icone ?? <Marque mono className="h-9 w-auto text-neutral-300" />}
      <div className="space-y-1">
        <p className="text-sm font-medium text-neutral-900">{titre}</p>
        {description && (
          <p className="mx-auto max-w-sm text-sm text-neutral-500">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}
