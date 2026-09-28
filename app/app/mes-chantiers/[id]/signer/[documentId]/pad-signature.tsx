"use client";

import { useEffect, useRef, useState } from "react";
import { Eraser, PenLine, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { LIMITES } from "@/lib/validation";

// Pad de signature plein écran : le client signe AU DOIGT sur le téléphone
// tendu par l'ouvrier, saisit son nom et coche « lu et approuvé ». Le tracé
// est recadré sur sa boîte englobante avant export PNG (fond transparent) —
// le tamponnage serveur reçoit une image dense, pas un canvas plein de vide.
export function PadSignature({
  onValider,
  onFermer,
  envoi,
}: {
  onValider: (signature: {
    blob: Blob;
    nomSignataire: string;
  }) => void;
  onFermer: () => void;
  envoi: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const zoneRef = useRef<HTMLDivElement>(null);
  // Boîte englobante des tracés (coordonnées canvas physiques).
  const bboxRef = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(
    null,
  );
  const dessinRef = useRef(false);
  const [aTrace, setATrace] = useState(false);
  const [nom, setNom] = useState("");
  const [luEtApprouve, setLuEtApprouve] = useState(false);

  // Dimensionne le canvas à sa zone une fois monté (résolution physique
  // = CSS × devicePixelRatio pour un trait net).
  useEffect(() => {
    const canvas = canvasRef.current;
    const zone = zoneRef.current;
    if (!canvas || !zone) return;
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = zone.getBoundingClientRect();
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.lineWidth = 2.5 * dpr;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#101828";
    }
  }, []);

  function pointCanvas(e: React.PointerEvent): { x: number; y: number } {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const dpr = canvas.width / rect.width;
    return { x: (e.clientX - rect.left) * dpr, y: (e.clientY - rect.top) * dpr };
  }

  function etendreBbox(x: number, y: number) {
    const marge = 6;
    const b = bboxRef.current;
    if (!b) {
      bboxRef.current = { x0: x - marge, y0: y - marge, x1: x + marge, y1: y + marge };
    } else {
      b.x0 = Math.min(b.x0, x - marge);
      b.y0 = Math.min(b.y0, y - marge);
      b.x1 = Math.max(b.x1, x + marge);
      b.y1 = Math.max(b.y1, y + marge);
    }
  }

  function surPointerDown(e: React.PointerEvent) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    canvas.setPointerCapture(e.pointerId);
    dessinRef.current = true;
    const { x, y } = pointCanvas(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    // Un point seul (initiale tapée) doit aussi marquer.
    ctx.lineTo(x + 0.1, y + 0.1);
    ctx.stroke();
    etendreBbox(x, y);
    setATrace(true);
  }

  function surPointerMove(e: React.PointerEvent) {
    if (!dessinRef.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pointCanvas(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    etendreBbox(x, y);
  }

  function surPointerUp() {
    dessinRef.current = false;
  }

  function effacer() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    bboxRef.current = null;
    setATrace(false);
  }

  function valider() {
    const canvas = canvasRef.current;
    const bbox = bboxRef.current;
    if (!canvas || !bbox || !aTrace) return;

    // Recadrage sur la boîte englobante (bornée au canvas).
    const x0 = Math.max(0, Math.floor(bbox.x0));
    const y0 = Math.max(0, Math.floor(bbox.y0));
    const w = Math.min(canvas.width, Math.ceil(bbox.x1)) - x0;
    const h = Math.min(canvas.height, Math.ceil(bbox.y1)) - y0;
    if (w <= 0 || h <= 0) return;

    const recadre = document.createElement("canvas");
    recadre.width = w;
    recadre.height = h;
    recadre.getContext("2d")!.drawImage(canvas, x0, y0, w, h, 0, 0, w, h);
    recadre.toBlob((blob) => {
      if (blob) onValider({ blob, nomSignataire: nom.trim() });
    }, "image/png");
  }

  const pret = aTrace && nom.trim().length > 0 && luEtApprouve && !envoi;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3">
        <p className="font-display text-base font-bold text-neutral-900">
          Signature du client
        </p>
        <button
          type="button"
          onClick={onFermer}
          aria-label="Fermer sans signer"
          className="flex size-11 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        <div
          ref={zoneRef}
          className="relative min-h-0 flex-1 overflow-hidden rounded-lg border-2 border-dashed border-neutral-300 bg-neutral-50"
        >
          {!aTrace && (
            <p className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-sm text-neutral-400">
              <PenLine className="size-4" aria-hidden="true" />
              Signez ici, au doigt
            </p>
          )}
          <canvas
            ref={canvasRef}
            onPointerDown={surPointerDown}
            onPointerMove={surPointerMove}
            onPointerUp={surPointerUp}
            onPointerCancel={surPointerUp}
            className="absolute inset-0 touch-none"
          />
        </div>

        <Field label="Nom du signataire" htmlFor="nom-signataire">
          <Input
            id="nom-signataire"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            maxLength={LIMITES.NOM}
            placeholder="Prénom Nom du client"
            autoComplete="off"
          />
        </Field>

        <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm text-neutral-800">
          <input
            type="checkbox"
            checked={luEtApprouve}
            onChange={(e) => setLuEtApprouve(e.target.checked)}
            className="size-5 accent-primary-600"
          />
          Lu et approuvé
        </label>

        <div className="flex gap-2">
          <Button
            type="button"
            variante="secondaire"
            taille="pouce"
            onClick={effacer}
            disabled={!aTrace || envoi}
            className="flex-1"
          >
            <Eraser className="size-4" aria-hidden="true" />
            Effacer
          </Button>
          <Button
            type="button"
            taille="pouce"
            onClick={valider}
            disabled={!pret}
            className="flex-[2]"
          >
            {envoi ? "Envoi…" : "Valider la signature"}
          </Button>
        </div>
      </div>
    </div>
  );
}
