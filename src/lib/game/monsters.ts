import type { DungeonModel, IssueRef } from "@/lib/dungeon/types";
import type { Archetype, MonsterState } from "./types";

/**
 * Archétypes de monstres (GAMEDESIGN.md §2). L'archétype se déduit des labels
 * de l'issue côté jeu : le générateur n'a pas à changer.
 */
export type ArchetypeDef = {
  name: string;
  hp: number;
  pm: number;
  atk: number;
  def: number;
  /** Tacle : PM supplémentaire(s) pour quitter son contact. */
  tackle: number;
  /** Puissance de l'attaque de base. */
  power: number;
  behavior: "melee" | "ranged" | "charger";
  /** Ligne d'aide pour le HUD. */
  blurb: string;
};

export const ARCHETYPES: Record<Archetype, ArchetypeDef> = {
  slime: { name: "Slime", hp: 4, pm: 2, atk: 0, def: 0, tackle: 1, power: 2, behavior: "melee", blurb: "Bon premier ennemi. Lâche un double butin." },
  bug: { name: "Bug", hp: 6, pm: 3, atk: 0, def: 0, tackle: 1, power: 3, behavior: "melee", blurb: "Se reproduit s'il survit trois tours." },
  "feature-creep": {
    name: "Feature Creep",
    hp: 14,
    pm: 1,
    atk: 0,
    def: 0,
    tackle: 1,
    power: 4,
    behavior: "charger",
    blurb: "Charge en ligne droite. Prend +1 ATK à chaque tour.",
  },
  sphinx: { name: "Sphinx", hp: 7, pm: 2, atk: 0, def: 0, tackle: 0, power: 3, behavior: "ranged", blurb: "Tire de loin s'il te voit. Fuit le contact." },
  goblin: { name: "Goblin", hp: 10, pm: 2, atk: 0, def: 0, tackle: 1, power: 4, behavior: "melee", blurb: "Frappe fort au contact." },
  boss: { name: "Boss", hp: 40, pm: 2, atk: 0, def: 1, tackle: 2, power: 6, behavior: "melee", blurb: "La plus vieille issue ouverte." },
};

/** Portée du tir du Sphinx. */
export const SPHINX_RANGE: [number, number] = [2, 5];
/** Le Bug se reproduit à ce tour de vie. */
export const BUG_REPRODUCE_AGE = 3;

export function archetypeFor(issue: IssueRef | null): Archetype {
  if (!issue) return "slime"; // TODO génériques d'un donjon calme
  const labels = issue.labels.map((l) => l.toLowerCase());
  const has = (...words: string[]) => labels.some((l) => words.some((w) => l.includes(w)));
  if (has("good first issue", "good-first-issue", "beginner", "easy")) return "slime";
  if (has("bug", "crash", "regression")) return "bug";
  if (has("enhancement", "feature", "proposal")) return "feature-creep";
  if (has("question", "help", "support", "discussion")) return "sphinx";
  return "goblin";
}

export function bossMaxHp(comments: number): number {
  return 40 + 3 * Math.min(comments, 20);
}

/** Monstres initiaux d'une partie : ceux du modèle, plus le boss (id = nombre de monstres). */
export function initialMonsters(model: DungeonModel): MonsterState[] {
  const roomAt = (x: number, y: number) =>
    model.rooms.find((r) => x >= r.rect.x && x < r.rect.x + r.rect.w && y >= r.rect.y && y < r.rect.y + r.rect.h)?.id ?? -1;

  const monsters: MonsterState[] = model.monsters.map((m, id) => {
    const archetype = archetypeFor(m.issue);
    const def = ARCHETYPES[archetype];
    // +1 PV par tranche de 5 commentaires, plafonné : les issues très discutées sont plus coriaces.
    const bonus = m.issue ? Math.min(6, Math.floor(m.issue.comments / 5)) : 0;
    return {
      id,
      archetype,
      issue: m.issue?.number ?? null,
      roomId: m.roomId,
      pos: { ...m.pos },
      hp: def.hp + bonus,
      maxHp: def.hp + bonus,
      atk: def.atk,
      def: def.def,
      pm: def.pm,
      alive: true,
      intent: null,
      age: 0,
      statuses: [],
    };
  });

  const boss = ARCHETYPES.boss;
  const hp = bossMaxHp(model.boss.issue?.comments ?? 0);
  monsters.push({
    id: monsters.length,
    archetype: "boss",
    issue: model.boss.issue?.number ?? null,
    roomId: model.boss.roomId ?? roomAt(model.boss.pos.x, model.boss.pos.y),
    pos: { ...model.boss.pos },
    hp,
    maxHp: hp,
    atk: boss.atk,
    def: boss.def,
    pm: boss.pm,
    alive: true,
    intent: null,
    age: 0,
    statuses: [],
  });
  return monsters;
}
