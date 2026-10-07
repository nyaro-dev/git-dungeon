import { describe, expect, it } from "vitest";
import { dressDungeon } from "@/components/scene/env/dressing";
import { generateDungeon } from "@/lib/dungeon/generate";
import { TILE } from "@/lib/dungeon/types";
import { RepoSnapshotSchema } from "@/lib/ingest/snapshot";
import hand from "./fixtures/hand.json";

const model = generateDungeon(RepoSnapshotSchema.parse(hand));
const dressing = dressDungeon(model);

describe("dressDungeon", () => {
  it("place une pièce par case praticable", () => {
    const count = (t: string) => model.rows.join("").split("").filter((c) => c === t).length;
    expect(dressing.floors).toHaveLength(count(TILE.floor));
    expect(dressing.bridges).toHaveLength(count(TILE.corridor));
    expect(dressing.doors).toHaveLength(count(TILE.door));
  });

  it("ne dessine des rebords que sur l'anneau des salles (pas le long des ponts)", () => {
    const walls = model.rows.join("").split("").filter((c) => c === TILE.wall).length;
    expect(dressing.parapets.length).toBeLessThan(walls);
    for (const p of dressing.parapets) {
      const nearRoom = model.rooms.some(
        ({ rect: r }) => p.x >= r.x - 1 && p.x <= r.x + r.w && p.y >= r.y - 1 && p.y <= r.y + r.h,
      );
      expect(nearRoom).toBe(true);
    }
  });

  it("oriente chaque pont le long de son passage", () => {
    for (const b of dressing.bridges) {
      const t = (x: number, y: number) => model.rows[y]?.[x];
      const vertical = [t(b.x, b.y - 1), t(b.x, b.y + 1)].some((c) => c === TILE.corridor || c === TILE.door || c === TILE.floor);
      expect(b.yaw).toBe(vertical ? 0 : Math.PI / 2);
    }
  });

  it("ne pose pas d'herbe sous une entité, et des torches à côté des portes", () => {
    const occupied = new Set([model.spawn, ...model.npcs.map((n) => n.pos), ...model.chests.map((c) => c.pos)].map((p) => `${p.x},${p.y}`));
    for (const g of dressing.grass) expect(occupied.has(`${Math.round(g.x)},${Math.round(g.z)}`)).toBe(false);
    expect(dressing.torches.length).toBeGreaterThan(0);
  });

  it("est déterministe", () => {
    expect(dressDungeon(model)).toEqual(dressing);
  });
});
