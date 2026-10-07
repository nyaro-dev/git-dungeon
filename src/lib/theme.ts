/**
 * DA de Git Dungeon, alignée sur le portfolio (D:\Works\perso\portfolio :
 * globals.css, project-meta.ts, quests.ts, profile-ui.tsx).
 *
 * Source unique côté TypeScript : jamais d'hexadécimal en dur ailleurs. Les
 * mêmes valeurs existent en variables CSS dans globals.css ; tests/theme.test.ts
 * vérifie que les deux ne divergent pas.
 */

/** Accent du site (actions, valeurs vivantes). */
export const ACCENT = "#C3FB03";
export const ACCENT_HOVER = "#CFFC35";
/** Teinte de contraste (bleu de /character), qui fait ressortir le lime. */
export const CONTRAST = "#2F89F4";

export const BG = {
  primary: "#0a0a0f",
  secondary: "#12121a",
  card: "#141420",
} as const;

export const TEXT = {
  primary: "#e4e4e7",
  secondary: "#a1a1aa",
  muted: "#71717a",
} as const;

/** Couleurs « issue » du portfolio (project-meta.ts) : une par monstre, selon son numéro d'issue. */
export const ISSUE_COLORS = [
  "#FF4F8B",
  "#3A6BFF",
  "#FF7A1A",
  "#8B5CF6",
  "#10C9A0",
  "#E8384F",
  "#19B8E6",
  "#FFB020",
  "#D946EF",
  "#4CC45A",
] as const;

export function issueColor(issueNumber: number): string {
  return ISSUE_COLORS[((issueNumber % ISSUE_COLORS.length) + ISSUE_COLORS.length) % ISSUE_COLORS.length];
}

/** Rareté (quests.ts du portfolio) ; « common » est le parchemin. */
export const RARITY_COLOR = {
  legendary: "#E6B450",
  epic: "#9B6BD4",
  rare: "#4FA3D1",
  common: "#d6c7a4",
} as const;

export const RARITY_LABEL = {
  legendary: "Légendaire",
  epic: "Épique",
  rare: "Rare",
  common: "Commun",
} as const;

/** Parchemin et encre de la carte des quêtes (.qm-hud). */
export const PARCHMENT = {
  paper: "#f2ead8",
  paper2: "#e6dbc1",
  paper3: "#d6c7a4",
  ink: "#2e2820",
  ink2: "#5d5446",
  ink3: "#8a7f6c",
  olive: "#5c7a05",
} as const;
