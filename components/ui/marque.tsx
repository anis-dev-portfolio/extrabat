// Marque isométrique ISOBAT, vectorisée depuis public/isobat-marque.png
// (pentes 3:4, couleurs échantillonnées #12A8BC / #A8A8A8).
// `mono` : un seul ton hérité de currentColor — pour l'état actif de la
// navigation, les états vides et tout usage en filigrane.

const TURQUOISE = "#12A8BC";
const GRIS = "#A8A8A8";

export function Marque({
  className,
  mono = false,
}: {
  className?: string;
  mono?: boolean;
}) {
  const turquoise = mono ? "currentColor" : TURQUOISE;
  const gris = mono ? "currentColor" : GRIS;
  return (
    <svg
      viewBox="61 31 692 764"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <polygon
        fill={turquoise}
        points="406,61 91,297 91,765 274,629 274,429 406,330"
      />
      <polygon fill={turquoise} points="406,529 539,629 406,729 273,629" />
      <polygon
        fill={gris}
        points="408,61 723,297 723,765 540,629 540,429 408,330"
      />
      <polygon fill={gris} points="406,330 274,429 274,629 406,529" />
    </svg>
  );
}
