import type { DungeonModel, Point } from "@/lib/dungeon/types";

/**
 * Éléments de terrain ajoutés par le jeu (pas par le générateur) : les piliers
 * « LGTM » de l'antichambre du boss. Ils bloquent le passage et la ligne de vue ;
 * un monstre poussé contre l'un d'eux est étourdi (GAMEDESIGN.md §2).
 * Pur et déterministe : dérivé du modèle seul.
 */
export function pillarsFor(model: DungeonModel): Point[] {
  const ante = model.rooms.find((r) => r.kind === "antechamber");
  if (!ante) return [];
  const r = ante.rect;
  if (r.w < 5 || r.h < 5) return [];

  // Cases de porte de l'antichambre (sur son anneau), pour ne jamais boucher un passage.
  const doors: Point[] = [];
  for (const c of model.corridors) for (const d of c.doors) {
    if (d.x >= r.x - 1 && d.x <= r.x + r.w && d.y >= r.y - 1 && d.y <= r.y + r.h) doors.push(d);
  }
  const nearDoor = (p: Point) => doors.some((d) => Math.abs(d.x - p.x) + Math.abs(d.y - p.y) <= 2);
  const taken = (p: Point) =>
    (p.x === model.boss.pos.x && p.y === model.boss.pos.y) ||
    model.chests.some((c) => c.pos.x === p.x && c.pos.y === p.y) ||
    model.npcs.some((n) => n.pos.x === p.x && n.pos.y === p.y);

  const corners: Point[] = [
    { x: r.x + 1, y: r.y + 1 },
    { x: r.x + r.w - 2, y: r.y + 1 },
    { x: r.x + 1, y: r.y + r.h - 2 },
    { x: r.x + r.w - 2, y: r.y + r.h - 2 },
  ];
  return corners.filter((p) => !nearDoor(p) && !taken(p));
}
