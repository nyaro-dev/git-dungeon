"use client";

import { useGLTF } from "@react-three/drei";
import { useMemo } from "react";
import type { BufferGeometry } from "three";
import { bake } from "./kit";

/** Personnages chibi produits par scripts/blender/dungeon-kit/characters.py (pnpm kit:chars). */
export const CHARACTERS_URL = "/models/characters.glb";

/** Hauteur du cou du héros : pivot de sa tête (= HERO_NECK de characters.py). */
export const HERO_NECK = 0.34;

const PARTS = [
  "C_hero",
  "C_hero_head",
  "C_slime",
  "C_slime_face",
  "C_bug",
  "C_bug_face",
  "C_creep",
  "C_creep_face",
  "C_sphinx",
  "C_sphinx_face",
  "C_goblin",
  "C_goblin_face",
  "C_boss",
  "C_boss_face",
  "C_boss_glow",
  "C_npc",
] as const;
export type CharacterPart = (typeof PARTS)[number];

/**
 * Géométries des personnages (suspend tant que le GLB charge). Les corps des
 * monstres sont en niveaux de gris : le matériau les teinte de la couleur de
 * l'issue ; les parties `_face` gardent leurs couleurs.
 */
export function useCharacters(): Record<CharacterPart, BufferGeometry> {
  const { nodes } = useGLTF(CHARACTERS_URL);
  return useMemo(() => {
    const out = {} as Record<CharacterPart, BufferGeometry>;
    for (const name of PARTS) {
      const node = nodes[name];
      if (!node) throw new Error(`characters.glb : partie ${name} manquante`);
      out[name] = bake(node);
    }
    return out;
  }, [nodes]);
}

useGLTF.preload(CHARACTERS_URL);
