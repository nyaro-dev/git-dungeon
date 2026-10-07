import { TILE, type DungeonModel, type Point } from "@/lib/dungeon/types";

/**
 * « Habillage » du donjon pour le rendu en îles flottantes : quelle pièce du kit
 * sur quelle case, orientée comment, et où poser le décor. Pur et déterministe
 * (hachage des coordonnées) : aucune incidence sur les règles du jeu.
 */

export type Placed = Point & { yaw: number };
export type Decor = { x: number; z: number; y: number; yaw: number; scale: number };

export type Dressing = {
  floors: Placed[];
  bridges: Placed[];
  parapets: Placed[];
  doors: Placed[];
  grass: Decor[];
  crystals: Decor[];
  torches: Decor[];
  rocks: Decor[];
};

/** Hauteur des rebords (= PARAPET_HEIGHT de scripts/blender/dungeon-kit/build.py). */
export const PARAPET_HEIGHT = 0.32;
const QUARTER = Math.PI / 2;

/** Hachage entier → [0, 1), stable d'une machine à l'autre. */
export function cellHash(x: number, y: number, salt: number): number {
  let h = (x * 374761393 + y * 668265263 + salt * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function dressDungeon(model: DungeonModel): Dressing {
  const { rows, width, height, rooms } = model;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= width || y >= height ? TILE.void : rows[y][x]);
  const walkable = (x: number, y: number) => {
    const t = at(x, y);
    return t === TILE.floor || t === TILE.corridor || t === TILE.door;
  };

  // Anneau de chaque salle (cases à distance 1 du sol) : rebords et portes.
  const ringRoom = new Int16Array(width * height).fill(-1);
  const horizontalEdge = new Uint8Array(width * height);
  for (const room of rooms) {
    const r = room.rect;
    for (let y = r.y - 1; y <= r.y + r.h; y++) {
      for (let x = r.x - 1; x <= r.x + r.w; x++) {
        const inside = x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
        if (inside) continue;
        ringRoom[y * width + x] = room.id;
        if (y === r.y - 1 || y === r.y + r.h) horizontalEdge[y * width + x] = 1;
      }
    }
  }
  const occupied = new Set<string>();
  for (const p of [model.spawn, model.boss.pos, ...model.monsters.map((m) => m.pos), ...model.npcs.map((n) => n.pos), ...model.chests.map((c) => c.pos)]) {
    occupied.add(`${p.x},${p.y}`);
  }

  const out: Dressing = { floors: [], bridges: [], parapets: [], doors: [], grass: [], crystals: [], torches: [], rocks: [] };
  const doorCells: Point[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = rows[y][x];
      const i = y * width + x;
      if (t === TILE.floor) {
        out.floors.push({ x, y, yaw: Math.floor(cellHash(x, y, 1) * 4) * QUARTER });
        // Herbe le long des bords, jamais sous une entité.
        const nearEdge = at(x - 1, y) === TILE.wall || at(x + 1, y) === TILE.wall || at(x, y - 1) === TILE.wall || at(x, y + 1) === TILE.wall;
        if (nearEdge && !occupied.has(`${x},${y}`) && cellHash(x, y, 2) < 0.55) {
          out.grass.push({
            x: x + (cellHash(x, y, 3) - 0.5) * 0.6,
            z: y + (cellHash(x, y, 4) - 0.5) * 0.6,
            y: 0,
            yaw: cellHash(x, y, 5) * Math.PI * 2,
            scale: 0.8 + cellHash(x, y, 6) * 0.6,
          });
        }
      } else if (t === TILE.corridor) {
        const alongZ = walkable(x, y - 1) || walkable(x, y + 1);
        out.bridges.push({ x, y, yaw: alongZ ? 0 : QUARTER });
      } else if (t === TILE.door) {
        out.doors.push({ x, y, yaw: horizontalEdge[i] ? 0 : QUARTER });
        doorCells.push({ x, y });
      } else if (t === TILE.wall && ringRoom[i] !== -1) {
        out.parapets.push({ x, y, yaw: horizontalEdge[i] ? 0 : QUARTER });
        const room = rooms[ringRoom[i]].rect;
        const corner = (x === room.x - 1 || x === room.x + room.w) && (y === room.y - 1 || y === room.y + room.h);
        if (corner && cellHash(x, y, 7) < 0.7) {
          out.crystals.push({ x, y: PARAPET_HEIGHT, z: y, yaw: cellHash(x, y, 8) * Math.PI * 2, scale: 1 + cellHash(x, y, 9) * 0.6 });
        } else if (!corner && cellHash(x, y, 10) < 0.1) {
          out.rocks.push({ x, y: PARAPET_HEIGHT, z: y, yaw: cellHash(x, y, 11) * Math.PI * 2, scale: 0.7 + cellHash(x, y, 12) * 0.5 });
        }
      }
      // Les murs hors anneau (le long des couloirs) ne sont pas dessinés : le pont enjambe le vide.
    }
  }

  // Torches sur les rebords qui encadrent chaque porte.
  for (const d of doorCells) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = d.x + dx;
      const y = d.y + dy;
      if (at(x, y) === TILE.wall && ringRoom[y * width + x] !== -1) {
        out.torches.push({ x, y: PARAPET_HEIGHT, z: y, yaw: 0, scale: 1 });
      }
    }
  }
  return out;
}
