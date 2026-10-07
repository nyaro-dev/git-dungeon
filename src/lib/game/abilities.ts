import type { Point } from "@/lib/dungeon/types";
import { Ctx, computeDamage } from "./engine";
import { aligned, directionTo, manhattan, OPPOSITE } from "./grid";
import type { AbilityId, SpellId, WeaponId } from "./types";

/**
 * Capacités du héros (GAMEDESIGN.md §2). Données + effet ; la validation
 * commune (PA, portée, ligne de vue, limites) est dans `checkCast`.
 */
export type AbilityDef = {
  id: AbilityId;
  name: string;
  /** Coût en PA. */
  cost: number;
  range: [number, number];
  /** Cible sur la même ligne ou colonne uniquement. */
  line?: boolean;
  /** Ignore la ligne de vue. */
  ignoresLos?: boolean;
  /** Ce qu'on vise : un ennemi, une case libre, une case quelconque, soi-même. */
  target: "enemy" | "free-cell" | "cell" | "self";
  perTurn?: number;
  perCombat?: number;
  /** Dégâts de base (avant ATK du héros et DEF de la cible), pour l'aperçu. */
  power?: number;
  description: string;
  apply: (ctx: Ctx, target: Point) => void;
};

const hitMonster = (ctx: Ctx, target: Point, power: number, hits = 1) => {
  const u = ctx.unitAt(target);
  if (u?.kind !== "monster") return;
  for (let i = 0; i < hits && ctx.alive(u); i++) {
    ctx.damage(u, computeDamage(power, ctx.s.hero.atk, ctx.monster(u.id).def), "attack");
  }
};

export const ABILITIES: Record<AbilityId, AbilityDef> = {
  // --- Armes (selon le langage dominant) ---
  "promise-whip": {
    id: "promise-whip",
    name: "Fouet de Promesses",
    cost: 3,
    range: [1, 3],
    line: true,
    target: "enemy",
    power: 4,
    description: "4 dégâts, attire la cible d'une case.",
    apply(ctx, target) {
      const u = ctx.unitAt(target);
      hitMonster(ctx, target, 4);
      if (u?.kind === "monster" && ctx.alive(u)) ctx.pull(u, ctx.s.hero.pos, 1, OPPOSITE[directionTo(ctx.s.hero.pos, target)]);
    },
  },
  "serpent-bite": {
    id: "serpent-bite",
    name: "Morsure du Serpent",
    cost: 3,
    range: [2, 4],
    target: "enemy",
    power: 3,
    description: "3 dégâts, puis poison 2 par tour pendant 2 tours.",
    apply(ctx, target) {
      const u = ctx.unitAt(target);
      hitMonster(ctx, target, 3);
      if (u?.kind === "monster" && ctx.alive(u)) ctx.monster(u.id).statuses.push({ kind: "poison", damage: 2, turns: 2 });
    },
  },
  "borrow-hammer": {
    id: "borrow-hammer",
    name: "Marteau Borrow",
    cost: 4,
    range: [1, 1],
    target: "enemy",
    power: 7,
    description: "7 dégâts au contact, repousse de 2 cases.",
    apply(ctx, target) {
      const u = ctx.unitAt(target);
      hitMonster(ctx, target, 7);
      if (u?.kind === "monster" && ctx.alive(u)) ctx.push(u, directionTo(ctx.s.hero.pos, target), 2);
    },
  },
  goroutines: {
    id: "goroutines",
    name: "Goroutines",
    cost: 2,
    range: [1, 2],
    target: "enemy",
    power: 2,
    description: "Deux frappes de 2 dégâts.",
    apply(ctx, target) {
      hitMonster(ctx, target, 2, 2);
    },
  },
  pointer: {
    id: "pointer",
    name: "Pointeur",
    cost: 3,
    range: [2, 6],
    line: true,
    ignoresLos: true,
    target: "enemy",
    power: 5,
    description: "5 dégâts à travers tout, mais 1 dégât pour toi.",
    apply(ctx, target) {
      hitMonster(ctx, target, 5);
      ctx.damage({ kind: "hero" }, 1, "attack");
    },
  },
  staff: {
    id: "staff",
    name: "Bâton générique",
    cost: 3,
    range: [1, 2],
    target: "enemy",
    power: 4,
    description: "4 dégâts.",
    apply(ctx, target) {
      hitMonster(ctx, target, 4);
    },
  },

  // --- Mobilité (fixe) ---
  checkout: {
    id: "checkout",
    name: "Checkout",
    cost: 2,
    range: [1, 2],
    ignoresLos: true,
    target: "free-cell",
    perTurn: 1,
    description: "Saute jusqu'à 2 cases, sans être taclé. Une fois par tour.",
    apply(ctx, target) {
      const from = { ...ctx.s.hero.pos };
      ctx.s.hero.pos = { ...target };
      ctx.s.hero.facing = directionTo(from, target);
      ctx.emit({ type: "jumped", from, to: { ...target } });
    },
  },

  // --- Sorts trouvés dans les coffres (lot C) ---
  scroll: {
    id: "scroll",
    name: "Parchemin",
    cost: 3,
    range: [0, 0],
    target: "self",
    perCombat: 1,
    description: "Soigne 8 PV. Une fois par combat.",
    apply(ctx) {
      ctx.heal({ kind: "hero" }, 8);
    },
  },
  "config-glyph": {
    id: "config-glyph",
    name: "Glyphe de config",
    cost: 2,
    range: [1, 4],
    target: "cell",
    power: 4,
    description: "Zone 3×3 : 4 dégâts à tout ennemi qui y finit son tour (2 tours).",
    apply(ctx, target) {
      ctx.s.combat?.glyphs.push({ at: { ...target }, damage: 4, turns: 2 });
    },
  },
  script: {
    id: "script",
    name: "Script",
    cost: 2,
    range: [1, 3],
    line: true,
    target: "enemy",
    description: "Repousse de 3 cases. Contre un mur, ça fait très mal.",
    apply(ctx, target) {
      const u = ctx.unitAt(target);
      if (u?.kind === "monster") ctx.push(u, directionTo(ctx.s.hero.pos, target), 3);
    },
  },
  flash: {
    id: "flash",
    name: "Flash",
    cost: 2,
    range: [1, 5],
    target: "enemy",
    description: "Annule l'intention d'un ennemi.",
    apply(ctx, target) {
      const u = ctx.unitAt(target);
      if (u?.kind !== "monster") return;
      const m = ctx.monster(u.id);
      if (m.intent) {
        m.intent = null;
        ctx.emit({ type: "intent-cancelled", monster: m.id });
      }
    },
  },
};

export const SPELLS: SpellId[] = ["scroll", "config-glyph", "script", "flash"];

export function weaponForLanguage(language: string | null): WeaponId {
  switch (language) {
    case "TypeScript":
    case "JavaScript":
      return "promise-whip";
    case "Python":
      return "serpent-bite";
    case "Rust":
      return "borrow-hammer";
    case "Go":
      return "goroutines";
    case "C":
    case "C++":
      return "pointer";
    default:
      return "staff";
  }
}

export type CastDenial = "no-pa" | "out-of-range" | "no-line-of-sight" | "occupied" | "invalid-target" | "once-per-turn" | "once-per-combat" | "not-your-turn";

/** Validation commune d'un lancer ; null si le lancer est permis. */
export function checkCast(ctx: Ctx, ability: AbilityDef, target: Point): CastDenial | null {
  const combat = ctx.s.combat;
  if (!combat || ctx.s.status !== "combat") return "not-your-turn";
  if (ability.perTurn && combat.usedThisTurn.filter((a) => a === ability.id).length >= ability.perTurn) return "once-per-turn";
  if (ability.perCombat && combat.usedThisCombat.filter((a) => a === ability.id).length >= ability.perCombat) return "once-per-combat";
  if (combat.pa < ability.cost) return "no-pa";

  const hero = ctx.s.hero.pos;
  if (ability.target === "self") return null;
  const d = manhattan(hero, target);
  if (!ctx.inArena(target)) return "invalid-target";
  if (d < ability.range[0] || d > ability.range[1]) return "out-of-range";
  if (ability.line && !aligned(hero, target)) return "out-of-range";
  if (!ability.ignoresLos && !ctx.lineOfSight(hero, target)) return "no-line-of-sight";
  const unit = ctx.unitAt(target);
  if (ability.target === "enemy" && unit?.kind !== "monster") return "invalid-target";
  if (ability.target === "free-cell" && !ctx.free(target)) return "occupied";
  return null;
}
