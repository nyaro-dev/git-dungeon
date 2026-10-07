import type { RepoSnapshot } from "@/lib/ingest/snapshot";
import { compareStrings } from "./rng";

/** Au-delà, un dossier est fusionné dans son ancêtre de cette profondeur. */
export const MAX_FOLDER_DEPTH = 3;
/** Salles de dossiers, hall compris (HEAD et l'éventuelle antichambre synthétique en plus). */
export const MAX_FOLDER_ROOMS = 60;

export type FileEntry = { path: string; size: number };

export type FolderNode = {
  /** "" pour la racine. */
  path: string;
  depth: number;
  parent: string | null;
  /** Triés par chemin. */
  children: string[];
  /** Fichiers rattachés directement à ce nœud après fusion, triés par chemin. */
  files: FileEntry[];
};

export type FolderTree = {
  /** Triés par chemin : la racine "" est toujours en tête. */
  nodes: FolderNode[];
  /** Nœud qui contient un chemin de fichier, après fusions. */
  folderOf: (filePath: string) => string;
};

function parentPath(path: string): string | null {
  if (path === "") return null;
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

function depthOf(path: string): number {
  return path === "" ? 0 : path.split("/").length;
}

/** Dossier d'un fichier, tronqué à `MAX_FOLDER_DEPTH`. */
function truncatedDir(filePath: string): string {
  const segments = filePath.split("/");
  segments.pop();
  return segments.slice(0, MAX_FOLDER_DEPTH).join("/");
}

/**
 * Construit l'arbre des dossiers d'un snapshot : profondeur bornée à 3, puis
 * fusion des feuilles les plus légères dans leur parent jusqu'à ≤ 60 nœuds.
 * Seuls les dossiers contenant (récursivement) au moins un fichier comptent.
 */
export function buildFolderTree(tree: RepoSnapshot["tree"]): FolderTree {
  const nodes = new Map<string, FolderNode>();

  const ensure = (path: string): FolderNode => {
    const existing = nodes.get(path);
    if (existing) return existing;
    const parent = parentPath(path);
    const node: FolderNode = { path, depth: depthOf(path), parent, children: [], files: [] };
    nodes.set(path, node);
    if (parent !== null) ensure(parent).children.push(path);
    return node;
  };

  ensure("");
  const blobs = tree
    .filter((entry) => entry.type === "blob")
    .slice()
    .sort((a, b) => compareStrings(a.path, b.path));
  for (const blob of blobs) {
    ensure(truncatedDir(blob.path)).files.push({ path: blob.path, size: blob.size });
  }

  // Fusion : on absorbe la feuille la plus légère (puis la plus profonde, puis le
  // plus petit chemin) dans son parent, jusqu'à passer sous le plafond.
  const redirects = new Map<string, string>();
  while (nodes.size > MAX_FOLDER_ROOMS) {
    let victim: FolderNode | null = null;
    for (const node of nodes.values()) {
      if (node.parent === null || node.children.length > 0) continue;
      if (
        victim === null ||
        node.files.length < victim.files.length ||
        (node.files.length === victim.files.length &&
          (node.depth > victim.depth ||
            (node.depth === victim.depth && compareStrings(node.path, victim.path) < 0)))
      ) {
        victim = node;
      }
    }
    if (victim === null) break; // impossible tant qu'il reste plus d'un nœud
    const parent = nodes.get(victim.parent!)!;
    parent.files.push(...victim.files);
    parent.children = parent.children.filter((child) => child !== victim.path);
    redirects.set(victim.path, parent.path);
    nodes.delete(victim.path);
  }

  const sorted = [...nodes.values()].sort((a, b) => compareStrings(a.path, b.path));
  for (const node of sorted) {
    node.children.sort(compareStrings);
    node.files.sort((a, b) => compareStrings(a.path, b.path));
  }

  return {
    nodes: sorted,
    folderOf(filePath) {
      let dir = truncatedDir(filePath);
      // Un dossier absent de l'arbre initial (fichier hors snapshot) remonte au premier ancêtre connu.
      while (!nodes.has(dir) && !redirects.has(dir) && dir !== "") dir = parentPath(dir)!;
      while (redirects.has(dir)) dir = redirects.get(dir)!;
      return dir;
    },
  };
}
