import type { Point } from "@/lib/dungeon/types";
import type { Loot } from "./loot";

/**
 * État d'une partie (GAMEDESIGN.md). Sérialisable, immuable : chaque règle
 * renvoie un nouvel état. Aucune source d'aléa en combat.
 */

export type Direction = "north" | "east" | "south" | "west";

export type WeaponId = "promise-whip" | "serpent-bite" | "borrow-hammer" | "goroutines" | "pointer" | "staff";
export type SpellId = "scroll" | "config-glyph" | "script" | "flash";
export type AbilityId = WeaponId | SpellId | "checkout";

export type Archetype = "slime" | "bug" | "feature-creep" | "sphinx" | "goblin" | "boss";

/**
 * Intention annoncée d'un ennemi, exécutée au début de son prochain tour.
 * - `strike` : frappe une case relative à l'ennemi (esquivable : si on le pousse, l'attaque suit).
 * - `shoot`  : vise le héros s'il est à portée et en ligne de vue au moment de tirer.
 * - `charge` : fonce en ligne droite dans `dir` jusqu'à un obstacle, frappe ce qu'il heurte.
 * - `reproduce` : se duplique sur une case voisine libre.
 */
export type Intent =
  | { kind: "strike"; dir: Direction; damage: number }
  | { kind: "shoot"; damage: number; range: [number, number] }
  | { kind: "charge"; dir: Direction; damage: number }
  | { kind: "reproduce" }
  // Boss
  | { kind: "sweep"; dir: Direction; damage: number; length: number }
  | { kind: "summon" }
  | { kind: "comments"; cells: Point[]; damage: number };

export type Status = { kind: "poison"; damage: number; turns: number } | { kind: "stunned"; turns: number };

export type MonsterState = {
  /** Index dans `model.monsters` ; les doublons (Bug) ont des ids au-delà. */
  id: number;
  archetype: Archetype;
  /** Numéro d'issue (initiative : le plus ancien joue d'abord) ; null pour un monstre générique. */
  issue: number | null;
  roomId: number;
  pos: Point;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  pm: number;
  alive: boolean;
  intent: Intent | null;
  /** Tours vécus en combat (Bug : se duplique au 3e). */
  age: number;
  /** Boss : phase courante (1 « Triage », 2 « Discussion »). */
  phase?: number;
  statuses: Status[];
};

export type HeroState = {
  pos: Point;
  facing: Direction;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  weapon: WeaponId;
  /** Emplacements de sorts 3 et 4. */
  spells: (SpellId | null)[];
  statuses: Status[];
};

export type Glyph = { at: Point; damage: number; turns: number };

export type CombatState = {
  roomId: number;
  round: number;
  pa: number;
  pm: number;
  /** Capacités limitées déjà utilisées ce tour (`checkout`) ou ce combat (`scroll`). */
  usedThisTurn: AbilityId[];
  usedThisCombat: AbilityId[];
  glyphs: Glyph[];
};

export type EntityRef =
  | { kind: "npc"; id: number }
  | { kind: "chest"; id: number }
  | { kind: "monster"; id: number }
  | { kind: "boss" }
  /** Élément de commit (fontaine, portail, cache) : index dans featuresFor(model).features. */
  | { kind: "feature"; id: number }
  | { kind: "hall-portal" };

/** Cible d'un effet : le héros ou un monstre (le boss est un monstre d'archétype « boss »). */
export type UnitRef = { kind: "hero" } | { kind: "monster"; id: number };

export type GameEvent =
  // Exploration
  | { type: "moved"; from: Point; to: Point }
  | { type: "blocked" }
  | { type: "sealed" }
  | { type: "bump"; entity: EntityRef }
  | { type: "entered-room"; roomId: number; firstVisit: boolean }
  | { type: "won" }
  // Combat
  | { type: "combat-start"; roomId: number }
  | { type: "combat-won"; roomId: number }
  | { type: "hero-dead" }
  | { type: "turn-start"; round: number }
  | { type: "cast"; ability: AbilityId; from: Point; target: Point }
  | { type: "damage"; unit: UnitRef; amount: number; at: Point; source: "attack" | "wall" | "collision" | "poison" | "glyph" }
  | { type: "heal"; unit: UnitRef; amount: number; at: Point }
  | { type: "pushed"; unit: UnitRef; from: Point; to: Point }
  | { type: "walked"; unit: UnitRef; from: Point; to: Point }
  | { type: "killed"; unit: UnitRef; at: Point; issue: number | null }
  | { type: "whiff"; monster: number; at: Point }
  | { type: "intent-cancelled"; monster: number }
  | { type: "spawned"; monster: number; at: Point }
  | { type: "jumped"; from: Point; to: Point }
  | { type: "stunned"; monster: number; at: Point }
  | { type: "boss-intro" }
  | { type: "boss-phase"; phase: number }
  // Butin
  | { type: "chest-opened"; chest: number; loot: Loot; outcome: "equipped" | "pending" | "duplicate" | "applied" }
  | { type: "equipped"; spell: SpellId; slot: number; replaced: SpellId | null }
  | { type: "loot-discarded"; spell: SpellId }
  // Exploration
  | { type: "secret-found"; roomId: number; at: Point }
  | { type: "locked"; at: Point }
  | { type: "key-found"; chest: number }
  | { type: "fountain"; feature: number; amount: number }
  | { type: "teleported"; from: Point; to: Point }
  | { type: "cache-opened"; feature: number; spell: SpellId; outcome: "equipped" | "pending" | "duplicate" }
  // Refus (rien ne se passe, l'interface explique pourquoi)
  | { type: "denied"; reason: "no-pa" | "no-pm" | "tackled" | "out-of-range" | "no-line-of-sight" | "occupied" | "arena-sealed" | "once-per-turn" | "once-per-combat" | "not-your-turn" | "invalid-target" | "choose-loot" };

export type GameStatus = "exploring" | "combat" | "won" | "dead";

export type GameState = {
  hero: HeroState;
  monsters: MonsterState[];
  /** Pas joués (exploration et combat confondus) : score et statistiques. */
  turn: number;
  status: GameStatus;
  combat: CombatState | null;
  visitedRooms: number[];
  openedChests: number[];
  /** Sort trouvé alors que les deux emplacements sont pleins : le joueur doit choisir. */
  pendingSpell: SpellId | null;
  /** Salles secrètes découvertes (ids). */
  foundSecrets: number[];
  hasKey: boolean;
  /** Éléments de commit déjà utilisés (fontaine, cache). */
  usedFeatures: number[];
  /** Portail par lequel on est arrivé au hall (pour y revenir). */
  portalReturn: number | null;
  events: GameEvent[];
};
