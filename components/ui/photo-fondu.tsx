"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/ui";

// <img> qui apparaît en fondu une fois le bitmap décodé (URL signée async).
// Conserve crossOrigin (cache SW hors-ligne) + loading lazy. print:opacity-100 :
// une impression en cours de chargement ne sort pas une case blanche.
export function PhotoFondu({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const ref = useRef<HTMLImageElement>(null);
  const [charge, setCharge] = useState(false);
  // Image déjà en cache : le bitmap peut être décodé avant le montage → onLoad
  // ne tire jamais ; on rattrape via `complete`.
  useEffect(() => {
    if (ref.current?.complete) setCharge(true);
  }, []);
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      ref={ref}
      src={src}
      alt={alt}
      loading="lazy"
      crossOrigin="anonymous"
      onLoad={() => setCharge(true)}
      onError={() => setCharge(true)}
      className={cn(
        "bg-neutral-100 transition-opacity duration-500 ease-sortie print:opacity-100",
        charge ? "opacity-100" : "opacity-0",
        className,
      )}
    />
  );
}
