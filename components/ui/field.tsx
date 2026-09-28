import { cn } from "@/lib/ui";

// Select = menu déroulant maison (listbox accessible + animée), pas le <select>
// natif. Réexporté ici pour que les appelants gardent leur import unique.
export { Select } from "@/components/ui/select";

// Style partagé des contrôles de formulaire (Input/Textarea).
// text-base < sm : un champ focusé < 16 px déclenche le zoom viewport d'iOS.
const CONTROLE =
  "w-full rounded-md border border-neutral-300 bg-white px-3 text-base text-neutral-900 shadow-xs transition-colors placeholder:text-neutral-400 hover:border-neutral-400 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-500 aria-invalid:border-red-400 sm:text-sm";

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROLE, "h-10", className)} {...props} />;
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(CONTROLE, "min-h-24 py-2 leading-relaxed", className)}
      {...props}
    />
  );
}

// Enveloppe label + contrôle + aide/erreur. Le caller relie lui-même les
// aria-describedby si besoin ; l'erreur est annoncée via role="alert".
export function Field({
  label,
  htmlFor,
  aide,
  erreur,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  aide?: string;
  erreur?: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium text-neutral-800"
      >
        {label}
      </label>
      {children}
      {aide && !erreur && <p className="text-xs text-neutral-500">{aide}</p>}
      {erreur && (
        <p role="alert" className="text-sm text-red-700">
          {erreur}
        </p>
      )}
    </div>
  );
}
