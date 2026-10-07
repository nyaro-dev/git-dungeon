import { TILE, type DungeonModel, type Point } from "@/lib/dungeon/types";
import { pillarsFor } from "./arena";

/**
 * Index spatial d'un donjon, dérivé une fois du modèle (pur, immuable) : quelles
 * cases sont praticables, et à quelle salle appartient chaque case.
 */
export type World = {
  model: DungeonModel;
  width: number;
  height: number;
  /** 1 si sol, couloir ou porte. */
  walkable: Uint8Array;
  /** Id de la salle de la case, -1 hors salle (couloir, mur, vide). */
  roomAt: Int16Array;
  /** 1 sur un pilier LGTM (non praticable, opaque, étourdit qui s'y cogne). */
  pillar: Uint8Array;
};

export const index = (world: Pick<World, "width">, p: Point) => p.y * world.width + p.x;

export function buildWorld(model: DungeonModel): World {
  const { width, height } = model;
  const walkable = new Uint8Array(width * height);
  const roomAt = new Int16Array(width * height).fill(-1);
  for (let y = 0; y < height; y++) {
    const row = model.rows[y];
    for (let x = 0; x < width; x++) {
      const t = row[x];
      if (t === TILE.floor || t === TILE.corridor || t === TILE.door) walkable[y * width + x] = 1;
    }
  }
  for (const room of model.rooms) {
    const r = room.rect;
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) roomAt[y * width + x] = room.id;
    }
  }
  const pillar = new Uint8Array(width * height);
  for (const p of pillarsFor(model)) {
    pillar[p.y * width + p.x] = 1;
    walkable[p.y * width + p.x] = 0;
  }
  return { model, width, height, walkable, roomAt, pillar };
}

export function inBounds(world: World, p: Point): boolean {
  return p.x >= 0 && p.y >= 0 && p.x < world.width && p.y < world.height;
}
