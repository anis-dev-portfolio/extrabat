"use client";

import { useEffect } from "react";

// Dernier filet de sécurité : erreur dans le ROOT layout (ou hors de tout
// error.tsx). Ce boundary remplace le layout racine entier — il doit rendre
// son propre <html>/<body>, et le CSS global peut ne pas être chargeable :
// styles inline uniquement, zéro dépendance (pas de composants UI, pas de
// lucide). Message non technique, détails en console.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "16px",
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#fafafa",
          color: "#171717",
          padding: "24px",
        }}
      >
        <div>
          <h1 style={{ fontSize: "18px", fontWeight: 500, margin: 0 }}>
            Une erreur est survenue
          </h1>
          <p
            style={{
              maxWidth: "28rem",
              fontSize: "14px",
              color: "#737373",
              margin: "8px auto 0",
            }}
          >
            L&apos;application n&apos;a pas pu s&apos;afficher. Réessayez ; si
            le problème persiste, contactez votre administrateur.
          </p>
        </div>
        <button
          onClick={() => reset()}
          style={{
            border: "1px solid #d4d4d4",
            borderRadius: "8px",
            background: "#ffffff",
            padding: "8px 16px",
            fontSize: "14px",
            cursor: "pointer",
          }}
        >
          Réessayer
        </button>
      </body>
    </html>
  );
}
