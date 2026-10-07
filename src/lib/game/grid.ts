import type { Point } from "@/lib/dungeon/types";
import type { Direction } from "./types";

export const STEP: Record<Direction, Point> = {
  north: { x: 0, y: -1 },
  east: { x: 1, y: 0 },
  south: { x: 0, y: 1 },
  west: { x: -1, y: 0 },
};
/** Ordre fixe des voisins : garantit les mêmes chemins et choix d'une machine à l'autre. */
export const DIRECTIONS: Direction[] = ["north", "east", "south", "west"];

export const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
export const add = (p: Point, d: Direction, n = 1): Point => ({ x: p.x + STEP[d].x * n, y: p.y + STEP[d].y * n });
export const manhattan = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const key = (p: Point) => `${p.x},${p.y}`;

/** Même ligne ou même colonne (case distincte). */
export function aligned(a: Point, b: Point): boolean {
  return (a.x === b.x) !== (a.y === b.y);
}

/** Direction cardinale de `from` vers `to` (axe dominant ; à égalité, l'axe horizontal). */
export function directionTo(from: Point, to: Point): Direction {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) return dx > 0 ? "east" : "west";
  return dy > 0 ? "south" : "north";
}

export const OPPOSITE: Record<Direction, Direction> = { north: "south", south: "north", east: "west", west: "east" };

/**
 * Cases traversées entre `a` et `b` (Bresenham), extrémités exclues. Une ligne
 * de vue existe si aucune de ces cases n'est opaque. Symétrique : on retient le
 * tracé le plus permissif des deux sens, pour que « je te vois » implique « tu me vois ».
 */
export function lineCells(a: Point, b: Point): Point[] {
  const out: Point[] = [];
  let x = a.x;
  let y = a.y;
  const dx = Math.abs(b.x - a.x);
  const dy = -Math.abs(b.y - a.y);
  const sx = a.x < b.x ? 1 : -1;
  const sy = a.y < b.y ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    if (x === b.x && y === b.y) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
    if (x === b.x && y === b.y) break;
    out.push({ x, y });
  }
  return out;
}

export function hasLineOfSight(a: Point, b: Point, opaque: (p: Point) => boolean): boolean {
  if (same(a, b)) return true;
  const clear = (cells: Point[]) => cells.every((p) => !opaque(p));
  return clear(lineCells(a, b)) || clear(lineCells(b, a));
}
