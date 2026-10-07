import { DIRECTION_VECTORS, type Direction, type Layout } from "./layout";
import { TILE, type Corridor, type Point, type Rect } from "./types";

const MARGIN = 3;
const TURN_PENALTY = 2;

const VOID = 0;
const FLOOR = 1;
const CORRIDOR = 2;
const DOOR = 3;

const OPPOSITE: Record<Direction, Direction> = { east: "west", west: "east", south: "north", north: "south" };
const STEPS: Point[] = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];

export type Carved = {
  width: number;
  height: number;
  rows: string[];
  /** Rectangles de sol, décalés dans le repère de la grille (même ordre que `layout.rooms`). */
  rects: Rect[];
  corridors: Corridor[];
  sealedDoor: Point;
};

export class CarveError extends Error {}

/** Tas binaire minimal, ordonné par (f, h, ordre d'insertion) : départage déterministe. */
class MinHeap {
  private items: [number, number, number, number][] = [];
  private seq = 0;
  get size() {
    return this.items.length;
  }
  push(f: number, h: number, value: number) {
    const item: [number, number, number, number] = [f, h, this.seq++, value];
    const items = this.items;
    items.push(item);
    let i = items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(items[i], items[p])) break;
      [items[i], items[p]] = [items[p], items[i]];
      i = p;
    }
  }
  pop(): number {
    const items = this.items;
    const top = items[0];
    const last = items.pop()!;
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < items.length && this.less(items[l], items[m])) m = l;
        if (r < items.length && this.less(items[r], items[m])) m = r;
        if (m === i) break;
        [items[i], items[m]] = [items[m], items[i]];
        i = m;
      }
    }
    return top[3];
  }
  private less(a: [number, number, number, number], b: [number, number, number, number]) {
    return a[0] !== b[0] ? a[0] < b[0] : a[1] !== b[1] ? a[1] < b[1] : a[2] < b[2];
  }
}

const center2 = (r: Rect): Point => ({ x: 2 * r.x + r.w, y: 2 * r.y + r.h });

/** Case de mur (anneau à distance 1 du sol) du côté `side`, à la coordonnée `along`. */
function doorCell(r: Rect, side: Direction, along: number): Point {
  switch (side) {
    case "east":
      return { x: r.x + r.w, y: along };
    case "west":
      return { x: r.x - 1, y: along };
    case "south":
      return { x: along, y: r.y + r.h };
    case "north":
      return { x: along, y: r.y - 1 };
  }
}

/** Positions possibles d'une porte sur un côté (coins exclus), de la plus proche de `target` à la plus lointaine. */
function doorCandidates(r: Rect, side: Direction, target: Point): Point[] {
  const horizontal = side === "north" || side === "south";
  const lo = horizontal ? r.x : r.y;
  const hi = horizontal ? r.x + r.w - 1 : r.y + r.h - 1;
  const preferred = Math.max(lo, Math.min(hi, horizontal ? target.x : target.y));
  const out: Point[] = [];
  for (let k = lo; k <= hi; k++) out.push(doorCell(r, side, k));
  return out.sort((a, b) => {
    const da = Math.abs((horizontal ? a.x : a.y) - preferred);
    const db = Math.abs((horizontal ? b.x : b.y) - preferred);
    return da - db || (horizontal ? a.x - b.x : a.y - b.y);
  });
}

/** Côtés d'une salle triés du plus au moins orienté vers `toward` (vecteur doublé). */
function sidesToward(toward: Point): Direction[] {
  const sides: Direction[] = ["east", "south", "west", "north"];
  return sides.sort((p, q) => {
    const dp = DIRECTION_VECTORS[p].x * toward.x + DIRECTION_VECTORS[p].y * toward.y;
    const dq = DIRECTION_VECTORS[q].x * toward.x + DIRECTION_VECTORS[q].y * toward.y;
    return dq - dp;
  });
}

/**
 * Transforme le placement en grille : sols, couloir scellé vers HEAD, couloirs
 * parent → enfant (A* avec pénalité de virage, donc des L quand c'est possible),
 * puis murs autour de tout ce qui est praticable.
 */
export function carve(layout: Layout): Carved {
  const rooms = layout.rooms;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const { rect } of rooms) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.w);
    maxY = Math.max(maxY, rect.y + rect.h);
  }
  const rects: Rect[] = rooms.map(({ rect }) => ({
    x: rect.x - minX + MARGIN,
    y: rect.y - minY + MARGIN,
    w: rect.w,
    h: rect.h,
  }));
  const width = maxX - minX + 2 * MARGIN;
  const height = maxY - minY + 2 * MARGIN;
  const cells = new Uint8Array(width * height);
  /** Cases interdites aux couloirs : anneaux de murs des salles, abords du couloir de HEAD. */
  const blocked = new Uint8Array(width * height);
  const at = (p: Point) => p.y * width + p.x;
  const inBounds = (p: Point) => p.x >= 0 && p.y >= 0 && p.x < width && p.y < height;

  for (const r of rects) {
    for (let y = r.y - 1; y <= r.y + r.h; y++) {
      for (let x = r.x - 1; x <= r.x + r.w; x++) {
        const inside = x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
        if (inside) cells[y * width + x] = FLOOR;
        else blocked[y * width + x] = 1;
      }
    }
  }

  const corridors: Corridor[] = [];

  // 1. Couloir de HEAD : droit, centré, creusé en premier puis isolé.
  const ante = rects[layout.antechamberId];
  const head = rects[layout.headId];
  const side = layout.headSide;
  const vertical = side === "north" || side === "south";
  const along = vertical ? head.x + Math.floor(head.w / 2) : head.y + Math.floor(head.h / 2);
  const sealedDoor = doorCell(ante, side, along);
  const headDoor = doorCell(head, OPPOSITE[side], along);
  const step = DIRECTION_VECTORS[side];
  const headCells: Point[] = [];
  for (let p = { x: sealedDoor.x + step.x, y: sealedDoor.y + step.y }; at(p) !== at(headDoor); p = { x: p.x + step.x, y: p.y + step.y }) {
    headCells.push(p);
  }
  cells[at(sealedDoor)] = DOOR;
  cells[at(headDoor)] = DOOR;
  for (const p of headCells) cells[at(p)] = CORRIDOR;
  for (const p of [sealedDoor, ...headCells, headDoor]) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const q = { x: p.x + dx, y: p.y + dy };
        if (inBounds(q) && cells[at(q)] !== FLOOR) blocked[at(q)] = 1;
      }
    }
  }
  corridors.push({ from: layout.antechamberId, to: layout.headId, doors: [sealedDoor, headDoor], cells: headCells });

  const passable = (p: Point) => inBounds(p) && !blocked[at(p)] && cells[at(p)] !== FLOOR;

  /** Porte utilisable : sur l'anneau, pas déjà une porte voisine du sceau, avec une case libre devant. */
  const pickDoor = (r: Rect, target: Rect): { door: Point; outside: Point } | null => {
    const from = center2(r);
    const to = center2(target);
    for (const s of sidesToward({ x: to.x - from.x, y: to.y - from.y })) {
      const v = DIRECTION_VECTORS[s];
      const targetCenter = { x: Math.floor(to.x / 2), y: Math.floor(to.y / 2) };
      for (const door of doorCandidates(r, s, targetCenter)) {
        const outside = { x: door.x + v.x, y: door.y + v.y };
        if (!passable(outside)) continue;
        if (Math.abs(door.x - sealedDoor.x) + Math.abs(door.y - sealedDoor.y) <= 2) continue;
        return { door, outside };
      }
    }
    return null;
  };

  const route = (start: Point, goal: Point): Point[] | null => {
    const n = width * height;
    const g = new Int32Array(n * 4).fill(0x7fffffff);
    const parent = new Int32Array(n * 4).fill(-1);
    const heap = new MinHeap();
    const h = (p: Point) => Math.abs(p.x - goal.x) + Math.abs(p.y - goal.y);
    for (let d = 0; d < 4; d++) {
      g[at(start) * 4 + d] = 0;
      heap.push(h(start), h(start), at(start) * 4 + d);
    }
    while (heap.size > 0) {
      const state = heap.pop();
      const idx = state >> 2;
      const dir = state & 3;
      const p = { x: idx % width, y: Math.floor(idx / width) };
      if (idx === at(goal)) {
        const path: Point[] = [];
        for (let s = state; s !== -1; s = parent[s]) path.push({ x: (s >> 2) % width, y: Math.floor((s >> 2) / width) });
        return path.reverse();
      }
      for (let nd = 0; nd < 4; nd++) {
        const q = { x: p.x + STEPS[nd].x, y: p.y + STEPS[nd].y };
        if (!passable(q)) continue;
        const ns = at(q) * 4 + nd;
        const cost = g[state] + 1 + (nd === dir ? 0 : TURN_PENALTY);
        if (cost >= g[ns]) continue;
        g[ns] = cost;
        parent[ns] = state;
        heap.push(cost + h(q), h(q), ns);
      }
    }
    return null;
  };

  // 2. Couloirs de l'arbre des dossiers, dans l'ordre des ids.
  for (const room of rooms) {
    if (room.parentId === null || room.kind === "head") continue;
    const a = rects[room.parentId];
    const b = rects[room.id];
    const from = pickDoor(a, b);
    const to = pickDoor(b, a);
    if (!from || !to) throw new CarveError(`pas de porte libre entre ${room.parentId} et ${room.id}`);
    const path = route(from.outside, to.outside);
    if (!path) throw new CarveError(`pas de chemin entre ${room.parentId} et ${room.id}`);
    cells[at(from.door)] = DOOR;
    cells[at(to.door)] = DOOR;
    for (const p of path) if (cells[at(p)] === VOID) cells[at(p)] = CORRIDOR;
    corridors.push({ from: room.parentId, to: room.id, doors: [from.door, to.door], cells: path });
  }

  // 3. Murs : toute case vide touchant (8-voisinage) une case praticable.
  const rows: string[] = [];
  for (let y = 0; y < height; y++) {
    let row = "";
    for (let x = 0; x < width; x++) {
      const c = cells[y * width + x];
      if (c === FLOOR) row += TILE.floor;
      else if (c === CORRIDOR) row += TILE.corridor;
      else if (c === DOOR) row += TILE.door;
      else {
        let wall = false;
        for (let dy = -1; dy <= 1 && !wall; dy++) {
          for (let dx = -1; dx <= 1 && !wall; dx++) {
            const q = { x: x + dx, y: y + dy };
            if (inBounds(q) && cells[at(q)] !== VOID) wall = true;
          }
        }
        row += wall ? TILE.wall : TILE.void;
      }
    }
    rows.push(row);
  }

  return { width, height, rows, rects, corridors, sealedDoor };
}
