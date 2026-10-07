import type { Point } from "@/lib/dungeon/types";
import { ABILITIES, SPELLS, checkCast, weaponForLanguage } from "./abilities";
import { monsterTurn, planIntent } from "./ai";
import { Ctx } from "./engine";
import { DIRECTIONS, STEP, add, directionTo, key, same } from "./grid";
import { featuresFor } from "./features";
import { DUPLICATE_SPELL_HEAL, lootFor } from "./loot";
import { initialMonsters } from "./monsters";
import type { AbilityId, Direction, EntityRef, GameEvent, GameState, MonsterState, SpellId } from "./types";
import { inBounds, index, type World } from "./world";

/**
 * Règles du jeu (GAMEDESIGN.md) : fonctions pures (état, action) → état.
 * Le store ne fait que les appeler ; une partie se rejoue à partir du modèle
 * et de la liste des actions. Zéro hasard en combat.
 */

export type { AbilityId, Direction, EntityRef, GameEvent, GameState } from "./types";
export { STEP } from "./grid";

export const HERO_HP = 30;
export const HERO_PA = 6;
export const HERO_PM = 3;
/** Soin d'une fontaine (commit « fix »). */
export const FOUNTAIN_HEAL = 8;

export type GameAction =
  | { type: "move"; direction: Direction }
  | { type: "cast"; ability: AbilityId; target: Point }
  | { type: "end-turn" }
  /** Répond à un sort en attente : emplacement à remplacer (0 ou 1), ou null pour le laisser. */
  | { type: "equip"; slot: 0 | 1 | null };

export function initGame(world: World): GameState {
  const { spawn, entranceRoomId, repo } = world.model;
  return {
    hero: {
      pos: { ...spawn },
      facing: "south",
      hp: HERO_HP,
      maxHp: HERO_HP,
      atk: 0,
      def: 0,
      weapon: weaponForLanguage(repo.language),
      spells: [null, null],
      statuses: [],
    },
    monsters: initialMonsters(world.model),
    turn: 0,
    status: "exploring",
    combat: null,
    visitedRooms: [entranceRoomId],
    openedChests: [],
    pendingSpell: null,
    foundSecrets: [],
    hasKey: false,
    usedFeatures: [],
    portalReturn: null,
    events: [],
  };
}

// --- Requêtes (pures, pour l'interface) --------------------------------------

export function boss(state: GameState): MonsterState {
  return state.monsters.find((m) => m.archetype === "boss")!;
}

export function bossDefeated(state: GameState): boolean {
  return !boss(state).alive;
}

/** Capacités disponibles : arme, Checkout, puis sorts équipés. */
export function heroAbilities(state: GameState): AbilityId[] {
  return [state.hero.weapon, "checkout", ...state.hero.spells.filter((s): s is NonNullable<typeof s> => s !== null)];
}

/** Entité qui occupe une case (monstre vivant, boss, PNJ, coffre fermé). */
export function occupantAt(world: World, state: GameState, p: Point): EntityRef | null {
  const m = state.monsters.find((x) => x.alive && same(x.pos, p));
  if (m) return m.archetype === "boss" ? { kind: "boss" } : { kind: "monster", id: m.id };
  const model = world.model;
  const npc = model.npcs.find((n) => same(n.pos, p));
  if (npc) return { kind: "npc", id: npc.id };
  const chest = model.chests.find((c) => same(c.pos, p) && !state.openedChests.includes(c.id));
  if (chest) return { kind: "chest", id: chest.id };
  const f = featuresFor(model);
  const feature = f.features.find((x) => same(x.pos, p) && (x.kind === "portal" || !state.usedFeatures.includes(x.id)));
  if (feature) return { kind: "feature", id: feature.id };
  if (f.hallPortal && same(f.hallPortal, p)) return { kind: "hall-portal" };
  return null;
}

/** Case praticable (hors entités) : la porte scellée reste fermée tant que le boss vit. */
export function isPassable(world: World, state: GameState, p: Point): boolean {
  if (!inBounds(world, p) || !world.walkable[index(world, p)]) return false;
  const f = featuresFor(world.model);
  if (f.secrets.some((x) => same(x.door, p) && !state.foundSecrets.includes(x.roomId))) return false;
  if (f.lockedDoor && same(f.lockedDoor, p) && !state.hasKey) return false;
  return bossDefeated(state) || !same(p, world.model.sealedDoor);
}

/** Complétion (GAMEDESIGN.md §3) : salles visitées + secrets trouvés + coffres ouverts, sur le total. */
export function completion(world: World, state: GameState): { done: number; total: number; percent: number } {
  const f = featuresFor(world.model);
  const done = state.visitedRooms.length + state.foundSecrets.length + state.openedChests.length;
  const total = world.model.rooms.length + f.secrets.length + world.model.chests.length;
  return { done, total, percent: total === 0 ? 100 : Math.floor((done / total) * 100) };
}

// --- Action ------------------------------------------------------------------

export function step(world: World, state: GameState, action: GameAction): GameState {
  if (state.status === "won" || state.status === "dead") return { ...state, events: [] };
  const ctx = new Ctx(world, state);
  if (action.type === "equip") {
    equip(ctx, action.slot);
    return ctx.s;
  }
  if (ctx.s.pendingSpell) {
    ctx.emit({ type: "denied", reason: "choose-loot" });
    return ctx.s;
  }
  if (action.type === "move") {
    if (ctx.s.status === "combat") combatMove(ctx, action.direction);
    else exploreMove(ctx, action.direction);
  } else if (action.type === "cast") {
    cast(ctx, action.ability, action.target);
  } else {
    endTurn(ctx);
  }
  return ctx.s;
}

/** Simule un lancer sans le jouer : dégâts, poussées et morts exacts (aperçu avant de cliquer). */
export function previewCast(world: World, state: GameState, ability: AbilityId, target: Point): GameEvent[] {
  return step(world, state, { type: "cast", ability, target }).events;
}

// --- Exploration ---------------------------------------------------------------

function exploreMove(ctx: Ctx, direction: Direction) {
  const { s, world } = ctx;
  const from = { ...s.hero.pos };
  const target = add(from, direction);
  s.hero.facing = direction;

  if (!inBounds(world, target) || !world.walkable[index(world, target)]) return ctx.emit({ type: "blocked" });
  if (!isPassable(world, s, target)) {
    const f = featuresFor(world.model);
    const secret = f.secrets.find((x) => same(x.door, target));
    if (secret && !s.foundSecrets.includes(secret.roomId)) {
      s.foundSecrets = [...s.foundSecrets, secret.roomId].sort((a, b) => a - b);
      return ctx.emit({ type: "secret-found", roomId: secret.roomId, at: { ...target } });
    }
    if (f.lockedDoor && same(f.lockedDoor, target) && !s.hasKey) return ctx.emit({ type: "locked", at: { ...target } });
    return ctx.emit({ type: "sealed" });
  }
  const occupant = occupantAt(world, s, target);
  if (occupant?.kind === "chest") return openChest(ctx, occupant.id);
  if (occupant?.kind === "feature") return activateFeature(ctx, occupant.id);
  if (occupant?.kind === "hall-portal") return takeHallPortal(ctx);
  if (occupant) return ctx.emit({ type: "bump", entity: occupant });

  s.hero.pos = target;
  s.turn += 1;
  ctx.emit({ type: "moved", from, to: { ...target } });

  const fromRoom = world.roomAt[index(world, from)];
  const toRoom = world.roomAt[index(world, target)];
  if (toRoom === -1 || toRoom === fromRoom) return;
  const firstVisit = !s.visitedRooms.includes(toRoom);
  if (firstVisit) s.visitedRooms = [...s.visitedRooms, toRoom].sort((a, b) => a - b);
  ctx.emit({ type: "entered-room", roomId: toRoom, firstVisit });

  if (toRoom === world.model.exitRoomId) {
    s.status = "won";
    ctx.emit({ type: "won" });
    return;
  }
  if (s.monsters.some((m) => m.alive && m.roomId === toRoom)) startCombat(ctx, toRoom);
}

// --- Butin -------------------------------------------------------------------

function openChest(ctx: Ctx, id: number) {
  const { s } = ctx;
  const chest = ctx.world.model.chests[id];
  s.openedChests = [...s.openedChests, id];
  if (featuresFor(ctx.world.model).keyChest === id) {
    s.hasKey = true;
    ctx.emit({ type: "key-found", chest: id });
  }
  const loot = lootFor(chest);
  if (loot.kind === "spell") {
    // Le coffre s'ouvre d'abord : son événement précède l'éventuel « équipé ».
    const at = ctx.events.length;
    const outcome = grantSpell(ctx, loot.spell);
    ctx.events.splice(at, 0, { type: "chest-opened", chest: id, loot, outcome });
    return;
  }
  if (loot.kind === "atk") s.hero.atk += loot.amount;
  else if (loot.kind === "def") s.hero.def += loot.amount;
  else {
    s.hero.maxHp += loot.amount;
    s.hero.hp += loot.amount;
  }
  ctx.emit({ type: "chest-opened", chest: id, loot, outcome: "applied" });
}

/** Range un sort trouvé : emplacement libre, sinon choix en attente ; déjà connu : soin. */
function grantSpell(ctx: Ctx, spell: SpellId): "equipped" | "pending" | "duplicate" {
  const { s } = ctx;
  if (s.hero.spells.includes(spell)) {
    ctx.heal({ kind: "hero" }, DUPLICATE_SPELL_HEAL);
    return "duplicate";
  }
  const free = s.hero.spells.indexOf(null);
  if (free !== -1) {
    s.hero.spells = s.hero.spells.map((x, i) => (i === free ? spell : x));
    ctx.emit({ type: "equipped", spell, slot: free, replaced: null });
    return "equipped";
  }
  s.pendingSpell = spell;
  return "pending";
}

/** Fontaine (fix) : soin unique. Cache (feat) : un sort. Portail (revert) : raccourci vers le hall. */
function activateFeature(ctx: Ctx, id: number) {
  const { s, world } = ctx;
  const f = featuresFor(world.model);
  const feature = f.features[id];
  if (feature.kind === "fountain") {
    s.usedFeatures = [...s.usedFeatures, id];
    const before = s.hero.hp;
    ctx.heal({ kind: "hero" }, FOUNTAIN_HEAL);
    return ctx.emit({ type: "fountain", feature: id, amount: s.hero.hp - before });
  }
  if (feature.kind === "cache") {
    s.usedFeatures = [...s.usedFeatures, id];
    const spell = SPELLS[(feature.roomId * 7 + id * 3) % SPELLS.length];
    const at = ctx.events.length;
    const outcome = grantSpell(ctx, spell);
    ctx.events.splice(at, 0, { type: "cache-opened", feature: id, spell, outcome });
    return;
  }
  // Portail : vers le hall, et retour possible depuis le portail du hall.
  if (!f.hallPortal) return;
  s.portalReturn = id;
  teleport(ctx, f.hallPortal);
}

function takeHallPortal(ctx: Ctx) {
  const { s, world } = ctx;
  const back = s.portalReturn === null ? null : featuresFor(world.model).features[s.portalReturn];
  if (!back) return ctx.emit({ type: "bump", entity: { kind: "hall-portal" } });
  teleport(ctx, back.pos);
}

/** Téléporte le héros sur une case libre de salle, au contact de `near`. */
function teleport(ctx: Ctx, near: Point) {
  const { s, world } = ctx;
  for (const d of DIRECTIONS) {
    const p = add(near, d);
    if (isPassable(world, s, p) && !occupantAt(world, s, p) && world.roomAt[index(world, p)] !== -1) {
      const from = { ...s.hero.pos };
      s.hero.pos = p;
      s.turn += 1;
      return ctx.emit({ type: "teleported", from, to: { ...p } });
    }
  }
}

function equip(ctx: Ctx, slot: 0 | 1 | null) {
  const { s } = ctx;
  const spell = s.pendingSpell;
  if (!spell) return ctx.emit({ type: "denied", reason: "invalid-target" });
  s.pendingSpell = null;
  if (slot === null) return ctx.emit({ type: "loot-discarded", spell });
  const replaced = s.hero.spells[slot] ?? null;
  s.hero.spells = s.hero.spells.map((x, i) => (i === slot ? spell : x));
  ctx.emit({ type: "equipped", spell, slot, replaced });
}

// --- Combat ------------------------------------------------------------------

/** Démarre un combat dans une salle (tests, page debug). Le héros doit s'y trouver. */
export function enterCombat(world: World, state: GameState, roomId: number): GameState {
  const ctx = new Ctx(world, state);
  startCombat(ctx, roomId);
  return ctx.s;
}

function startCombat(ctx: Ctx, roomId: number) {
  ctx.s.status = "combat";
  ctx.s.combat = { roomId, round: 1, pa: HERO_PA, pm: HERO_PM, usedThisTurn: [], usedThisCombat: [], glyphs: [] };
  // Les monstres annoncent leur première intention avant que le héros n'agisse.
  for (const m of initiativeOrder(ctx)) m.intent = planIntent(ctx, m);
  ctx.emit({ type: "combat-start", roomId });
  if (ctx.arenaMonsters().some((m) => m.archetype === "boss")) ctx.emit({ type: "boss-intro" });
  ctx.emit({ type: "turn-start", round: 1 });
}

/** Initiative : la plus vieille issue joue d'abord (numéro croissant), les génériques ensuite. */
function initiativeOrder(ctx: Ctx): MonsterState[] {
  return ctx
    .arenaMonsters()
    .slice()
    .sort((a, b) => (a.issue ?? Infinity) - (b.issue ?? Infinity) || a.id - b.id);
}

function combatMove(ctx: Ctx, direction: Direction) {
  const combat = ctx.s.combat!;
  const from = { ...ctx.s.hero.pos };
  const target = add(from, direction);
  ctx.s.hero.facing = direction;
  if (!ctx.inArena(target)) return ctx.emit({ type: "denied", reason: "arena-sealed" });
  if (!ctx.free(target)) return ctx.emit({ type: "denied", reason: "occupied" });
  const tackle = ctx.tackleAt(from);
  const cost = 1 + tackle;
  if (combat.pm < cost) return ctx.emit({ type: "denied", reason: tackle > 0 && combat.pm > 0 ? "tackled" : "no-pm" });
  combat.pm -= cost;
  ctx.s.hero.pos = target;
  ctx.s.turn += 1;
  ctx.emit({ type: "moved", from, to: { ...target } });
}

function cast(ctx: Ctx, abilityId: AbilityId, target: Point) {
  const combat = ctx.s.combat;
  if (!combat || ctx.s.status !== "combat") return ctx.emit({ type: "denied", reason: "not-your-turn" });
  if (!heroAbilities(ctx.s).includes(abilityId)) return ctx.emit({ type: "denied", reason: "invalid-target" });
  const ability = ABILITIES[abilityId];
  const target2 = ability.target === "self" ? { ...ctx.s.hero.pos } : target;
  const denial = checkCast(ctx, ability, target2);
  if (denial) return ctx.emit({ type: "denied", reason: denial });

  combat.pa -= ability.cost;
  combat.usedThisTurn.push(abilityId);
  combat.usedThisCombat.push(abilityId);
  if (!same(target2, ctx.s.hero.pos)) ctx.s.hero.facing = directionTo(ctx.s.hero.pos, target2);
  ctx.emit({ type: "cast", ability: abilityId, from: { ...ctx.s.hero.pos }, target: target2 });
  ability.apply(ctx, target2);
  settle(ctx);
}

/**
 * Fin de tour, découpée pour l'affichage : un état intermédiaire après chaque
 * monstre (ses seuls événements), puis l'état final. Le dernier état est
 * identique à `step(…, { type: "end-turn" })`, aux événements près (ici : la fin
 * seulement). Permet de jouer le tour ennemi monstre après monstre.
 */
export function endTurnFrames(world: World, state: GameState): GameState[] {
  if (state.status !== "combat") return [step(world, state, { type: "end-turn" })];
  const ctx = new Ctx(world, state);
  const frames: GameState[] = [];
  let cursor = 0;
  const cut = () => {
    if (cursor === ctx.events.length) return; // rien de visible : pas d'étape
    const frame = structuredClone({ ...ctx.s, events: [] }) as GameState;
    frame.events = ctx.events.slice(cursor);
    cursor = ctx.events.length;
    frames.push(frame);
  };
  endTurn(ctx, cut);
  cut();
  if (frames.length === 0) frames.push(structuredClone({ ...ctx.s, events: [] }) as GameState);
  return frames;
}

function endTurn(ctx: Ctx, onMonsterDone?: () => void) {
  const combat = ctx.s.combat;
  if (!combat || ctx.s.status !== "combat") return ctx.emit({ type: "denied", reason: "not-your-turn" });

  // Le tour suivant commence dès maintenant : les intentions annoncées par les monstres
  // pendant leur tour s'exécuteront à ce tour-là (le boss compte ses tours sur ce numéro).
  combat.round += 1;
  for (const m of initiativeOrder(ctx)) {
    monsterTurn(ctx, m.id);
    if (ctx.dead()) return;
    // Glyphe : dégâts à l'ennemi qui finit son tour dans la zone 3×3.
    const mm = ctx.monster(m.id);
    if (mm.alive && combat.glyphs.some((g) => Math.abs(g.at.x - mm.pos.x) <= 1 && Math.abs(g.at.y - mm.pos.y) <= 1)) {
      const dmg = Math.max(...combat.glyphs.filter((g) => Math.abs(g.at.x - mm.pos.x) <= 1 && Math.abs(g.at.y - mm.pos.y) <= 1).map((g) => g.damage));
      ctx.damage({ kind: "monster", id: mm.id }, dmg, "glyph");
    }
    onMonsterDone?.();
  }
  // Les doublons nés pendant ce tour annoncent leur intention.
  for (const m of ctx.arenaMonsters()) if (!m.intent && m.age === 0) m.intent = planIntent(ctx, m);

  combat.glyphs = combat.glyphs.map((g) => ({ ...g, turns: g.turns - 1 })).filter((g) => g.turns > 0);
  combat.pa = HERO_PA;
  combat.pm = HERO_PM;
  combat.usedThisTurn = [];
  if (settle(ctx)) return;
  ctx.emit({ type: "turn-start", round: combat.round });
}

/** Fin de combat si l'arène est vide. Renvoie vrai si le combat est terminé. */
function settle(ctx: Ctx): boolean {
  if (ctx.s.status !== "combat") return true;
  if (ctx.arenaMonsters().length > 0) return false;
  const roomId = ctx.s.combat!.roomId;
  ctx.s.combat = null;
  ctx.s.status = "exploring";
  ctx.emit({ type: "combat-won", roomId });
  return true;
}

// --- Déplacements multi-cases ----------------------------------------------------

/**
 * Exploration : plus court chemin (BFS) vers `goal`, en évitant les entités. Si
 * `goal` est occupé, le chemin s'arrête au contact (la dernière direction heurte).
 */
export function findPath(world: World, state: GameState, goal: Point): Direction[] | null {
  const start = state.hero.pos;
  if (same(start, goal)) return [];
  if (!isPassable(world, state, goal)) return null;
  const goalIdx = index(world, goal);
  const prev = new Int32Array(world.width * world.height).fill(-1);
  const prevDir = new Int8Array(world.width * world.height);
  const startIdx = index(world, start);
  prev[startIdx] = startIdx;
  const queue: Point[] = [start];
  for (let head = 0; head < queue.length; head++) {
    const p = queue[head];
    for (let k = 0; k < DIRECTIONS.length; k++) {
      const q = add(p, DIRECTIONS[k]);
      if (!inBounds(world, q)) continue;
      const qi = index(world, q);
      if (prev[qi] !== -1 || !isPassable(world, state, q)) continue;
      if (qi !== goalIdx && occupantAt(world, state, q)) continue;
      prev[qi] = index(world, p);
      prevDir[qi] = k;
      if (qi === goalIdx) {
        const path: Direction[] = [];
        for (let i = qi; i !== startIdx; i = prev[i]) path.push(DIRECTIONS[prevDir[i]]);
        return path.reverse();
      }
      queue.push(q);
    }
  }
  return null;
}

/**
 * Combat : cases atteignables avec les PM restants, tacle compris (quitter une
 * case au contact d'ennemis coûte plus). Renvoie coût et chemin par case.
 */
export function reachableInCombat(world: World, state: GameState): Map<string, { cost: number; path: Direction[] }> {
  const out = new Map<string, { cost: number; path: Direction[] }>();
  if (state.status !== "combat" || !state.combat) return out;
  const ctx = new Ctx(world, state);
  const budget = state.combat.pm;
  const start = state.hero.pos;
  out.set(key(start), { cost: 0, path: [] });
  // Dijkstra sur une petite grille : file triée à chaque extraction (≤ 121 cases).
  const open: { p: Point; cost: number; path: Direction[] }[] = [{ p: start, cost: 0, path: [] }];
  while (open.length > 0) {
    open.sort((a, b) => a.cost - b.cost || a.p.y - b.p.y || a.p.x - b.p.x);
    const cur = open.shift()!;
    // Le héros « part » de cur.p : on simule sa position pour le calcul du tacle.
    ctx.s.hero.pos = cur.p;
    const leave = 1 + ctx.tackleAt(cur.p);
    for (const d of DIRECTIONS) {
      const q = add(cur.p, d);
      const cost = cur.cost + leave;
      if (cost > budget || !ctx.inArena(q) || ctx.propAt(q)) continue;
      const unit = ctx.unitAt(q);
      if (unit && unit.kind !== "hero") continue;
      const k = key(q);
      const known = out.get(k);
      if (known && known.cost <= cost) continue;
      const entry = { cost, path: [...cur.path, d] };
      out.set(k, entry);
      open.push({ p: q, ...entry });
    }
  }
  return out;
}

/** Utilitaire pour l'interface : la direction unitaire d'un pas. */
export function stepOf(direction: Direction): Point {
  return STEP[direction];
}
