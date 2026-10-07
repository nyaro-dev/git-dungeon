"use client";

/**
 * Palier de qualité et planification du travail coûteux, repris du portfolio
 * (src/lib/perf.ts). « low » ne change jamais le design : seulement des
 * réglages invisibles (DPR WebGL, taille des ombres).
 */
export type QualityTier = "high" | "low";

const KEY = "fx-quality-tier";
let current: QualityTier | null = null;

function heuristic(): QualityTier {
  if (typeof navigator === "undefined") return "high";
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency ?? 8;
  const mem = nav.deviceMemory ?? 8;
  return cores <= 4 || mem <= 4 ? "low" : "high";
}

export function getQualityTier(): QualityTier {
  if (current) return current;
  try {
    const saved = sessionStorage.getItem(KEY);
    if (saved === "high" || saved === "low") return (current = saved);
  } catch {
    /* stockage indisponible : heuristique */
  }
  return (current = heuristic());
}

export function setQualityTier(tier: QualityTier) {
  current = tier;
  try {
    sessionStorage.setItem(KEY, tier);
  } catch {
    /* au mieux */
  }
}

/** Plafond de DPR de la scène selon le palier (valeurs de la carte des quêtes). */
export function dprCap(tier: QualityTier): number {
  return tier === "low" ? 1.25 : 1.75;
}

/**
 * Lance `cb` à la première interaction (pointeur, clavier, tactile, molette),
 * ou après `timeoutMs` : les runtimes lourds (Rive) ne s'évaluent jamais dans
 * la fenêtre de mesure du chargement. Renvoie une fonction d'annulation.
 */
export function onFirstInteraction(cb: () => void, timeoutMs = 12000): () => void {
  if (typeof window === "undefined") return () => {};
  const events = ["pointerdown", "pointermove", "keydown", "touchstart", "wheel"] as const;
  let timer = 0;
  const fire = () => {
    cleanup();
    cb();
  };
  const cleanup = () => {
    for (const e of events) window.removeEventListener(e, fire);
    window.clearTimeout(timer);
  };
  for (const e of events) window.addEventListener(e, fire, { passive: true });
  timer = window.setTimeout(fire, timeoutMs);
  return cleanup;
}
