import type { Chest } from "@/lib/dungeon/types";
import type { SpellId } from "./types";

/**
 * Butin d'un coffre (GAMEDESIGN.md §2 « Sorts trouvés dans les coffres ») :
 * l'extension du fichier choisit la récompense, sa rareté (taille) la module.
 * Pur et déterministe.
 */
export type Loot =
  | { kind: "spell"; spell: SpellId }
  | { kind: "atk"; amount: number }
  | { kind: "def"; amount: number }
  | { kind: "hp"; amount: number };

const SPELL_BY_EXT: Record<string, SpellId> = {
  md: "scroll",
  mdx: "scroll",
  txt: "scroll",
  rst: "scroll",
  json: "config-glyph",
  yml: "config-glyph",
  yaml: "config-glyph",
  toml: "config-glyph",
  ini: "config-glyph",
  sh: "script",
  bash: "script",
  ps1: "script",
  mjs: "script",
  cjs: "script",
  png: "flash",
  jpg: "flash",
  jpeg: "flash",
  gif: "flash",
  webp: "flash",
  svg: "flash",
  ico: "flash",
};
const SCRIPT_NAMES = new Set(["makefile", "dockerfile", "justfile"]);
const CODE = new Set(["ts", "tsx", "js", "jsx", "py", "rs", "go", "c", "cc", "cpp", "h", "hpp", "java", "kt", "rb", "php", "cs", "swift", "vue", "svelte"]);
const STYLE = new Set(["css", "scss", "sass", "less", "styl"]);

const BONUS: Record<Chest["rarity"], number> = { common: 1, rare: 1, epic: 2, legendary: 3 };

export function lootFor(chest: Pick<Chest, "file" | "rarity">): Loot {
  const name = chest.file.slice(chest.file.lastIndexOf("/") + 1).toLowerCase();
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1) : "";
  if (SCRIPT_NAMES.has(name)) return { kind: "spell", spell: "script" };
  if (ext in SPELL_BY_EXT) return { kind: "spell", spell: SPELL_BY_EXT[ext] };
  if (CODE.has(ext)) return { kind: "atk", amount: BONUS[chest.rarity] };
  if (STYLE.has(ext)) return { kind: "def", amount: BONUS[chest.rarity] };
  return { kind: "hp", amount: 3 + 2 * BONUS[chest.rarity] };
}

/** Soin accordé quand on trouve un sort déjà possédé. */
export const DUPLICATE_SPELL_HEAL = 8;
