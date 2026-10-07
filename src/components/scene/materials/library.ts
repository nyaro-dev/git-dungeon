import type { Material } from "three";
import { ACCENT } from "@/lib/theme";
import { createFlameMaterial, createToonMaterial } from "./toon";

/**
 * Matériaux partagés de la scène, créés une fois (un programme par variante).
 * Hors composants React : ce sont des ressources GPU, pas de l'état d'interface.
 */
let cache: ReturnType<typeof build> | null = null;

function build() {
  return {
    /** Dalles, rebords, ponts, portes : albédo du kit, bruit peint. */
    kit: createToonMaterial({ vertexColors: true, noise: true, rimStrength: 0.25 }),
    /** Îles : dégradé vertical vers l'ombre, brouillard par salle. */
    island: createToonMaterial({ vertexColors: true, noise: true, gradient: [-3.5, -0.2], reveal: true, rimStrength: 0.2 }),
    /** Herbe : vent, double face. */
    grass: createToonMaterial({ vertexColors: true, wind: 0.06, doubleSide: true, rimStrength: 0 }),
    /** Props teintés par instance (cristaux) : émissif léger pour le bloom. */
    crystal: createToonMaterial({ vertexColors: true, rim: "#ffffff", rimStrength: 0.6 }),
    /** Héros : couleurs du modèle, rim lime (sa couleur signature). */
    hero: createToonMaterial({ vertexColors: true, rim: ACCENT, rimStrength: 0.7 }),
    /** Personnages non teintés (PNJ, yeux et accessoires des monstres). */
    character: createToonMaterial({ vertexColors: true, rim: "#B8F0FF", rimStrength: 0.4 }),
    /** Flammes des torches : au-delà de 1, captées par le bloom. */
    flame: createFlameMaterial("#FFB347", 3.2),
    /** Eau des fontaines (commit « fix ») et cœur des portails (commit « revert »). */
    water: createFlameMaterial("#3FD8F5", 1.6),
    portalCore: createFlameMaterial(ACCENT, 1.8),
  } satisfies Record<string, Material>;
}

export function sceneMaterials() {
  cache ??= build();
  return cache;
}
