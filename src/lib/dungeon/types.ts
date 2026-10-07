/** Coordonnées en cases. x vers l'est, y vers le sud ; (0, 0) = coin nord-ouest de la grille. */
export type Point = { x: number; y: number };

/** Rectangle de sol d'une salle (murs exclus : ils l'entourent à distance 1). */
export type Rect = { x: number; y: number; w: number; h: number };

/** Légende de `DungeonModel.rows`. */
export const TILE = {
  void: " ",
  wall: "#",
  floor: ".",
  corridor: ",",
  door: "+",
} as const;
export type Tile = (typeof TILE)[keyof typeof TILE];

export type RoomKind = "hall" | "room" | "antechamber" | "head";

export type Room = {
  id: number;
  kind: RoomKind;
  /** Chemin du dossier après fusion ; "" pour le hall, chemin synthétique pour HEAD. */
  path: string;
  name: string;
  /** Distance en salles depuis le hall. */
  depth: number;
  parentId: number | null;
  rect: Rect;
  fileCount: number;
  /** Commits récents (détaillés) ayant touché ce dossier, du plus récent au plus ancien, ≤ 5. */
  commitShas: string[];
};

export type Corridor = {
  from: number;
  to: number;
  /** Porte côté `from`, porte côté `to`. */
  doors: [Point, Point];
  /** Cases de couloir entre les deux portes (portes exclues). */
  cells: Point[];
};

export type IssueRef = {
  number: number;
  title: string;
  comments: number;
  createdAt: string;
  labels: string[];
};

export type MonsterKind = "bug" | "feature-creep" | "issue" | "todo";

export type Monster = {
  id: number;
  roomId: number;
  pos: Point;
  kind: MonsterKind;
  /** null pour les monstres génériques d'un donjon « calme ». */
  issue: IssueRef | null;
};

export type Boss = {
  roomId: number;
  pos: Point;
  name: string;
  /** null : boss générique « Legacy Code » (repo sans issue ouverte). */
  issue: IssueRef | null;
};

export type ItemKind = "sword" | "scroll" | "potion" | "armor" | "gem" | "coin";
export type Rarity = "common" | "rare" | "epic" | "legendary";

export type Chest = {
  id: number;
  roomId: number;
  pos: Point;
  file: string;
  size: number;
  item: ItemKind;
  rarity: Rarity;
};

export type Npc = {
  id: number;
  roomId: number;
  pos: Point;
  login: string;
  avatarUrl: string;
  contributions: number;
};

export type DungeonModel = {
  version: number;
  seed: string;
  repo: { fullName: string; sha: string; language: string | null };
  width: number;
  height: number;
  /** Grille de `height` lignes de `width` caractères, voir `TILE`. */
  rows: string[];
  rooms: Room[];
  corridors: Corridor[];
  spawn: Point;
  entranceRoomId: number;
  exitRoomId: number;
  /** Porte entre l'antichambre et HEAD, scellée tant que le boss vit. */
  sealedDoor: Point;
  monsters: Monster[];
  boss: Boss;
  chests: Chest[];
  npcs: Npc[];
  /** Commits référencés par les salles (`Room.commitShas`) : titre (1re ligne) et auteur. */
  commits: Record<string, { title: string; author: string }>;
};
