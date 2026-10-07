import { describe, expect, it } from "vitest";
import { generateDungeon } from "@/lib/dungeon/generate";
import type { Point } from "@/lib/dungeon/types";
import { ARCHETYPES } from "@/lib/game/monsters";
import { enterCombat, initGame, previewCast, reachableInCombat, step, type GameAction } from "@/lib/game/rules";
import type { Archetype, GameState, MonsterState, SpellId } from "@/lib/game/types";
import { buildWorld } from "@/lib/game/world";
import { RepoSnapshotSchema } from "@/lib/ingest/snapshot";
import hand from "./fixtures/hand.json";

const world = buildWorld(generateDungeon(RepoSnapshotSchema.parse(hand)));
const model = world.model;

// Arène de test : la plus grande salle ordinaire, coffres ouverts (aucun obstacle).
const room = model.rooms
  .filter((r) => r.kind === "room")
  .sort((a, b) => b.rect.w * b.rect.h - a.rect.w * a.rect.h || a.id - b.id)[0];
const R = room.rect;
const cell = (dx: number, dy: number): Point => ({ x: R.x + dx, y: R.y + dy });

function monster(id: number, archetype: Archetype, at: Point, overrides: Partial<MonsterState> = {}): MonsterState {
  const def = ARCHETYPES[archetype];
  return {
    id,
    archetype,
    issue: null,
    roomId: room.id,
    pos: at,
    hp: def.hp,
    maxHp: def.hp,
    atk: def.atk,
    def: def.def,
    pm: def.pm,
    alive: true,
    intent: null,
    age: 0,
    statuses: [],
    ...overrides,
  };
}

/** Combat dans l'arène : héros en `hero`, monstres donnés (le boss reste vivant ailleurs). */
function arena(hero: Point, monsters: MonsterState[], spells: (SpellId | null)[] = [null, null]): GameState {
  const base = initGame(world);
  const boss = base.monsters.find((m) => m.archetype === "boss")!;
  const s: GameState = {
    ...base,
    hero: { ...base.hero, pos: hero, spells },
    monsters: [...monsters, { ...boss, id: 1000 }],
    openedChests: model.chests.map((c) => c.id),
  };
  return enterCombat(world, s, room.id);
}

const play = (s: GameState, ...actions: GameAction[]) => actions.reduce((acc, a) => step(world, acc, a), s);
const m = (s: GameState, id: number) => s.monsters.find((x) => x.id === id)!;

describe("combat — arme et ciblage", () => {
  it("le Fouet de Promesses inflige 4 et attire d'une case (3 PA)", () => {
    const s = arena(cell(0, 2), [monster(1, "goblin", cell(3, 2))]);
    const next = play(s, { type: "cast", ability: "promise-whip", target: cell(3, 2) });
    expect(m(next, 1).hp).toBe(10 - 4);
    expect(m(next, 1).pos).toEqual(cell(2, 2));
    expect(next.combat!.pa).toBe(3);
    expect(next.events.map((e) => e.type)).toEqual(["cast", "damage", "pushed"]);
  });

  it("refuse hors portée, hors ligne, ou sans PA, sans rien consommer", () => {
    const s = arena(cell(0, 2), [monster(1, "goblin", cell(4, 2)), monster(2, "goblin", cell(2, 3))]);
    expect(play(s, { type: "cast", ability: "promise-whip", target: cell(4, 2) }).events).toEqual([{ type: "denied", reason: "out-of-range" }]);
    expect(play(s, { type: "cast", ability: "promise-whip", target: cell(2, 3) }).events).toEqual([{ type: "denied", reason: "out-of-range" }]);
    const broke = { ...s, combat: { ...s.combat!, pa: 2 } };
    const denied = play(broke, { type: "cast", ability: "promise-whip", target: cell(2, 3) });
    expect(denied.events[0]).toMatchObject({ type: "denied" });
    expect(denied.combat!.pa).toBe(2);
  });

  it("la ligne de vue est bloquée par une autre unité", () => {
    const s = arena(cell(0, 2), [monster(1, "goblin", cell(1, 2)), monster(2, "goblin", cell(3, 2))]);
    expect(play(s, { type: "cast", ability: "promise-whip", target: cell(3, 2) }).events).toEqual([
      { type: "denied", reason: "no-line-of-sight" },
    ]);
  });

  it("l'aperçu donne exactement les mêmes dégâts que le lancer", () => {
    const s = arena(cell(0, 2), [monster(1, "goblin", cell(2, 2))]);
    const preview = previewCast(world, s, "promise-whip", cell(2, 2));
    const real = play(s, { type: "cast", ability: "promise-whip", target: cell(2, 2) }).events;
    expect(preview).toEqual(real);
  });
});

describe("combat — position", () => {
  it("tacle : quitter le contact d'un goblin coûte 2 PM", () => {
    const s = arena(cell(2, 2), [monster(1, "goblin", cell(3, 2))]);
    const next = play(s, { type: "move", direction: "west" });
    expect(next.combat!.pm).toBe(1);
    // Avec 1 PM restant au contact : refusé.
    const stuck = play({ ...s, combat: { ...s.combat!, pm: 1 } }, { type: "move", direction: "west" });
    expect(stuck.events).toEqual([{ type: "denied", reason: "tackled" }]);
  });

  it("les cases atteignables tiennent compte du tacle", () => {
    const s = arena(cell(2, 2), [monster(1, "goblin", cell(3, 2))]);
    const reach = reachableInCombat(world, s);
    const west = reach.get(`${R.x + 1},${R.y + 2}`);
    expect(west?.cost).toBe(2);
    expect(reach.has(`${R.x - 1},${R.y + 2}`)).toBe(false); // hors arène
  });

  it("poussée contre un mur : 3 dégâts par case non parcourue", () => {
    // Goblin à une case du bord droit, poussé de 3 vers l'est : avance de 1, bute, 2 cases restantes.
    const s = arena(cell(R.w - 4, 1), [monster(1, "goblin", cell(R.w - 2, 1))], ["script", null]);
    const next = play(s, { type: "cast", ability: "script", target: cell(R.w - 2, 1) });
    expect(m(next, 1).pos).toEqual(cell(R.w - 1, 1));
    expect(next.events).toContainEqual(expect.objectContaining({ type: "damage", amount: 6, source: "wall" }));
    expect(m(next, 1).hp).toBe(10 - 6);
  });

  it("collision : 2 dégâts par case restante, aux deux unités", () => {
    const s = arena(cell(0, 1), [monster(1, "goblin", cell(1, 1)), monster(2, "goblin", cell(3, 1))], ["script", null]);
    const next = play(s, { type: "cast", ability: "script", target: cell(1, 1) });
    // Avance d'une case, heurte le second : 2 cases restantes → 4 dégâts chacun.
    expect(m(next, 1).pos).toEqual(cell(2, 1));
    expect(m(next, 1).hp).toBe(6);
    expect(m(next, 2).hp).toBe(6);
  });

  it("Checkout saute 2 cases sans tacle, une fois par tour", () => {
    const s = arena(cell(2, 2), [monster(1, "goblin", cell(3, 2))]);
    const jumped = play(s, { type: "cast", ability: "checkout", target: cell(0, 2) });
    expect(jumped.hero.pos).toEqual(cell(0, 2));
    expect(jumped.combat).toMatchObject({ pm: 3, pa: 4 });
    expect(play(jumped, { type: "cast", ability: "checkout", target: cell(0, 4) }).events).toEqual([
      { type: "denied", reason: "once-per-turn" },
    ]);
  });
});

describe("combat — intentions et tour des monstres", () => {
  it("un goblin au contact annonce sa frappe dès le début du combat", () => {
    const s = arena(cell(2, 2), [monster(1, "goblin", cell(3, 2))]);
    expect(m(s, 1).intent).toEqual({ kind: "strike", dir: "west", damage: 4 });
  });

  it("rester dans la case visée : on encaisse ; en sortir : la frappe tombe dans le vide", () => {
    const s = arena(cell(2, 2), [monster(1, "goblin", cell(3, 2))]);
    const stayed = play(s, { type: "end-turn" });
    expect(stayed.hero.hp).toBe(30 - 4);

    const dodged = play(s, { type: "move", direction: "north" }, { type: "end-turn" });
    expect(dodged.hero.hp).toBe(30);
    expect(dodged.events).toContainEqual(expect.objectContaining({ type: "whiff", monster: 1 }));
    // Il revient au contact et annonce une nouvelle frappe.
    expect(m(dodged, 1).intent).toMatchObject({ kind: "strike" });
  });

  it("pousser un ennemi déplace sa frappe annoncée avec lui", () => {
    const s = arena(cell(1, 2), [monster(1, "goblin", cell(2, 2))], ["script", null]);
    const next = play(s, { type: "cast", ability: "script", target: cell(2, 2) }, { type: "end-turn" });
    expect(next.hero.hp).toBe(30);
    expect(next.events).toContainEqual(expect.objectContaining({ type: "whiff", monster: 1 }));
  });

  it("Flash annule l'intention", () => {
    const s = arena(cell(2, 2), [monster(1, "goblin", cell(3, 2))], ["flash", null]);
    const next = play(s, { type: "cast", ability: "flash", target: cell(3, 2) }, { type: "end-turn" });
    expect(next.hero.hp).toBe(30);
  });

  it("le Feature Creep charge en ligne et grossit à chaque tour", () => {
    const s = arena(cell(0, 1), [monster(1, "feature-creep", cell(4, 1))]);
    expect(m(s, 1).intent).toEqual({ kind: "charge", dir: "west", damage: 4 });
    const hit = play(s, { type: "end-turn" });
    expect(hit.hero.hp).toBe(26);
    expect(m(hit, 1).pos).toEqual(cell(1, 1));
    expect(m(hit, 1).atk).toBe(1);
    // Hors de la ligne avant la charge : il fonce dans le vide.
    const dodged = play(s, { type: "move", direction: "south" }, { type: "end-turn" });
    expect(dodged.hero.hp).toBe(30);
  });

  it("le Bug se reproduit à son troisième tour", () => {
    const s = arena(cell(0, 0), [monster(1, "bug", cell(R.w - 1, R.h - 1))]);
    const t2 = play(s, { type: "end-turn" }, { type: "end-turn" });
    expect(m(t2, 1).intent).toEqual({ kind: "reproduce" });
    const t3 = play(t2, { type: "end-turn" });
    expect(t3.monsters.filter((x) => x.archetype === "bug" && x.alive)).toHaveLength(2);
    expect(t3.events).toContainEqual(expect.objectContaining({ type: "spawned" }));
  });

  it("le Sphinx tire s'il voit le héros, rate s'il est hors de portée au moment du tir", () => {
    const s = arena(cell(0, 0), [monster(1, "sphinx", cell(3, 0))]);
    expect(m(s, 1).intent).toMatchObject({ kind: "shoot", damage: 3 });
    expect(play(s, { type: "end-turn" }).hero.hp).toBe(27);
  });

  it("chaque tour recharge 6 PA et 3 PM", () => {
    const s = arena(cell(0, 0), [monster(1, "slime", cell(R.w - 1, R.h - 1))]);
    const next = play(s, { type: "move", direction: "east" }, { type: "cast", ability: "checkout", target: cell(1, 2) }, { type: "end-turn" });
    expect(next.combat).toMatchObject({ pa: 6, pm: 3, round: 2, usedThisTurn: [] });
  });
});

describe("combat — fin", () => {
  it("tuer le dernier monstre gagne le combat et rouvre l'arène", () => {
    const s = arena(cell(0, 2), [monster(1, "slime", cell(1, 2))]);
    const next = play(s, { type: "cast", ability: "promise-whip", target: cell(1, 2) });
    expect(m(next, 1).alive).toBe(false);
    expect(next.status).toBe("exploring");
    expect(next.combat).toBeNull();
    expect(next.events.map((e) => e.type)).toEqual(["cast", "damage", "killed", "combat-won"]);
  });

  it("à 0 PV, la run est perdue et plus rien ne bouge", () => {
    const s = arena(cell(2, 2), [monster(1, "goblin", cell(3, 2))]);
    const dying = { ...s, hero: { ...s.hero, hp: 3 } };
    const dead = play(dying, { type: "end-turn" });
    expect(dead.status).toBe("dead");
    expect(dead.events).toContainEqual({ type: "hero-dead" });
    expect(play(dead, { type: "move", direction: "north" }).hero).toEqual(dead.hero);
  });

  it("déterministe : mêmes actions, même partie", () => {
    const s = arena(cell(0, 2), [monster(1, "goblin", cell(3, 2)), monster(2, "bug", cell(5, 4))], ["script", "flash"]);
    const actions: GameAction[] = [
      { type: "cast", ability: "promise-whip", target: cell(3, 2) },
      { type: "end-turn" },
      { type: "move", direction: "south" },
      { type: "end-turn" },
      { type: "end-turn" },
    ];
    expect(play(s, ...actions)).toEqual(play(s, ...actions));
  });
});

describe("combat — fin de tour en étapes (affichage)", () => {
  it("une étape par monstre qui agit ; la dernière égale step(end-turn)", async () => {
    const { endTurnFrames } = await import("@/lib/game/rules");
    const s = arena(cell(2, 2), [monster(1, "goblin", cell(3, 2)), monster(2, "goblin", cell(5, 4))]);
    const frames = endTurnFrames(world, s);
    expect(frames.length).toBeGreaterThanOrEqual(2);
    const direct = play(s, { type: "end-turn" });
    const last = frames[frames.length - 1];
    expect({ ...last, events: [] }).toEqual({ ...direct, events: [] });
    // Les événements, mis bout à bout, sont ceux du tour complet.
    expect(frames.flatMap((f) => f.events)).toEqual(direct.events);
  });
});
