import type { RepoSnapshot } from "@/lib/ingest/snapshot";
import type { FileEntry } from "./folders";
import { compareStrings, type Rng } from "./rng";
import type { Boss, Chest, IssueRef, ItemKind, Monster, MonsterKind, Npc, Point, Rarity, Rect, Room } from "./types";

export const MAX_MONSTERS = 40;
export const MAX_MONSTERS_PER_ROOM = 3;
export const MAX_CHESTS = 30;
export const MAX_NPCS = 3;

const ITEM_BY_EXTENSION: Record<string, ItemKind> = {
  ts: "sword",
  tsx: "sword",
  js: "sword",
  jsx: "sword",
  mjs: "sword",
  cjs: "sword",
  md: "scroll",
  mdx: "scroll",
  json: "potion",
  css: "armor",
  scss: "armor",
};
const BINARY_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "avif", "ico", "bmp",
  "woff", "woff2", "ttf", "otf", "eot",
  "pdf", "zip", "gz", "tar", "jar", "wasm", "bin", "exe", "dll", "so",
  "mp3", "mp4", "wav", "ogg", "webm", "mov", "glb", "gltf", "riv",
]);

export function itemForFile(path: string): ItemKind {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  if (ext in ITEM_BY_EXTENSION) return ITEM_BY_EXTENSION[ext];
  return BINARY_EXTENSIONS.has(ext) ? "gem" : "coin";
}

export function monsterKind(labels: readonly string[]): MonsterKind {
  const lower = labels.map((label) => label.toLowerCase());
  if (lower.some((label) => label.includes("bug"))) return "bug";
  if (lower.some((label) => label.includes("enhancement") || label.includes("feature"))) return "feature-creep";
  return "issue";
}

/** Issues de la plus vieille à la plus récente (numéro en cas d'égalité). */
export function sortIssues(issues: RepoSnapshot["issues"]): IssueRef[] {
  return issues
    .map(({ number, title, comments, createdAt, labels }) => ({ number, title, comments, createdAt, labels: [...labels] }))
    .sort((a, b) => compareStrings(a.createdAt, b.createdAt) || a.number - b.number);
}

type Occupancy = {
  /** Réserve une case libre de la salle, loin des portes ; null si la salle est pleine. */
  take(roomId: number, rng: Rng, preferCenter?: boolean): Point | null;
};

function occupancy(rects: Rect[], doors: Point[]): Occupancy {
  const used = new Set<string>();
  // Les cases juste derrière une porte restent libres : on ne bouche jamais un passage.
  for (const d of doors) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) used.add(`${d.x + dx},${d.y + dy}`);
  }
  return {
    take(roomId, rng, preferCenter = false) {
      const r = rects[roomId];
      if (preferCenter) {
        const c = { x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) };
        if (!used.has(`${c.x},${c.y}`)) {
          used.add(`${c.x},${c.y}`);
          return c;
        }
      }
      const free: Point[] = [];
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) if (!used.has(`${x},${y}`)) free.push({ x, y });
      }
      if (free.length === 0) return null;
      const p = rng.pick(free);
      used.add(`${p.x},${p.y}`);
      return p;
    },
  };
}

function rarityFor(rank: number, count: number): Rarity {
  // rank 0 = le plus gros fichier.
  const q = rank / Math.max(1, count);
  if (q < 0.1) return "legendary";
  if (q < 0.3) return "epic";
  if (q < 0.6) return "rare";
  return "common";
}

export type Population = {
  spawn: Point;
  monsters: Monster[];
  boss: Boss;
  chests: Chest[];
  npcs: Npc[];
};

/**
 * Place le contenu : héros au centre du hall, PNJ dans le hall, boss au centre de
 * l'antichambre, monstres pondérés vers les salles « chaudes », coffres dans la
 * salle du fichier qu'ils représentent. Ni monstre dans le hall, l'antichambre ou HEAD.
 */
export function populate(
  snapshot: RepoSnapshot,
  rooms: Room[],
  rects: Rect[],
  doors: Point[],
  filesByRoom: FileEntry[][],
  rng: Rng,
): Population {
  const hall = rooms.find((room) => room.kind === "hall")!;
  const ante = rooms.find((room) => room.kind === "antechamber")!;
  const cells = occupancy(rects, doors);

  const spawn = cells.take(hall.id, rng, true)!;

  const contributors = snapshot.contributors
    .slice()
    .sort((a, b) => b.contributions - a.contributions || compareStrings(a.login, b.login))
    .slice(0, MAX_NPCS);
  const npcs: Npc[] = [];
  for (const c of contributors) {
    const pos = cells.take(hall.id, rng);
    if (!pos) break;
    npcs.push({ id: npcs.length, roomId: hall.id, pos, login: c.login, avatarUrl: c.avatarUrl, contributions: c.contributions });
  }

  const issues = sortIssues(snapshot.issues);
  const bossIssue = issues.length > 0 ? issues[0] : null;
  const boss: Boss = {
    roomId: ante.id,
    pos: cells.take(ante.id, rng, true)!,
    name: bossIssue ? bossIssue.title : "Legacy Code",
    issue: bossIssue,
  };

  // Monstres : une issue = un monstre, plafonnés ; « TODO » génériques si le repo est calme.
  const eligible = rooms.filter((room) => room.kind === "room");
  const monsters: Monster[] = [];
  const spawnRng = rng.fork("monsters");
  const sources: (IssueRef | null)[] =
    issues.length > 1
      ? issues.slice(1, 1 + MAX_MONSTERS)
      : Array.from({ length: Math.min(MAX_MONSTERS, Math.ceil(eligible.length / 3)) }, () => null);
  const perRoom = new Map<number, number>();
  for (const issue of sources) {
    const weights = eligible.map((room) =>
      (perRoom.get(room.id) ?? 0) >= MAX_MONSTERS_PER_ROOM ? 0 : 1 + 2 * room.commitShas.length,
    );
    if (!weights.some((w) => w > 0)) break;
    const room = eligible[spawnRng.weightedIndex(weights)];
    const pos = cells.take(room.id, spawnRng);
    if (!pos) {
      perRoom.set(room.id, MAX_MONSTERS_PER_ROOM);
      continue;
    }
    perRoom.set(room.id, (perRoom.get(room.id) ?? 0) + 1);
    monsters.push({ id: monsters.length, roomId: room.id, pos, kind: issue ? monsterKind(issue.labels) : "todo", issue });
  }

  // Coffres : top 15 % des fichiers par taille (au moins 1), plafonnés.
  const allFiles: { file: FileEntry; roomId: number }[] = [];
  filesByRoom.forEach((files, roomId) => files.forEach((file) => allFiles.push({ file, roomId })));
  allFiles.sort((a, b) => b.file.size - a.file.size || compareStrings(a.file.path, b.file.path));
  const chestCount = Math.min(MAX_CHESTS, allFiles.length === 0 ? 0 : Math.max(1, Math.ceil(allFiles.length * 0.15)));
  const chestRng = rng.fork("chests");
  const chests: Chest[] = [];
  for (let rank = 0; rank < chestCount; rank++) {
    const { file, roomId } = allFiles[rank];
    const pos = cells.take(roomId, chestRng);
    if (!pos) continue;
    chests.push({
      id: chests.length,
      roomId,
      pos,
      file: file.path,
      size: file.size,
      item: itemForFile(file.path),
      rarity: rarityFor(rank, chestCount),
    });
  }

  return { spawn, monsters, boss, chests, npcs };
}
