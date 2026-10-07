import { describe, expect, it } from "vitest";
import { generateDungeon } from "@/lib/dungeon/generate";
import type { DungeonModel } from "@/lib/dungeon/types";
import { commitKind, featuresFor } from "@/lib/game/features";
import { FOUNTAIN_HEAL, completion, findPath, initGame, isPassable, step, type GameAction } from "@/lib/game/rules";
import type { GameState } from "@/lib/game/types";
import { buildWorld, type World } from "@/lib/game/world";
import { RepoSnapshotSchema } from "@/lib/ingest/snapshot";
import hand from "./fixtures/hand.json";

const model = generateDungeon(RepoSnapshotSchema.parse(hand));
const world = buildWorld(model);
const f = featuresFor(model);

const play = (w: World, s: GameState, ...actions: GameAction[]) => actions.reduce((acc, a) => step(w, acc, a), s);
const walkTo = (w: World, s: GameState, goal: { x: number; y: number }) =>
  play(w, s, ...(findPath(w, s, goal) ?? []).map((direction) => ({ type: "move", direction }) as const));
/** Exploration sans monstres. */
const peaceful = (w: World = world): GameState => {
  const s = initGame(w);
  return { ...s, monsters: s.monsters.map((m) => ({ ...m, alive: false })) };
};

describe("commitKind", () => {
  it.each([
    ["fix(core): bellows no longer overheat", "fix"],
    ["feat!: drop node 18", "feat"],
    ['Revert "feat(ui): sparks"', "revert"],
    ["docs: explain quenching", "docs"],
    ["Update README", null],
  ])("%s → %s", (title, kind) => {
    expect(commitKind(title)).toBe(kind);
  });
});

describe("salles secrètes", () => {
  it("les dossiers point deviennent secrets, jamais sur le chemin de HEAD", () => {
    expect(f.secrets.length).toBeGreaterThan(0);
    for (const secret of f.secrets) {
      expect(model.rooms[secret.roomId].name.startsWith(".")).toBe(true);
      expect(["antechamber", "head"]).not.toContain(model.rooms[secret.roomId].kind);
    }
  });

  it("le mur fissuré bloque, se révèle quand on le heurte, puis laisse passer", () => {
    const secret = f.secrets[0];
    let s = peaceful();
    expect(isPassable(world, s, secret.door)).toBe(false);
    // Approche par le pont : on se place sur la case du couloir devant la porte.
    const corridor = model.corridors.find((c) => c.to === secret.roomId)!;
    const before = corridor.cells[corridor.cells.length - 1];
    s = walkTo(world, s, before);
    expect(s.hero.pos).toEqual(before);
    const dir = (["north", "east", "south", "west"] as const).find((d) => {
      const step1 = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] }[d];
      return before.x + step1[0] === secret.door.x && before.y + step1[1] === secret.door.y;
    })!;
    const found = play(world, s, { type: "move", direction: dir });
    expect(found.events).toEqual([{ type: "secret-found", roomId: secret.roomId, at: secret.door }]);
    expect(isPassable(world, found, secret.door)).toBe(true);
  });
});

describe("Clé HEAD", () => {
  it("le plus gros coffre accessible garde la clé ; l'antichambre est verrouillée sans elle", () => {
    expect(f.keyChest).not.toBeNull();
    expect(f.lockedDoor).not.toBeNull();
    const s = peaceful();
    expect(isPassable(world, s, f.lockedDoor!)).toBe(false);
    const opened = walkTo(world, s, model.chests[f.keyChest!].pos);
    expect(opened.events).toContainEqual({ type: "key-found", chest: f.keyChest });
    expect(opened.hasKey).toBe(true);
    expect(isPassable(world, opened, f.lockedDoor!)).toBe(true);
  });
});

describe("éléments de commit", () => {
  it("fix → fontaine : soin unique", () => {
    const fountain = f.features.find((x) => x.kind === "fountain")!;
    expect(fountain).toBeDefined();
    const hurt = { ...peaceful(), hero: { ...peaceful().hero, hp: 10 } };
    const drank = walkTo(world, hurt, fountain.pos);
    expect(drank.hero.hp).toBe(10 + FOUNTAIN_HEAL);
    expect(drank.usedFeatures).toContain(fountain.id);
  });

  it("feat → cache : un sort", () => {
    const cache = f.features.find((x) => x.kind === "cache")!;
    expect(cache).toBeDefined();
    const s = walkTo(world, peaceful(), cache.pos);
    expect(s.events).toContainEqual(expect.objectContaining({ type: "cache-opened", feature: cache.id, outcome: "equipped" }));
    expect(s.hero.spells.filter(Boolean)).toHaveLength(1);
  });

  it("revert → portail aller-retour avec le hall", () => {
    // Variante du modèle : le dernier commit de src/core devient un revert.
    const core = model.rooms.find((r) => r.path === "src/core")!;
    const variant: DungeonModel = {
      ...model,
      commits: { ...model.commits, [core.commitShas[0]]: { title: 'Revert "fix(core): bellows"', author: "mira" } },
    };
    const w = buildWorld(variant);
    const vf = featuresFor(variant);
    const portal = vf.features.find((x) => x.kind === "portal")!;
    expect(portal).toBeDefined();
    expect(vf.hallPortal).not.toBeNull();

    const there = walkTo(w, peaceful(w), portal.pos);
    expect(there.events).toContainEqual(expect.objectContaining({ type: "teleported" }));
    expect(w.roomAt[there.hero.pos.y * w.width + there.hero.pos.x]).toBe(variant.entranceRoomId);
    const back = walkTo(w, there, vf.hallPortal!);
    expect(w.roomAt[back.hero.pos.y * w.width + back.hero.pos.x]).toBe(core.id);
  });
});

describe("complétion", () => {
  it("compte salles, secrets et coffres", () => {
    const s = peaceful();
    const start = completion(world, s);
    expect(start.total).toBe(model.rooms.length + f.secrets.length + model.chests.length);
    expect(start.done).toBe(1); // le hall
    const full = { ...s, visitedRooms: model.rooms.map((r) => r.id), foundSecrets: f.secrets.map((x) => x.roomId), openedChests: model.chests.map((c) => c.id) };
    expect(completion(world, full).percent).toBe(100);
  });
});
