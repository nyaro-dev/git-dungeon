import { describe, expect, it } from "vitest";
import { generateDungeon } from "@/lib/dungeon/generate";
import { DUPLICATE_SPELL_HEAL, lootFor } from "@/lib/game/loot";
import { findPath, initGame, step, type GameAction } from "@/lib/game/rules";
import type { GameState, SpellId } from "@/lib/game/types";
import { buildWorld } from "@/lib/game/world";
import { RepoSnapshotSchema } from "@/lib/ingest/snapshot";
import hand from "./fixtures/hand.json";

const world = buildWorld(generateDungeon(RepoSnapshotSchema.parse(hand)));
const model = world.model;
const play = (s: GameState, ...actions: GameAction[]) => actions.reduce((acc, a) => step(world, acc, a), s);

/** Exploration paisible (aucun monstre) avec des sorts donnés. */
const peaceful = (spells: (SpellId | null)[] = [null, null]): GameState => {
  const s = initGame(world);
  return { ...s, hero: { ...s.hero, spells }, monsters: s.monsters.map((m) => ({ ...m, alive: false })) };
};

/** Marche jusqu'au contact du coffre `id` puis le heurte. */
function openChest(s: GameState, id: number): GameState {
  const path = findPath(world, s, model.chests[id].pos)!;
  return play(s, ...path.map((direction) => ({ type: "move", direction }) as const));
}

describe("lootFor", () => {
  it.each([
    ["docs/api.md", "common", { kind: "spell", spell: "scroll" }],
    ["config/app.yml", "rare", { kind: "spell", spell: "config-glyph" }],
    ["scripts/release.mjs", "common", { kind: "spell", spell: "script" }],
    ["Makefile", "common", { kind: "spell", spell: "script" }],
    ["docs/assets/logo.png", "legendary", { kind: "spell", spell: "flash" }],
    ["src/forge.ts", "epic", { kind: "atk", amount: 2 }],
    ["src/ui/forge.css", "legendary", { kind: "def", amount: 3 }],
    ["LICENSE", "common", { kind: "hp", amount: 5 }],
  ] as const)("%s (%s)", (file, rarity, expected) => {
    expect(lootFor({ file, rarity })).toEqual(expected);
  });
});

describe("coffres", () => {
  const byFile = (name: string) => model.chests.findIndex((c) => c.file === name);

  it("heurter un coffre l'ouvre et applique son butin (stat)", () => {
    const id = byFile("src/forge.ts");
    const s = openChest(peaceful(), id);
    expect(s.openedChests).toContain(id);
    expect(s.hero.atk).toBe(lootFor(model.chests[id]).kind === "atk" ? (lootFor(model.chests[id]) as { amount: number }).amount : 0);
    expect(s.events).toContainEqual(expect.objectContaining({ type: "chest-opened", chest: id, outcome: "applied" }));
  });

  it("un sort va dans un emplacement libre", () => {
    const id = byFile("docs/assets/logo.png");
    const s = openChest(peaceful(), id);
    expect(s.hero.spells).toEqual(["flash", null]);
    expect(s.events).toContainEqual({ type: "equipped", spell: "flash", slot: 0, replaced: null });
  });

  it("emplacements pleins : le jeu attend un choix, puis remplace ou laisse", () => {
    const id = byFile("docs/assets/logo.png");
    const waiting = openChest(peaceful(["scroll", "script"]), id);
    expect(waiting.pendingSpell).toBe("flash");
    // Rien d'autre n'est possible tant que le choix n'est pas fait.
    expect(play(waiting, { type: "move", direction: "north" }).events).toEqual([{ type: "denied", reason: "choose-loot" }]);
    const replaced = play(waiting, { type: "equip", slot: 1 });
    expect(replaced.hero.spells).toEqual(["scroll", "flash"]);
    expect(replaced.pendingSpell).toBeNull();
    const left = play(waiting, { type: "equip", slot: null });
    expect(left.hero.spells).toEqual(["scroll", "script"]);
  });

  it("un sort déjà connu soigne à la place", () => {
    const id = byFile("docs/assets/logo.png");
    const hurt = { ...peaceful(["flash", null]) };
    hurt.hero = { ...hurt.hero, hp: 10 };
    const s = openChest(hurt, id);
    expect(s.hero.spells).toEqual(["flash", null]);
    expect(s.hero.hp).toBe(10 + DUPLICATE_SPELL_HEAL);
  });

  it("un coffre ouvert ne bloque plus le passage et ne se rouvre pas", () => {
    const id = byFile("src/forge.ts");
    const s = openChest(peaceful(), id);
    const again = play(s, ...findPath(world, s, model.chests[id].pos)!.map((direction) => ({ type: "move", direction }) as const));
    expect(again.hero.pos).toEqual(model.chests[id].pos);
    expect(again.hero.atk).toBe(s.hero.atk);
  });
});
