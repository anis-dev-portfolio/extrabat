import { cn } from "@/lib/ui";

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-lg border border-neutral-200 bg-white shadow-xs",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  titre,
  action,
  className,
}: {
  titre: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex items-center justify-between gap-4 border-b border-neutral-100 px-4 py-3",
        className,
      )}
    >
      <h2 className="font-display text-base font-medium text-neutral-900">
        {titre}
      </h2>
      {action}
    </header>
  );
}

export function CardBody({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("p-4", className)}>{children}</div>;
}
