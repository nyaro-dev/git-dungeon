import type { RepoSnapshot } from "@/lib/ingest/snapshot";
import { carve } from "./carve";
import { buildFolderTree, type FileEntry } from "./folders";
import { layoutRooms } from "./layout";
import { populate } from "./populate";
import { Rng, compareStrings } from "./rng";
import type { DungeonModel, Room } from "./types";
import { GENERATOR_VERSION } from "./version";

const COMMITS_PER_ROOM = 5;

export function dungeonSeed(fullName: string, sha: string): string {
  return `v${GENERATOR_VERSION}:${fullName}@${sha}`;
}

function dominantLanguage(languages: RepoSnapshot["languages"]): string | null {
  let best: string | null = null;
  for (const [name, bytes] of Object.entries(languages).sort(([a], [b]) => compareStrings(a, b))) {
    if (best === null || bytes > languages[best]) best = name;
  }
  return best;
}

/**
 * Snapshot → donjon. Pur et déterministe : même snapshot, même version du
 * générateur ⇒ même `DungeonModel`, sur toutes les machines.
 */
export function generateDungeon(snapshot: RepoSnapshot): DungeonModel {
  const seed = dungeonSeed(snapshot.fullName, snapshot.sha);
  const rng = Rng.fromSeed(seed);
  const tree = buildFolderTree(snapshot.tree);
  const repoName = snapshot.fullName.slice(snapshot.fullName.indexOf("/") + 1);

  const layout = layoutRooms(tree, repoName, rng.fork("layout"));
  const carved = carve(layout);

  // Les ids des salles de dossiers suivent l'ordre de `tree.nodes` ; les salles synthétiques n'ont pas de fichiers.
  const idOfFolder = new Map(tree.nodes.map((node, id) => [node.path, id]));
  const filesByRoom: FileEntry[][] = layout.rooms.map((room) =>
    room.id < tree.nodes.length ? tree.nodes[room.id].files : [],
  );

  const commitShas: string[][] = layout.rooms.map(() => []);
  const detailed = snapshot.commits
    .filter((commit) => commit.files !== undefined)
    .sort((a, b) => compareStrings(b.date, a.date) || compareStrings(a.sha, b.sha));
  for (const commit of detailed) {
    const touched = new Set<number>();
    for (const file of commit.files!) touched.add(idOfFolder.get(tree.folderOf(file)) ?? 0);
    for (const id of [...touched].sort((a, b) => a - b)) {
      if (commitShas[id].length < COMMITS_PER_ROOM) commitShas[id].push(commit.sha);
    }
  }

  const rooms: Room[] = layout.rooms.map((room) => ({
    id: room.id,
    kind: room.kind,
    path: room.path,
    name: room.name,
    depth: room.depth,
    parentId: room.parentId,
    rect: carved.rects[room.id],
    fileCount: room.fileCount,
    commitShas: commitShas[room.id],
  }));

  // Titres des commits référencés par les salles : matière des événements et de la narration.
  const commits: DungeonModel["commits"] = {};
  for (const commit of detailed) {
    if (rooms.some((r) => r.commitShas.includes(commit.sha))) {
      commits[commit.sha] = { title: commit.message.split("\n")[0].slice(0, 120), author: commit.author };
    }
  }

  const doors = carved.corridors.flatMap((corridor) => corridor.doors);
  const population = populate(snapshot, rooms, carved.rects, doors, filesByRoom, rng.fork("populate"));

  return {
    version: GENERATOR_VERSION,
    seed,
    repo: { fullName: snapshot.fullName, sha: snapshot.sha, language: dominantLanguage(snapshot.languages) },
    width: carved.width,
    height: carved.height,
    rows: carved.rows,
    rooms,
    corridors: carved.corridors,
    spawn: population.spawn,
    entranceRoomId: rooms.find((room) => room.kind === "hall")!.id,
    exitRoomId: layout.headId,
    sealedDoor: carved.sealedDoor,
    monsters: population.monsters,
    boss: population.boss,
    chests: population.chests,
    npcs: population.npcs,
    commits,
  };
}
