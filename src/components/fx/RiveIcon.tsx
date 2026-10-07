"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useReducedMotion } from "@/lib/hooks";
import { onFirstInteraction } from "@/lib/perf";

// Le runtime Rive (JS + WASM) n'est évalué qu'à la première interaction, ou
// après 8 s : jamais dans la fenêtre de mesure du chargement (portfolio, rive-sticker.tsx).
const RiveIconInner = dynamic(() => import("./RiveIconInner"), { ssr: false });

/**
 * Icônes animées de public/rive/icons.riv (copie de interactiv-icon.riv du
 * portfolio). Le crâne a sa « State Machine 1 » ; l'étoile n'a que des timelines.
 */
export const RIVE_ICONS = {
  skull: { artboard: "15_Skull", animation: undefined, stillAnimation: undefined },
  star: { artboard: "42_Star 2", animation: "42_Star 2_Idle", stillAnimation: "42_Star 2_Idle" },
  starBurst: { artboard: "42_Star 2", animation: "42_Star 2_Anim", stillAnimation: "42_Star 2_Idle" },
} as const;

export type RiveIconKind = keyof typeof RIVE_ICONS;

/** Décoratif (aria-hidden) : le sens est toujours porté par le texte voisin. */
export function RiveIcon({ kind, className = "h-10 w-10" }: { kind: RiveIconKind; className?: string }) {
  const reduced = useReducedMotion();
  const [mount, setMount] = useState(false);
  useEffect(() => onFirstInteraction(() => setMount(true), 8000), []);
  const icon = RIVE_ICONS[kind];
  return (
    // div : le canvas Rive est enveloppé d'une <div>, interdite dans un <span> ou un <p>.
    <div aria-hidden className={`rive-icon ${className}`}>
      {mount && <RiveIconInner artboard={icon.artboard} animation={icon.animation} stillAnimation={icon.stillAnimation} still={reduced} />}
    </div>
  );
}
