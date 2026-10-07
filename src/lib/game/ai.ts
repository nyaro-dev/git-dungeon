import type { Point } from "@/lib/dungeon/types";
import { Ctx, computeDamage } from "./engine";
import { DIRECTIONS, add, aligned, directionTo, key, manhattan, same } from "./grid";
import { ARCHETYPES, BUG_REPRODUCE_AGE, SPHINX_RANGE } from "./monsters";
import type { Intent, MonsterState } from "./types";

/**
 * Tour d'un monstre (GAMEDESIGN.md §2), déterministe :
 *   1. effets de début de tour (poison) ;
 *   2. exécution de l'intention annoncée au tour précédent ;
 *   3. déplacement selon son comportement ;
 *   4. annonce de sa prochaine intention (visible par le joueur).
 */
export function monsterTurn(ctx: Ctx, id: number) {
  const m = ctx.monster(id);
  if (!m.alive) return;
  m.age += 1;

  const stunned = m.statuses.some((st) => st.kind === "stunned");
  tickStatuses(ctx, m);
  if (!m.alive || ctx.dead()) return;
  // Étourdi (poussé contre un pilier LGTM) : ne frappe ni ne bouge ce tour, puis réannonce.
  if (stunned) {
    m.intent = planIntent(ctx, m);
    return;
  }

  if (m.intent) resolveIntent(ctx, m);
  if (!m.alive || ctx.dead()) return;

  if (m.archetype === "feature-creep") m.atk += 1; // le périmètre s'étend à chaque tour
  move(ctx, m);
  m.intent = planIntent(ctx, m);
}

function tickStatuses(ctx: Ctx, m: MonsterState) {
  for (const st of m.statuses) {
    if (st.turns <= 0) continue;
    if (st.kind === "poison") ctx.damage({ kind: "monster", id: m.id }, st.damage, "poison");
    st.turns -= 1;
  }
  m.statuses = m.statuses.filter((st) => st.turns > 0);
}

/** Dégâts d'une attaque de ce monstre sur le héros (affichés dans l'intention). */
export function attackDamage(ctx: Ctx, m: MonsterState): number {
  return computeDamage(ARCHETYPES[m.archetype].power, m.atk, ctx.s.hero.def);
}

function resolveIntent(ctx: Ctx, m: MonsterState) {
  const intent = m.intent!;
  m.intent = null;
  const hero = { kind: "hero" } as const;
  switch (intent.kind) {
    case "strike": {
      const target = add(m.pos, intent.dir);
      if (same(target, ctx.s.hero.pos)) ctx.damage(hero, intent.damage, "attack");
      else ctx.emit({ type: "whiff", monster: m.id, at: target });
      break;
    }
    case "shoot": {
      const d = manhattan(m.pos, ctx.s.hero.pos);
      const ok = d >= intent.range[0] && d <= intent.range[1] && ctx.lineOfSight(m.pos, ctx.s.hero.pos);
      if (ok) ctx.damage(hero, intent.damage, "attack");
      else ctx.emit({ type: "whiff", monster: m.id, at: { ...ctx.s.hero.pos } });
      break;
    }
    case "charge": {
      const from = { ...m.pos };
      let pos = m.pos;
      for (;;) {
        const next = add(pos, intent.dir);
        if (same(next, ctx.s.hero.pos)) {
          if (!same(pos, from)) ctx.emit({ type: "walked", unit: { kind: "monster", id: m.id }, from, to: { ...pos } });
          m.pos = { ...pos };
          ctx.damage(hero, intent.damage, "attack");
          return;
        }
        if (!ctx.free(next)) break;
        pos = next;
      }
      if (!same(pos, from)) ctx.emit({ type: "walked", unit: { kind: "monster", id: m.id }, from, to: { ...pos } });
      m.pos = { ...pos };
      ctx.emit({ type: "whiff", monster: m.id, at: { ...pos } });
      break;
    }
    case "sweep": {
      // Frappe toutes les cases de la ligne, murs et unités compris : seule la position compte.
      let hit = false;
      for (let k = 1; k <= intent.length; k++) {
        if (same(add(m.pos, intent.dir, k), ctx.s.hero.pos)) hit = true;
      }
      if (hit) ctx.damage(hero, intent.damage, "attack");
      else ctx.emit({ type: "whiff", monster: m.id, at: add(m.pos, intent.dir, 2) });
      break;
    }
    case "comments": {
      if (intent.cells.some((c) => same(c, ctx.s.hero.pos))) ctx.damage(hero, intent.damage, "attack");
      else ctx.emit({ type: "whiff", monster: m.id, at: { ...intent.cells[0] } });
      break;
    }
    case "summon": {
      const archetype = summonArchetype(ctx);
      for (const d of DIRECTIONS) {
        const p = add(m.pos, d);
        if (!ctx.free(p)) continue;
        const def = ARCHETYPES[archetype];
        const id = Math.max(...ctx.s.monsters.map((x) => x.id)) + 1;
        ctx.s.monsters.push({
          id,
          archetype,
          issue: null,
          roomId: m.roomId,
          pos: p,
          hp: def.hp,
          maxHp: def.hp,
          atk: def.atk,
          def: def.def,
          pm: def.pm,
          alive: true,
          intent: null,
          age: 0,
          statuses: [],
        });
        ctx.emit({ type: "spawned", monster: id, at: p });
        break;
      }
      break;
    }
    case "reproduce": {
      for (const d of DIRECTIONS) {
        const p = add(m.pos, d);
        if (!ctx.free(p)) continue;
        const id = Math.max(...ctx.s.monsters.map((x) => x.id)) + 1;
        ctx.s.monsters.push({ ...structuredClone(m), id, pos: p, age: 0, intent: null, statuses: [] });
        m.age = 0;
        ctx.emit({ type: "spawned", monster: id, at: p });
        break;
      }
      break;
    }
  }
}

/** Distances (en pas) depuis `from` dans l'arène, en évitant les unités et objets. */
function distances(ctx: Ctx, from: Point, maxSteps: number): Map<string, { p: Point; d: number; prev: string | null }> {
  const out = new Map<string, { p: Point; d: number; prev: string | null }>();
  out.set(key(from), { p: from, d: 0, prev: null });
  const queue = [from];
  for (let head = 0; head < queue.length; head++) {
    const p = queue[head];
    const d = out.get(key(p))!.d;
    if (d >= maxSteps) continue;
    for (const dir of DIRECTIONS) {
      const q = add(p, dir);
      if (out.has(key(q)) || !ctx.free(q)) continue;
      out.set(key(q), { p: q, d: d + 1, prev: key(p) });
      queue.push(q);
    }
  }
  return out;
}

/** Choisit la meilleure case accessible selon un score (plus petit = mieux), égalités départagées par la position. */
function bestReachable(ctx: Ctx, m: MonsterState, score: (p: Point, steps: number) => number): Point {
  const reach = distances(ctx, m.pos, m.pm);
  let best = m.pos;
  let bestScore = score(m.pos, 0);
  for (const { p, d } of reach.values()) {
    const s = score(p, d);
    if (s < bestScore || (s === bestScore && (p.y < best.y || (p.y === best.y && p.x < best.x)))) {
      best = p;
      bestScore = s;
    }
  }
  return best;
}

/** Distance réelle (en pas, obstacles compris) jusqu'au contact du héros ; Infinity si inaccessible. */
function pathToHero(ctx: Ctx, from: Point): number {
  const reach = distances(ctx, from, 64);
  let best = Infinity;
  for (const { p, d } of reach.values()) if (manhattan(p, ctx.s.hero.pos) === 1) best = Math.min(best, d);
  return best;
}

function move(ctx: Ctx, m: MonsterState) {
  const hero = ctx.s.hero.pos;
  const behavior = ARCHETYPES[m.archetype].behavior;
  let target: Point;

  if (behavior === "melee") {
    // Au contact s'il le peut, sinon au plus près (en vrais pas, obstacles contournés).
    target = bestReachable(ctx, m, (p, steps) => (manhattan(p, hero) === 1 ? steps : 100 + pathToHero(ctx, p)));
  } else if (behavior === "ranged") {
    // Une case avec ligne de vue, dans la portée, jamais au contact ; sinon s'éloigner.
    target = bestReachable(ctx, m, (p, steps) => {
      const d = manhattan(p, hero);
      const inRange = d >= SPHINX_RANGE[0] && d <= SPHINX_RANGE[1] && ctx.lineOfSight(p, hero);
      return inRange ? steps : 50 - Math.min(d, 10) + steps;
    });
  } else {
    // Chargeur : s'aligner avec le héros sur une ligne dégagée.
    target = bestReachable(ctx, m, (p, steps) => (chargeLineClear(ctx, p, hero) ? steps : 20 + manhattan(p, hero) + steps));
  }

  if (!same(target, m.pos)) {
    const from = { ...m.pos };
    m.pos = { ...target };
    ctx.emit({ type: "walked", unit: { kind: "monster", id: m.id }, from, to: { ...target } });
  }
}

/** Ligne droite dégagée de `p` jusqu'au héros (même ligne ou colonne). */
function chargeLineClear(ctx: Ctx, p: Point, hero: Point): boolean {
  if (!aligned(p, hero)) return false;
  const dir = directionTo(p, hero);
  let q = add(p, dir);
  while (!same(q, hero)) {
    if (!ctx.free(q)) return false;
    q = add(q, dir);
  }
  return true;
}

export function planIntent(ctx: Ctx, m: MonsterState): Intent | null {
  const hero = ctx.s.hero.pos;
  if (m.archetype === "boss") return planBoss(ctx, m);
  if (m.archetype === "bug" && m.age + 1 >= BUG_REPRODUCE_AGE) return { kind: "reproduce" };
  const damage = attackDamage(ctx, m);
  switch (ARCHETYPES[m.archetype].behavior) {
    case "melee":
      return manhattan(m.pos, hero) === 1 ? { kind: "strike", dir: directionTo(m.pos, hero), damage } : null;
    case "ranged": {
      const d = manhattan(m.pos, hero);
      const ok = d >= SPHINX_RANGE[0] && d <= SPHINX_RANGE[1] && ctx.lineOfSight(m.pos, hero);
      return ok ? { kind: "shoot", damage, range: SPHINX_RANGE } : null;
    }
    case "charger":
      return chargeLineClear(ctx, m.pos, hero) ? { kind: "charge", dir: directionTo(m.pos, hero), damage } : null;
  }
}

/** Longueur et puissance du balayage du boss. */
export const SWEEP_LENGTH = 3;
/** Dégâts des cases « commentaire » de la phase 2. */
export const COMMENT_DAMAGE = 6;

/**
 * Boss (GAMEDESIGN.md §2) :
 *  - phase 1 « Triage » : balaye 3 cases en ligne si le héros y est ; invoque un renfort tous les 3 tours ;
 *  - phase 2 « Discussion » : un tour sur deux, marque des cases « commentaire » autour du héros,
 *    qui explosent au tour suivant ; sinon balaye.
 */
function planBoss(ctx: Ctx, m: MonsterState): Intent | null {
  const round = ctx.s.combat?.round ?? 1;
  const phase = m.phase ?? 1;
  const damage = attackDamage(ctx, m);
  if (phase === 1 && round % 3 === 0) return { kind: "summon" };
  if (phase >= 2 && round % 2 === 1) return { kind: "comments", cells: commentCells(ctx), damage: COMMENT_DAMAGE };
  const hero = ctx.s.hero.pos;
  if (aligned(m.pos, hero) && manhattan(m.pos, hero) <= SWEEP_LENGTH) {
    return { kind: "sweep", dir: directionTo(m.pos, hero), damage, length: SWEEP_LENGTH };
  }
  return null;
}

/** Cases « commentaire » : la case du héros et deux voisines, dans un ordre fixe. */
function commentCells(ctx: Ctx): Point[] {
  const h = ctx.s.hero.pos;
  const offsets = [
    [0, 0],
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ];
  const out: Point[] = [];
  for (const [dx, dy] of offsets) {
    const p = { x: h.x + dx, y: h.y + dy };
    if (ctx.inArena(p) && !ctx.pillarAt(p)) out.push(p);
    if (out.length === 3) break;
  }
  return out;
}

/** Renfort du boss : l'archétype le plus courant parmi les monstres du repo (goblin à défaut). */
function summonArchetype(ctx: Ctx): MonsterState["archetype"] {
  const counts = new Map<MonsterState["archetype"], number>();
  for (const m of ctx.s.monsters) {
    if (m.archetype === "boss" || m.archetype === "slime") continue;
    counts.set(m.archetype, (counts.get(m.archetype) ?? 0) + 1);
  }
  let best: MonsterState["archetype"] = "goblin";
  let n = 0;
  for (const [a, c] of [...counts].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (c > n) {
      best = a;
      n = c;
    }
  }
  return best;
}
