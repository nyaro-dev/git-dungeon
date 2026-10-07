import type { Point } from "@/lib/dungeon/types";
import { featuresFor } from "./features";
import { ARCHETYPES } from "./monsters";
import { DIRECTIONS, OPPOSITE, add, hasLineOfSight, same } from "./grid";
import type { Direction, GameEvent, GameState, MonsterState, UnitRef } from "./types";
import { index, type World } from "./world";

/** Dégâts infligés par la poussée contre un mur, par case non parcourue. */
export const WALL_DAMAGE = 3;
/** Dégâts de collision entre deux unités, par case non parcourue, à chacune. */
export const COLLISION_DAMAGE = 2;

/** Dégâts fixes : aucune part de hasard (GAMEDESIGN.md §1). */
export function computeDamage(power: number, atk: number, def: number): number {
  return Math.max(1, power + atk - def);
}

/**
 * Contexte d'une action : un brouillon de l'état (copie profonde, modifiable)
 * et le journal des événements. Les règles mutent le brouillon ; vu de
 * l'extérieur, `(état, action) → état` reste pur.
 */
export class Ctx {
  readonly s: GameState;
  readonly events: GameEvent[] = [];

  constructor(
    readonly world: World,
    state: GameState,
  ) {
    this.s = structuredClone(state);
    this.s.events = this.events;
  }

  emit(e: GameEvent) {
    this.events.push(e);
  }

  /** Le héros est mort (méthode : le statut change au fil des effets, TypeScript ne le suit pas). */
  dead(): boolean {
    return this.s.status === "dead";
  }

  // --- Unités ----------------------------------------------------------------

  monster(id: number): MonsterState {
    const m = this.s.monsters.find((x) => x.id === id);
    if (!m) throw new Error(`monstre ${id} inconnu`);
    return m;
  }

  posOf(u: UnitRef): Point {
    return u.kind === "hero" ? this.s.hero.pos : this.monster(u.id).pos;
  }

  setPos(u: UnitRef, p: Point) {
    if (u.kind === "hero") this.s.hero.pos = { ...p };
    else this.monster(u.id).pos = { ...p };
  }

  alive(u: UnitRef): boolean {
    return u.kind === "hero" ? this.s.hero.hp > 0 : this.monster(u.id).alive;
  }

  /** Unité vivante sur une case. */
  unitAt(p: Point): UnitRef | null {
    if (this.s.hero.hp > 0 && same(this.s.hero.pos, p)) return { kind: "hero" };
    const m = this.s.monsters.find((x) => x.alive && same(x.pos, p));
    return m ? { kind: "monster", id: m.id } : null;
  }

  /** Pilier LGTM sur une case. */
  pillarAt(p: Point): boolean {
    return p.x >= 0 && p.y >= 0 && p.x < this.world.width && p.y < this.world.height && this.world.pillar[index(this.world, p)] === 1;
  }

  /** Obstacle immobile sur une case (pilier, PNJ, coffre fermé, élément de commit). */
  propAt(p: Point): boolean {
    const model = this.world.model;
    const f = featuresFor(model);
    return (
      this.pillarAt(p) ||
      f.features.some((x) => same(x.pos, p) && (x.kind === "portal" || !this.s.usedFeatures.includes(x.id))) ||
      (f.hallPortal !== null && same(f.hallPortal, p)) ||
      model.npcs.some((n) => same(n.pos, p)) ||
      model.chests.some((c) => same(c.pos, p) && !this.s.openedChests.includes(c.id))
    );
  }

  /** Monstres vivants de l'arène en cours. */
  arenaMonsters(): MonsterState[] {
    const roomId = this.s.combat?.roomId;
    return roomId === undefined ? [] : this.s.monsters.filter((m) => m.alive && m.roomId === roomId);
  }

  // --- Terrain ---------------------------------------------------------------

  /** Case de sol de la salle de combat (l'arène est scellée : ni portes ni couloirs). */
  inArena(p: Point): boolean {
    const roomId = this.s.combat?.roomId;
    if (roomId === undefined) return false;
    const r = this.world.model.rooms[roomId].rect;
    return p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
  }

  /** Une unité peut-elle se tenir sur cette case de l'arène ? */
  free(p: Point): boolean {
    return this.inArena(p) && !this.unitAt(p) && !this.propAt(p);
  }

  /** Bloque la ligne de vue : tout ce qui n'est pas une case praticable libre. */
  opaque = (p: Point): boolean => {
    const i = index(this.world, p);
    if (p.x < 0 || p.y < 0 || p.x >= this.world.width || p.y >= this.world.height || !this.world.walkable[i]) return true;
    return this.unitAt(p) !== null || this.propAt(p);
  };

  lineOfSight(a: Point, b: Point): boolean {
    return hasLineOfSight(a, b, this.opaque);
  }

  // --- Effets ----------------------------------------------------------------

  damage(u: UnitRef, amount: number, source: Extract<GameEvent, { type: "damage" }>["source"]) {
    if (!this.alive(u) || amount <= 0) return;
    const at = { ...this.posOf(u) };
    if (u.kind === "hero") {
      this.s.hero.hp = Math.max(0, this.s.hero.hp - amount);
      this.emit({ type: "damage", unit: u, amount, at, source });
      if (this.s.hero.hp === 0) {
        this.emit({ type: "killed", unit: u, at, issue: null });
        this.emit({ type: "hero-dead" });
        this.s.status = "dead";
      }
      return;
    }
    const m = this.monster(u.id);
    m.hp = Math.max(0, m.hp - amount);
    this.emit({ type: "damage", unit: u, amount, at, source });
    if (m.hp === 0) {
      m.alive = false;
      m.intent = null;
      this.emit({ type: "killed", unit: u, at, issue: m.issue });
      return;
    }
    // Boss : passe en phase 2 « Discussion » sous la moitié de ses PV.
    if (m.archetype === "boss" && (m.phase ?? 1) === 1 && m.hp <= m.maxHp / 2) {
      m.phase = 2;
      this.emit({ type: "boss-phase", phase: 2 });
    }
  }

  /** Étourdit un monstre : il saute son prochain tour, son intention est annulée. */
  stun(id: number) {
    const m = this.monster(id);
    m.statuses = [...m.statuses.filter((s) => s.kind !== "stunned"), { kind: "stunned", turns: 1 }];
    m.intent = null;
    this.emit({ type: "stunned", monster: id, at: { ...m.pos } });
  }

  heal(u: UnitRef, amount: number) {
    if (!this.alive(u)) return;
    if (u.kind === "hero") {
      const before = this.s.hero.hp;
      this.s.hero.hp = Math.min(this.s.hero.maxHp, before + amount);
      if (this.s.hero.hp > before) this.emit({ type: "heal", unit: u, amount: this.s.hero.hp - before, at: { ...this.s.hero.pos } });
    }
  }

  /**
   * Pousse `u` de `n` cases dans `dir`. Contre un mur ou un objet : 3 dégâts par
   * case non parcourue. Contre une unité : 2 dégâts par case, aux deux.
   */
  push(u: UnitRef, dir: Direction, n: number) {
    const from = { ...this.posOf(u) };
    let pos = from;
    for (let k = 0; k < n; k++) {
      const next = add(pos, dir);
      const remaining = n - k;
      const other = this.unitAt(next);
      if (other) {
        this.moveUnit(u, from, pos);
        this.damage(u, COLLISION_DAMAGE * remaining, "collision");
        this.damage(other, COLLISION_DAMAGE * remaining, "collision");
        return;
      }
      if (!this.inArena(next) || this.propAt(next)) {
        this.moveUnit(u, from, pos);
        this.damage(u, WALL_DAMAGE * remaining, "wall");
        // Contre un pilier LGTM : la cible est étourdie et perd son intention.
        if (this.pillarAt(next) && u.kind === "monster" && this.alive(u)) this.stun(u.id);
        return;
      }
      pos = next;
    }
    this.moveUnit(u, from, pos);
  }

  /** Attire `u` vers `toward` d'au plus `n` cases (s'arrête au contact ou devant un obstacle). */
  pull(u: UnitRef, toward: Point, n: number, dir: Direction) {
    const from = { ...this.posOf(u) };
    let pos = from;
    for (let k = 0; k < n; k++) {
      const next = add(pos, dir);
      if (same(next, toward) || !this.free(next)) break;
      pos = next;
    }
    this.moveUnit(u, from, pos);
  }

  private moveUnit(u: UnitRef, from: Point, to: Point) {
    if (same(from, to)) return;
    this.setPos(u, to);
    this.emit({ type: "pushed", unit: u, from, to: { ...to } });
  }

  /** Nombre d'ennemis au contact de `p` qui taclent (PM supplémentaires pour en partir). */
  tackleAt(p: Point): number {
    let total = 0;
    for (const d of DIRECTIONS) {
      const u = this.unitAt(add(p, d));
      if (u?.kind === "monster") total += ARCHETYPES[this.monster(u.id).archetype].tackle;
    }
    return total;
  }

  /** Direction opposée (utilitaire pour l'attraction). */
  static back(dir: Direction): Direction {
    return OPPOSITE[dir];
  }
}
