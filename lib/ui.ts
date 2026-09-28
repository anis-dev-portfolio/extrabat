// Concatène des classes conditionnelles (pas de dépendance clsx/tailwind-merge :
// les composants maison n'ont pas de classes en conflit à fusionner).
export function cn(
  ...classes: Array<string | false | null | undefined>
): string {
  return classes.filter(Boolean).join(" ");
}
