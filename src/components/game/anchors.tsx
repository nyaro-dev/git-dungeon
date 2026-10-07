"use client";

import { createContext, useCallback, useContext } from "react";

/**
 * Étiquettes ancrées dans la scène 3D mais rendues en DOM (intentions, PV,
 * chiffres de dégâts). Le DOM enregistre ses éléments avec une position monde ;
 * un seul useFrame (TagProjector, dans le canvas) les projette à l'écran.
 * Évite les <Html> de drei : une racine React par étiquette, démontées en plein
 * rendu dès qu'un monstre meurt ou bouge.
 */
export type Anchor = { el: HTMLElement; x: number; y: number; z: number };

export class AnchorRegistry {
  private readonly items = new Map<string, Anchor>();

  set(id: string, anchor: Anchor) {
    this.items.set(id, anchor);
  }

  delete(id: string) {
    this.items.delete(id);
  }

  forEach(fn: (a: Anchor) => void) {
    this.items.forEach(fn);
  }
}

export const AnchorContext = createContext<AnchorRegistry | null>(null);

/** Ref callback : ancre l'élément au point monde (x, y, z) tant qu'il est monté. */
export function useAnchor(id: string, x: number, y: number, z: number) {
  const registry = useContext(AnchorContext);
  return useCallback(
    (el: HTMLElement | null) => {
      if (!registry) return;
      if (el) registry.set(id, { el, x, y, z });
      else registry.delete(id);
    },
    [registry, id, x, y, z],
  );
}
