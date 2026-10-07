import type { DungeonModel, Point, Room } from "@/lib/dungeon/types";
import { pillarsFor } from "./arena";

/**
 * Éléments d'exploration ajoutés par le jeu (GAMEDESIGN.md §3), dérivés du
 * modèle seul (purs, déterministes) :
 *  - salles secrètes : les dossiers « point » (.github…), derrière un mur fissuré ;
 *  - Clé HEAD : dans le plus gros coffre accessible ; verrouille l'entrée de l'antichambre ;
 *  - éléments de commit : fontaine (fix), portail (revert), cache (feat).
 * Garde-fou commun : rien de tout cela ne peut couper le chemin vers HEAD.
 */

export type Secret = { roomId: number; door: Point };
export type FeatureKind = "fountain" | "portal" | "cache";
export type Feature = { id: number; kind: FeatureKind; roomId: number; pos: Point; commit: string };

export type Features = {
  secrets: Secret[];
  /** Coffre qui contient la Clé HEAD (null : pas de verrou). */
  keyChest: number | null;
  /** Porte d'entrée de l'antichambre, verrouillée sans la clé. */
  lockedDoor: Point | null;
  features: Feature[];
  /** Portail de retour dans le hall (s'il existe au moins un portail « revert »). */
  hallPortal: Point | null;
};

const cache = new WeakMap<DungeonModel, Features>();

export function featuresFor(model: DungeonModel): Features {
  const hit = cache.get(model);
  if (hit) return hit;
  const out = compute(model);
  cache.set(model, out);
  return out;
}

/** Préfixe Conventional Commit d'un titre (« fix(core)!: … » → fix), ou « revert » pour un Revert git. */
export function commitKind(title: string): string | null {
  if (/^revert\b/i.test(title)) return "revert";
  const m = /^(\w+)(\([^)]*\))?!?:/.exec(title);
  return m ? m[1].toLowerCase() : null;
}

function compute(model: DungeonModel): Features {
  const rooms = model.rooms;
  const childrenOf = (id: number) => rooms.filter((r) => r.parentId === id);
  const subtree = (id: number): number[] => [id, ...childrenOf(id).flatMap((c) => subtree(c.id))];
  const critical = new Set(rooms.filter((r) => r.kind === "antechamber" || r.kind === "head").map((r) => r.id));

  // --- Secrets : dossiers « point », sans rien d'indispensable dans leur sous-arbre.
  const secretRooms = new Set<number>();
  for (const room of rooms) {
    if (room.kind !== "room" || !room.name.startsWith(".")) continue;
    if (room.parentId !== null && secretRooms.has(room.parentId)) continue; // seule la plus haute est cachée
    const tree = subtree(room.id);
    if (tree.some((id) => critical.has(id))) continue;
    for (const id of tree) secretRooms.add(id);
  }
  const secrets: Secret[] = [];
  for (const room of rooms) {
    if (!secretRooms.has(room.id) || (room.parentId !== null && secretRooms.has(room.parentId))) continue;
    const corridor = model.corridors.find((c) => c.to === room.id);
    if (corridor) secrets.push({ roomId: room.id, door: corridor.doors[1] });
  }

  // --- Clé HEAD : le plus gros coffre (ids triés par taille décroissante) hors zones interdites.
  const ante = rooms.find((r) => r.kind === "antechamber")!;
  const keyChest = model.chests.find((c) => !critical.has(c.roomId) && !secretRooms.has(c.roomId))?.id ?? null;
  const entry = model.corridors.find((c) => c.to === ante.id);
  const lockedDoor = keyChest !== null && entry ? entry.doors[1] : null;

  // --- Éléments de commit.
  const features: Feature[] = [];
  const pillars = pillarsFor(model);
  const doors = model.corridors.flatMap((c) => c.doors);
  const taken = new Set<string>([
    ...[model.spawn, model.boss.pos, ...model.monsters.map((m) => m.pos), ...model.npcs.map((n) => n.pos), ...model.chests.map((c) => c.pos), ...pillars].map(
      (p) => `${p.x},${p.y}`,
    ),
  ]);
  const freeCellIn = (room: Room): Point | null => {
    const r = room.rect;
    const cx = r.x + Math.floor(r.w / 2);
    const cy = r.y + Math.floor(r.h / 2);
    // Du centre vers l'extérieur ; jamais au contact d'une porte (on ne bouche pas un passage).
    const cells: Point[] = [];
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) cells.push({ x, y });
    cells.sort((a, b) => Math.abs(a.x - cx) + Math.abs(a.y - cy) - (Math.abs(b.x - cx) + Math.abs(b.y - cy)) || a.y - b.y || a.x - b.x);
    return (
      cells.find(
        (p) =>
          !taken.has(`${p.x},${p.y}`) &&
          // Ni au centre exact (le spawn ou le boss y sont souvent), ni près d'une porte.
          !doors.some((d) => Math.abs(d.x - p.x) <= 1 && Math.abs(d.y - p.y) <= 1),
      ) ?? null
    );
  };

  for (const room of rooms) {
    if (room.kind !== "room" || room.commitShas.length === 0) continue;
    const commit = model.commits[room.commitShas[0]];
    if (!commit) continue;
    const kind = commitKind(commit.title);
    const featureKind: FeatureKind | null = kind === "fix" ? "fountain" : kind === "revert" ? "portal" : kind === "feat" ? "cache" : null;
    if (!featureKind) continue;
    const pos = freeCellIn(room);
    if (!pos) continue;
    taken.add(`${pos.x},${pos.y}`);
    features.push({ id: features.length, kind: featureKind, roomId: room.id, pos, commit: commit.title });
  }

  let hallPortal: Point | null = null;
  if (features.some((f) => f.kind === "portal")) {
    const hall = rooms.find((r) => r.kind === "hall")!;
    hallPortal = freeCellIn(hall);
    if (hallPortal) taken.add(`${hallPortal.x},${hallPortal.y}`);
  }

  return { secrets, keyChest, lockedDoor, features, hallPortal };
}
