import { ACCENT, BG, CONTRAST, ISSUE_COLORS, PARCHMENT, RARITY_COLOR } from "@/lib/theme";

/**
 * Couleurs de la scène 3D, dérivées de la DA (src/lib/theme.ts). Pierre
 * violacée saturée « façon Pixar » (style des modèles Blender du portfolio),
 * lime pour tout ce qui est au joueur, palettes issue/rareté du portfolio.
 */
export const SCENE_PALETTE = {
  background: BG.primary,
  floor: "#433b5c",
  corridor: "#4a4266",
  wall: "#6a5f8f",
  door: "#c48a4c",
  /** Sol de la salle HEAD : l'olive du parchemin, la sortie se repère de loin. */
  headFloor: PARCHMENT.olive,
  /** Porte scellée : violet d'issue, « Quête scellée ». */
  sealed: ISSUE_COLORS[3],
  hero: ACCENT,
  /** Torche du héros : chaude, en contrepoint du violet. */
  heroLight: "#ffb54d",
  boss: "#E8384F",
  todoMonster: "#a1a1aa",
  npc: CONTRAST,
  rarity: RARITY_COLOR,
  /** Facteur appliqué aux cases jamais révélées : on devine la carte sans la voir. */
  fog: 0.045,
} as const;

/** Couleur des cristaux selon le langage dominant (recherche visuelle, GAMEDESIGN.md §5). */
export const LANGUAGE_CRYSTAL: Record<string, string> = {
  TypeScript: "#3FA9F5",
  JavaScript: "#F7DF1E",
  Python: "#4B8BBE",
  Rust: "#DEA584",
  Go: "#00ADD8",
};
export const DEFAULT_CRYSTAL = "#C77DFF";
