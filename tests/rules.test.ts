import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { generateDungeon } from "@/lib/dungeon/generate";
import { TILE } from "@/lib/dungeon/types";
import { STEP, findPath, initGame, isPassable, occupantAt, step, type Direction, type GameState } from "@/lib/game/rules";
import { buildWorld, index, type World } from "@/lib/game/world";
import { RepoSnapshotSchema } from "@/lib/ingest/snapshot";
import hand from "./fixtures/hand.json";

const world = buildWorld(generateDungeon(RepoSnapshotSchema.parse(hand)));
const model = world.model;

const walk = (w: World, s: GameState, path: Direction[]) =>
  path.reduce((acc, direction) => step(w, acc, { type: "move", direction }), s);

/** État d'exploration sans aucun monstre vivant (boss compris) : on teste le déplacement seul. */
const peaceful = (): GameState => {
  const s = initGame(world);
  return { ...s, monsters: s.monsters.map((m) => ({ ...m, alive: false })) };
};
const withBossDead = (s: GameState): GameState => ({ ...s, hasKey: true, monsters: s.monsters.map((m) => ({ ...m, alive: false })) });

describe("initGame", () => {
  it("place le héros au spawn, PV pleins, arme selon le langage", () => {
    const s = initGame(world);
    expect(s.hero.pos).toEqual(model.spawn);
    expect(s.hero).toMatchObject({ hp: 30, maxHp: 30, weapon: "promise-whip", spells: [null, null] });
    expect(s.visitedRooms).toEqual([model.entranceRoomId]);
    expect(s).toMatchObject({ turn: 0, status: "exploring", combat: null });
  });

  it("crée un monstre par issue, plus le boss", () => {
    const s = initGame(world);
    expect(s.monsters).toHaveLength(model.monsters.length + 1);
    expect(s.monsters.filter((m) => m.archetype === "boss")).toHaveLength(1);
    expect(s.monsters.find((m) => m.issue === 22)!.archetype).toBe("bug");
    expect(s.monsters.find((m) => m.issue === 17)!.archetype).toBe("feature-creep");
  });
});

describe("exploration", () => {
  const neighbours = (s: GameState) =>
    (Object.keys(STEP) as Direction[]).map((direction) => {
      const p = { x: s.hero.pos.x + STEP[direction].x, y: s.hero.pos.y + STEP[direction].y };
      return { direction, p, tile: model.rows[p.y][p.x] };
    });

  it("avance d'une case et consomme un tour", () => {
    const s = peaceful();
    const free = neighbours(s).find((n) => n.tile === TILE.floor && !occupantAt(world, s, n.p))!;
    const next = step(world, s, { type: "move", direction: free.direction });
    expect(next.hero.pos).toEqual(free.p);
    expect(next.turn).toBe(1);
    expect(next.events).toEqual([{ type: "moved", from: model.spawn, to: free.p }]);
    expect(s.hero.pos).toEqual(model.spawn); // pas de mutation
  });

  it("un mur bloque sans consommer de tour", () => {
    // Une case du hall dont le voisin nord est un mur (le tracé change avec le seed).
    const hall = model.rooms[model.entranceRoomId].rect;
    let cell = null;
    for (let x = hall.x; x < hall.x + hall.w && !cell; x++) if (model.rows[hall.y - 1][x] === TILE.wall) cell = { x, y: hall.y };
    const s: GameState = { ...peaceful(), hero: { ...peaceful().hero, pos: cell! } };
    const next = step(world, s, { type: "move", direction: "north" });
    expect(next.events).toEqual([{ type: "blocked" }]);
    expect(next.turn).toBe(0);
  });

  it("heurter un PNJ produit un bump", () => {
    const npc = model.npcs[0];
    const s = peaceful();
    const end = walk(world, s, findPath(world, s, npc.pos)!);
    expect(end.events).toEqual([{ type: "bump", entity: { kind: "npc", id: npc.id } }]);
  });

  it("la porte scellée bloque tant que le boss vit", () => {
    const s = initGame(world);
    expect(isPassable(world, s, model.sealedDoor)).toBe(false);
    expect(isPassable(world, withBossDead(s), model.sealedDoor)).toBe(true);
  });

  it("entrer dans HEAD, boss vaincu, gagne la partie", () => {
    const s = withBossDead(initGame(world));
    const head = model.rooms[model.exitRoomId].rect;
    const end = walk(world, s, findPath(world, s, { x: head.x + 2, y: head.y + 2 })!);
    expect(end.status).toBe("won");
  });

  it("entrer dans une salle peuplée déclenche le combat et scelle l'arène", () => {
    const s = initGame(world);
    const target = s.monsters.find((m) => m.archetype !== "boss")!;
    const room = model.rooms[target.roomId].rect;
    // Une case libre de la salle du monstre, la plus proche de son entrée.
    let path: Direction[] | null = null;
    for (let y = room.y; y < room.y + room.h && !path; y++) {
      for (let x = room.x; x < room.x + room.w && !path; x++) {
        if (!occupantAt(world, s, { x, y })) path = findPath(world, s, { x, y });
      }
    }
    let state = s;
    for (const d of path!) {
      state = step(world, state, { type: "move", direction: d });
      if (state.status === "combat") break;
    }
    // Le chemin peut traverser une autre salle peuplée : le combat se déclenche dans la première.
    expect(state.status).toBe("combat");
    expect(state.combat).toMatchObject({ round: 1, pa: 6, pm: 3 });
    expect(state.monsters.some((m) => m.alive && m.roomId === state.combat!.roomId)).toBe(true);
    expect(world.roomAt[index(world, state.hero.pos)]).toBe(state.combat!.roomId);
    expect(state.events.map((e) => e.type)).toContain("combat-start");
  });

  it("propriété : tout chemin d'exploration se rejoue case par case", () => {
    const s = peaceful();
    const cells: { x: number; y: number }[] = [];
    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) if (world.walkable[index(world, { x, y })]) cells.push({ x, y });
    }
    fc.assert(
      fc.property(fc.constantFrom(...cells), (goal) => {
        const path = findPath(world, s, goal);
        if (path === null) return;
        let state = s;
        for (const [i, direction] of path.entries()) {
          state = step(world, state, { type: "move", direction });
          if (state.status === "won") return; // entrer dans HEAD termine la partie
          const ev = state.events[0];
          // Seul le dernier pas peut heurter (ou ouvrir un coffre).
          expect(ev.type === "moved" || (i === path.length - 1 && ["bump", "chest-opened", "fountain", "cache-opened", "teleported"].includes(ev.type))).toBe(true);
        }
      }),
      { numRuns: 150 },
    );
  });
});
