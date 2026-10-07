import { describe, expect, it } from "vitest";
import { generateDungeon } from "@/lib/dungeon/generate";
import { TILE } from "@/lib/dungeon/types";
import { revealedTiles } from "@/lib/game/visibility";
import { buildWorld, index } from "@/lib/game/world";
import { RepoSnapshotSchema } from "@/lib/ingest/snapshot";
import hand from "./fixtures/hand.json";

const world = buildWorld(generateDungeon(RepoSnapshotSchema.parse(hand)));
const model = world.model;
const count = (a: Uint8Array) => a.reduce((n, v) => n + v, 0);

describe("revealedTiles", () => {
  it("au départ : le hall, ses murs et les couloirs qui en partent ; pas les autres salles", () => {
    const revealed = revealedTiles(world, [model.entranceRoomId]);
    const hall = model.rooms[model.entranceRoomId].rect;
    expect(revealed[index(world, { x: hall.x - 1, y: hall.y - 1 })]).toBe(1); // coin de mur
    for (const corridor of model.corridors.filter((c) => c.from === model.entranceRoomId)) {
      for (const p of corridor.cells) expect(revealed[index(world, p)]).toBe(1);
    }
    const far = model.rooms.find((r) => r.depth >= 2)!;
    expect(revealed[index(world, { x: far.rect.x, y: far.rect.y })]).toBe(0);
  });

  it("ne révèle jamais de vide, et grandit avec les salles visitées", () => {
    const all = model.rooms.map((r) => r.id);
    const start = revealedTiles(world, [model.entranceRoomId]);
    const full = revealedTiles(world, all);
    expect(count(full)).toBeGreaterThan(count(start));
    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        if (full[y * world.width + x]) expect(model.rows[y][x]).not.toBe(TILE.void);
      }
    }
  });
});
