"use client";

import { useSyncExternalStore } from "react";

// Repris du portfolio (src/lib/hooks.ts).

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const mq = window.matchMedia(REDUCED_MOTION_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** Préférence « mouvement réduit » ; false côté serveur. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );
}

const COARSE_POINTER_QUERY = "(pointer: coarse)";

/** Vrai sur écran tactile / pointeur grossier ; false côté serveur. */
export function useIsTouch(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(COARSE_POINTER_QUERY);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(COARSE_POINTER_QUERY).matches,
    () => false,
  );
}
