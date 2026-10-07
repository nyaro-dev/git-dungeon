import { describe, expect, it } from "vitest";
import { MAX_FOLDER_ROOMS, buildFolderTree } from "@/lib/dungeon/folders";

const blob = (path: string, size = 100) => ({ path, size, type: "blob" as const });

describe("buildFolderTree", () => {
  it("donne un seul nœud racine pour un repo vide", () => {
    const tree = buildFolderTree([]);
    expect(tree.nodes.map((n) => n.path)).toEqual([""]);
  });

  it("rattache les fichiers à leur dossier et crée les ancêtres", () => {
    const tree = buildFolderTree([blob("README.md"), blob("src/lib/a.ts"), blob("src/b.ts")]);
    expect(tree.nodes.map((n) => [n.path, n.depth, n.parent, n.files.length])).toEqual([
      ["", 0, null, 1],
      ["src", 1, "", 1],
      ["src/lib", 2, "src", 1],
    ]);
    expect(tree.nodes[0].children).toEqual(["src"]);
  });

  it("ignore les entrées de type tree et les dossiers sans fichier", () => {
    const tree = buildFolderTree([
      { path: "empty", size: 0, type: "tree" },
      blob("a.txt"),
    ]);
    expect(tree.nodes.map((n) => n.path)).toEqual([""]);
  });

  it("fusionne les dossiers au-delà de la profondeur 3", () => {
    const tree = buildFolderTree([blob("a/b/c/d/e/deep.ts"), blob("a/b/c/x.ts")]);
    expect(tree.nodes.map((n) => n.path)).toEqual(["", "a", "a/b", "a/b/c"]);
    expect(tree.nodes.at(-1)!.files.map((f) => f.path)).toEqual(["a/b/c/d/e/deep.ts", "a/b/c/x.ts"]);
    expect(tree.folderOf("a/b/c/d/e/deep.ts")).toBe("a/b/c");
  });

  it(`plafonne à ${MAX_FOLDER_ROOMS} nœuds en absorbant les feuilles les plus légères`, () => {
    const files = [];
    for (let i = 0; i < 100; i++) {
      // pkg-000 a 1 fichier, pkg-001 en a 2… : les petits paquets doivent disparaître en premier.
      for (let j = 0; j <= i % 5; j++) files.push(blob(`packages/pkg-${String(i).padStart(3, "0")}/f${j}.ts`));
    }
    const tree = buildFolderTree(files);
    expect(tree.nodes.length).toBe(MAX_FOLDER_ROOMS);
    const total = tree.nodes.reduce((sum, n) => sum + n.files.length, 0);
    expect(total).toBe(files.length);
    // Un fichier d'un dossier absorbé est retrouvé dans son ancêtre.
    expect(tree.folderOf("packages/pkg-000/f0.ts")).toBe("packages");
    expect(tree.folderOf("packages/pkg-004/f0.ts")).toBe("packages/pkg-004");
  });

  it("ne dépend pas de l'ordre des entrées", () => {
    const entries = [blob("z/1.ts"), blob("a/2.ts"), blob("m/n/3.ts"), blob("4.md")];
    const a = buildFolderTree(entries).nodes;
    const b = buildFolderTree(entries.slice().reverse()).nodes;
    expect(a).toEqual(b);
  });
});
