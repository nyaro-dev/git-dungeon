import { describe, expect, it } from "vitest";
import { generateDungeon } from "@/lib/dungeon/generate";
import { validateDungeon } from "@/lib/dungeon/validate";
import { TILE, type DungeonModel } from "@/lib/dungeon/types";
import { RepoSnapshotSchema } from "@/lib/ingest/snapshot";
import hand from "./fixtures/hand.json";

const base = generateDungeon(RepoSnapshotSchema.parse(hand));
const mutate = (fn: (m: DungeonModel) => void) => {
  const m = structuredClone(base);
  fn(m);
  return validateDungeon(m);
};
const setTile = (m: DungeonModel, x: number, y: number, t: string) => {
  m.rows[y] = m.rows[y].slice(0, x) + t + m.rows[y].slice(x + 1);
};

describe("validateDungeon détecte les donjons cassés", () => {
  it("raccourci vers HEAD qui évite l'antichambre", () => {
    const errors = mutate((m) => {
      // Creuse un couloir en L du hall jusqu'à HEAD, en écrasant tout sur son passage.
      const a = m.spawn;
      const head = m.rooms[m.exitRoomId].rect;
      const b = { x: head.x + 1, y: head.y + 1 };
      const sx = Math.sign(b.x - a.x) || 1;
      const sy = Math.sign(b.y - a.y) || 1;
      for (let y = a.y; y !== b.y + sy; y += sy) setTile(m, a.x, y, TILE.corridor);
      for (let x = a.x; x !== b.x + sx; x += sx) setTile(m, x, b.y, TILE.corridor);
    });
    expect(errors).toContain("HEAD atteignable sans passer par le boss");
  });

  it("salle emmurée", () => {
    const errors = mutate((m) => {
      for (const corridor of m.corridors.filter((c) => c.to === m.exitRoomId)) {
        for (const d of corridor.doors) setTile(m, d.x, d.y, TILE.wall);
      }
    });
    expect(errors.some((e) => e.includes("inatteignable"))).toBe(true);
  });

  it("salles superposées, entités mal placées, boss hors de l'antichambre", () => {
    const errors = mutate((m) => {
      m.rooms[1].rect = { ...m.rooms[0].rect };
      m.chests[0].pos = { ...m.spawn };
      m.boss.roomId = m.entranceRoomId;
    });
    expect(errors).toContain("salles 0 et 1 trop proches ou superposées");
    expect(errors.some((e) => e.includes("déjà occupée"))).toBe(true);
    expect(errors).toContain("le boss n'est pas dans l'antichambre");
  });
});
