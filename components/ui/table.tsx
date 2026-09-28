import { cn } from "@/lib/ui";

// Table dense (chiffres tabulaires à poser par cellule via `tabular-nums`).
export function Table({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white shadow-xs">
      <table className={cn("w-full text-sm", className)}>{children}</table>
    </div>
  );
}

export function Th({
  className,
  children,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cn(
        "border-b border-neutral-200 bg-neutral-50 px-3 py-2 text-left text-xs font-semibold tracking-wide text-neutral-500 uppercase",
        className,
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export function Tr({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn("transition-colors hover:bg-neutral-50", className)}
      {...props}
    >
      {children}
    </tr>
  );
}

export function Td({
  className,
  children,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn(
        "border-b border-neutral-100 px-3 py-2 align-middle text-neutral-800",
        className,
      )}
      {...props}
    >
      {children}
    </td>
  );
}
