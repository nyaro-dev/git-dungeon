import type { FolderTree } from "./folders";
import type { Rng } from "./rng";
import type { Point, Rect, RoomKind } from "./types";

/** Espace minimal entre deux sols de salle : mur, au moins 2 cases de passage, mur. */
export const ROOM_GAP = 4;
const RING_STEP = 16;
const MIN_SIDE = 5;
const MAX_SIDE = 11;
const HEAD_SIDE = 5;
const MAX_SEPARATION_SWEEPS = 400;

export type Direction = "east" | "south" | "west" | "north";
export const DIRECTION_VECTORS: Record<Direction, Point> = {
  east: { x: 1, y: 0 },
  south: { x: 0, y: 1 },
  west: { x: -1, y: 0 },
  north: { x: 0, y: -1 },
};
const DIRECTIONS: Direction[] = ["east", "south", "west", "north"];

export type LayoutRoom = {
  id: number;
  kind: RoomKind;
  path: string;
  name: string;
  depth: number;
  parentId: number | null;
  rect: Rect;
  fileCount: number;
};

export type Layout = {
  rooms: LayoutRoom[];
  antechamberId: number;
  headId: number;
  /** Côté de l'antichambre par lequel on rejoint HEAD. */
  headSide: Direction;
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function isqrt(n: number): number {
  let r = 0;
  while ((r + 1) * (r + 1) <= n) r++;
  return r;
}

/** Vrai si les deux rectangles sont à moins de `gap` cases l'un de l'autre. */
export function tooClose(a: Rect, b: Rect, gap: number): boolean {
  return a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
}

/** Point du périmètre d'un carré de demi-côté `r` centré sur l'origine, pour u ∈ [0, 1). */
function onSquareRing(u: number, r: number): Point {
  if (r === 0) return { x: 0, y: 0 };
  const t = u * 8 * r;
  if (t < 2 * r) return { x: r, y: Math.round(-r + t) };
  if (t < 4 * r) return { x: Math.round(r - (t - 2 * r)), y: r };
  if (t < 6 * r) return { x: -r, y: Math.round(r - (t - 4 * r)) };
  return { x: Math.round(-r + (t - 6 * r)), y: -r };
}

/**
 * Sépare les rectangles trop proches en les poussant le long de l'axe le moins
 * coûteux. Tout est entier : aucun arrondi, donc aucune dérive entre moteurs.
 * Le rectangle `fixed` (le hall) ne bouge jamais.
 */
function separate(rects: Rect[], fixed: number): boolean {
  for (let sweep = 0; sweep < MAX_SEPARATION_SWEEPS; sweep++) {
    let moved = false;
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        if (!tooClose(a, b, ROOM_GAP)) continue;
        moved = true;
        const dirX = 2 * b.x + b.w >= 2 * a.x + a.w ? 1 : -1;
        const dirY = 2 * b.y + b.h >= 2 * a.y + a.h ? 1 : -1;
        const amountX = dirX > 0 ? a.x + a.w + ROOM_GAP - b.x : b.x + b.w + ROOM_GAP - a.x;
        const amountY = dirY > 0 ? a.y + a.h + ROOM_GAP - b.y : b.y + b.h + ROOM_GAP - a.y;
        const axis = amountX <= amountY ? "x" : "y";
        const amount = axis === "x" ? amountX : amountY;
        const dir = axis === "x" ? dirX : dirY;
        const moveA = i === fixed ? 0 : j === fixed ? amount : Math.floor(amount / 2);
        const moveB = amount - moveA;
        a[axis] -= moveA * dir;
        b[axis] += moveB * dir;
      }
    }
    if (!moved) return true;
  }
  return false;
}

/** Repli garanti sans chevauchement : salles rangées en étagères, dans l'ordre des ids. */
function shelfLayout(rects: Rect[]): void {
  const perRow = Math.max(1, isqrt(rects.length - 1) + 1);
  let y = 0;
  for (let row = 0; row * perRow < rects.length; row++) {
    let x = 0;
    let rowHeight = 0;
    for (let k = row * perRow; k < Math.min(rects.length, (row + 1) * perRow); k++) {
      rects[k].x = x;
      rects[k].y = y;
      x += rects[k].w + ROOM_GAP + 2;
      rowHeight = Math.max(rowHeight, rects[k].h);
    }
    y += rowHeight + ROOM_GAP + 2;
  }
}

function headPlacement(rooms: LayoutRoom[], ante: LayoutRoom, side: Direction, distance: number) {
  const a = ante.rect;
  const v = DIRECTION_VECTORS[side];
  let head: Rect;
  let strip: Rect;
  if (v.x !== 0) {
    const y = a.y + Math.floor((a.h - HEAD_SIDE) / 2);
    const x = v.x > 0 ? a.x + a.w + distance : a.x - distance - HEAD_SIDE;
    head = { x, y, w: HEAD_SIDE, h: HEAD_SIDE };
    const stripX = v.x > 0 ? a.x + a.w : x + HEAD_SIDE;
    strip = { x: stripX, y: y + Math.floor(HEAD_SIDE / 2), w: distance, h: 1 };
  } else {
    const x = a.x + Math.floor((a.w - HEAD_SIDE) / 2);
    const y = v.y > 0 ? a.y + a.h + distance : a.y - distance - HEAD_SIDE;
    head = { x, y, w: HEAD_SIDE, h: HEAD_SIDE };
    const stripY = v.y > 0 ? a.y + a.h : y + HEAD_SIDE;
    strip = { x: x + Math.floor(HEAD_SIDE / 2), y: stripY, w: 1, h: distance };
  }
  const claim: Rect = {
    x: Math.min(head.x, strip.x),
    y: Math.min(head.y, strip.y),
    w: Math.max(head.x + head.w, strip.x + strip.w) - Math.min(head.x, strip.x),
    h: Math.max(head.y + head.h, strip.y + strip.h) - Math.min(head.y, strip.y),
  };
  const clear = rooms.every((room) => room.id === ante.id || !tooClose(claim, room.rect, ROOM_GAP));
  return clear ? head : null;
}

/**
 * Place les salles : hall au centre, enfants en éventail sur des anneaux carrés
 * concentriques (un anneau par profondeur), puis séparation des chevauchements.
 * Choisit ensuite l'antichambre (salle la plus profonde qui a de la place
 * dehors) et y accroche la salle HEAD par un couloir droit et dégagé.
 */
export function layoutRooms(tree: FolderTree, repoName: string, rng: Rng): Layout {
  const idOf = new Map<string, number>();
  const rooms: LayoutRoom[] = tree.nodes.map((node, id) => {
    idOf.set(node.path, id);
    return {
      id,
      kind: id === 0 ? "hall" : "room",
      path: node.path,
      name: node.path === "" ? repoName : node.path.slice(node.path.lastIndexOf("/") + 1),
      depth: node.depth,
      parentId: node.parent === null ? null : idOf.get(node.parent)!,
      rect: { x: 0, y: 0, w: 0, h: 0 },
      fileCount: node.files.length,
    };
  });
  if (rooms.length === 1) {
    // Repo sans sous-dossier : on crée l'antichambre pour garder hall → boss → HEAD.
    rooms.push({
      id: 1,
      kind: "room",
      path: "~antechamber",
      name: "Antichambre",
      depth: 1,
      parentId: 0,
      rect: { x: 0, y: 0, w: 0, h: 0 },
      fileCount: 0,
    });
  }

  const children: number[][] = rooms.map(() => []);
  for (const room of rooms) if (room.parentId !== null) children[room.parentId].push(room.id);

  // Nombre de feuilles par sous-arbre : les enfants ont toujours un id plus grand que leur parent.
  const leaves = rooms.map(() => 0);
  for (let id = rooms.length - 1; id >= 0; id--) {
    leaves[id] = children[id].length === 0 ? 1 : children[id].reduce((sum, c) => sum + leaves[c], 0);
  }

  // Tailles.
  for (const room of rooms) {
    const base = clamp(MIN_SIDE + isqrt(room.fileCount), MIN_SIDE, MAX_SIDE);
    if (room.kind === "hall") {
      room.rect.w = room.rect.h = Math.max(7, base);
    } else {
      room.rect.w = clamp(base + rng.int(-1, 1), MIN_SIDE, MAX_SIDE);
      room.rect.h = clamp(base + rng.int(-1, 1), MIN_SIDE, MAX_SIDE);
    }
  }

  // Secteurs angulaires (u ∈ [0, 1) le long d'un anneau) proportionnels aux feuilles.
  const sectorStart = rooms.map(() => 0);
  const sectorEnd = rooms.map(() => 1);
  for (const room of rooms) {
    const span = sectorEnd[room.id] - sectorStart[room.id];
    let cursor = sectorStart[room.id];
    for (const child of children[room.id]) {
      const share = (span * leaves[child]) / leaves[room.id];
      sectorStart[child] = cursor;
      sectorEnd[child] = cursor + share;
      cursor += share;
    }
  }
  const rotation = rng.next();
  for (const room of rooms) {
    if (room.kind === "hall") {
      room.rect.x = -Math.floor(room.rect.w / 2);
      room.rect.y = -Math.floor(room.rect.h / 2);
      continue;
    }
    const width = sectorEnd[room.id] - sectorStart[room.id];
    const jitter = (rng.next() - 0.5) * width * 0.2;
    const u = (sectorStart[room.id] + width / 2 + jitter + rotation) % 1;
    const center = onSquareRing(u, room.depth * RING_STEP);
    room.rect.x = center.x - Math.floor(room.rect.w / 2);
    room.rect.y = center.y - Math.floor(room.rect.h / 2);
  }

  const rects = rooms.map((room) => room.rect);
  if (!separate(rects, 0)) shelfLayout(rects);

  // Antichambre : la salle la plus profonde (puis le plus petit chemin) qui a la place
  // d'accueillir HEAD. La salle la plus excentrée dans une direction en a toujours.
  const candidates = rooms
    .filter((room) => room.kind !== "hall")
    .sort((a, b) => b.depth - a.depth || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const hallCenter = { x: 2 * rects[0].x + rects[0].w, y: 2 * rects[0].y + rects[0].h };
  for (const ante of candidates) {
    const away = { x: 2 * ante.rect.x + ante.rect.w - hallCenter.x, y: 2 * ante.rect.y + ante.rect.h - hallCenter.y };
    const sides = DIRECTIONS.slice().sort((p, q) => {
      const dp = DIRECTION_VECTORS[p].x * away.x + DIRECTION_VECTORS[p].y * away.y;
      const dq = DIRECTION_VECTORS[q].x * away.x + DIRECTION_VECTORS[q].y * away.y;
      return dq - dp;
    });
    for (const side of sides) {
      for (let distance = ROOM_GAP; distance <= ROOM_GAP + 6; distance += 2) {
        const head = headPlacement(rooms, ante, side, distance);
        if (!head) continue;
        ante.kind = "antechamber";
        const headId = rooms.length;
        rooms.push({
          id: headId,
          kind: "head",
          path: "~HEAD",
          name: "HEAD",
          depth: ante.depth + 1,
          parentId: ante.id,
          rect: head,
          fileCount: 0,
        });
        return { rooms, antechamberId: ante.id, headId, headSide: side };
      }
    }
  }
  throw new Error("layoutRooms: aucune salle ne peut accueillir HEAD");
}
