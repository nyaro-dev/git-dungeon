"use client";

import { useThree } from "@react-three/fiber";
import { useEffect, useState } from "react";

/**
 * À placer DANS le <Canvas> qui reçoit `frameloop` de useVisibleFrameloop.
 *
 * R3F arrête sa boucle globale quand plus aucune racine ne demande de frame
 * (frameloop "never") et ne la relance pas quand `frameloop` repasse à
 * "always" : il faut un invalidate(). Sans lui, la scène reste figée et,
 * le tampon n'étant pas préservé, l'écran devient noir à la recomposition
 * (onglet masqué puis réaffiché, scène sortie puis revenue à l'écran).
 */
export function FrameloopKick({ frameloop }: { frameloop: "always" | "never" }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (frameloop === "always") invalidate();
  }, [frameloop, invalidate]);
  return null;
}

/**
 * Met en pause la boucle de rendu quand personne ne la voit : onglet caché
 * (visibilitychange) ou canvas hors écran (IntersectionObserver). Repris du
 * portfolio (src/components/three/canvas-utils.tsx). La scène s'anime en
 * continu (vie ambiante), donc pas de "demand" : "always" si visible, "never" sinon.
 * Renvoie une ref callback pour le conteneur et la valeur de `frameloop`.
 */
export function useVisibleFrameloop() {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [tabVisible, setTabVisible] = useState(
    () => typeof document === "undefined" || document.visibilityState !== "hidden",
  );
  const [onScreen, setOnScreen] = useState(true);

  useEffect(() => {
    const onChange = () => setTabVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  useEffect(() => {
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      const e = entries[entries.length - 1];
      if (e) setOnScreen(e.isIntersecting);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [el]);

  return { ref: setEl, frameloop: tabVisible && onScreen ? ("always" as const) : ("never" as const) };
}
