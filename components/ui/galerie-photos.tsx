"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { PhotoFondu } from "@/components/ui/photo-fondu";
import { cn } from "@/lib/ui";

type PhotoGalerie = { id: string; url: string | null };

// Grille de photos cliquables + lightbox plein écran sur l'élément natif
// <dialog> (focus trap et Échap gratuits) : clic sur le fond ferme, ← / →
// naviguent. Les vignettes restent des <figure>/<img> imprimables (le dialog
// fermé n'imprime rien). URL signées à durée limitée : next/image n'apporte
// rien ici ; crossOrigin est porté par PhotoFondu (cache SW hors-ligne).
export function GaleriePhotos({
  photos,
  classeGrille,
  classeVignette,
  classeIndispo,
  legendes = false,
}: {
  photos: PhotoGalerie[];
  classeGrille: string;
  classeVignette: string;
  classeIndispo: string;
  legendes?: boolean;
}) {
  const refDialog = useRef<HTMLDialogElement>(null);
  // Seules les photos dont l'URL a pu être signée entrent dans la lightbox.
  const visibles = photos.filter(
    (p): p is PhotoGalerie & { url: string } => p.url !== null,
  );
  const [index, setIndex] = useState<number | null>(null);

  useEffect(() => {
    const dialog = refDialog.current;
    if (!dialog) return;
    if (index !== null && !dialog.open) dialog.showModal();
    if (index === null && dialog.open) dialog.close();
  }, [index]);

  const precedente = () =>
    setIndex((i) =>
      i === null ? i : (i - 1 + visibles.length) % visibles.length,
    );
  const suivante = () =>
    setIndex((i) => (i === null ? i : (i + 1) % visibles.length));

  let rang = -1;
  return (
    <>
      <div className={classeGrille}>
        {photos.map((photo, i) => {
          if (!photo.url) {
            return (
              <div key={photo.id} className={classeIndispo}>
                Photo indisponible
              </div>
            );
          }
          rang += 1;
          const iVisible = rang;
          return (
            <figure key={photo.id} className="space-y-1 break-inside-avoid">
              <button
                type="button"
                onClick={() => setIndex(iVisible)}
                aria-label={`Agrandir la photo ${i + 1}`}
                className="block w-full cursor-zoom-in rounded-md transition-transform duration-150 ease-standard active:scale-[0.98]"
              >
                <PhotoFondu
                  src={photo.url}
                  alt={`Photo ${i + 1} de la visite`}
                  className={classeVignette}
                />
              </button>
              {legendes && (
                <figcaption className="text-xs text-neutral-500">
                  Photo {i + 1}
                </figcaption>
              )}
            </figure>
          );
        })}
      </div>

      <dialog
        ref={refDialog}
        onClose={() => setIndex(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") precedente();
          if (e.key === "ArrowRight") suivante();
        }}
        aria-label="Photo agrandie"
        className="dialog-anime lightbox-anime m-0 h-full max-h-none w-full max-w-none bg-transparent p-0 print:hidden"
      >
        {index !== null && visibles[index] && (
          <div
            // Le dialog occupe tout l'écran : le « fond » cliquable, c'est ce
            // wrapper (e.target === currentTarget = clic hors de la photo).
            onClick={(e) => {
              if (e.target === e.currentTarget) setIndex(null);
            }}
            className="relative flex h-full w-full items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]"
          >
            {/* key : remonter PhotoFondu à chaque navigation rejoue le fondu. */}
            <PhotoFondu
              key={visibles[index].id}
              src={visibles[index].url}
              alt={`Photo ${index + 1} sur ${visibles.length}`}
              className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
            />
            <button
              type="button"
              onClick={() => setIndex(null)}
              aria-label="Fermer"
              className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-3 flex size-11 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/25"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
            {visibles.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={precedente}
                  aria-label="Photo précédente"
                  className={cn(
                    "absolute top-1/2 left-3 flex size-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full",
                    "bg-white/10 text-white transition-colors hover:bg-white/25",
                  )}
                >
                  <ChevronLeft className="size-6" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={suivante}
                  aria-label="Photo suivante"
                  className={cn(
                    "absolute top-1/2 right-3 flex size-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full",
                    "bg-white/10 text-white transition-colors hover:bg-white/25",
                  )}
                >
                  <ChevronRight className="size-6" aria-hidden="true" />
                </button>
                <p className="absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 text-xs font-medium text-white/80 tabular-nums">
                  {index + 1} / {visibles.length}
                </p>
              </>
            )}
          </div>
        )}
      </dialog>
    </>
  );
}
