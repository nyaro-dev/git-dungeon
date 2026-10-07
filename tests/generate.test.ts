import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateDungeon } from "@/lib/dungeon/generate";
import { validateDungeon } from "@/lib/dungeon/validate";
import { RepoSnapshotSchema, type RepoSnapshot } from "@/lib/ingest/snapshot";
import hand from "./fixtures/hand.json";

const fixture = RepoSnapshotSchema.parse(hand);

const minimal = (overrides: Partial<RepoSnapshot> = {}): RepoSnapshot => ({
  fullName: "someone/thing",
  sha: "0000000000000000000000000000000000000000",
  defaultBranch: "main",
  stars: 0,
  createdAt: "2026-01-01T00:00:00Z",
  pushedAt: "2026-01-01T00:00:00Z",
  tree: [],
  issues: [],
  commits: [],
  contributors: [],
  languages: {},
  truncated: false,
  ...overrides,
});

describe("generateDungeon — fixture faite main", () => {
  const model = generateDungeon(fixture);

  it("respecte tous les invariants", () => {
    expect(validateDungeon(model)).toEqual([]);
  });

  it("est déterministe, y compris après aller-retour JSON", () => {
    const again = generateDungeon(RepoSnapshotSchema.parse(structuredClone(hand)));
    expect(again).toStrictEqual(model);
    expect(JSON.parse(JSON.stringify(model))).toStrictEqual(model);
  });

  it("change avec le sha", () => {
    const other = generateDungeon({ ...fixture, sha: "ffffffffffffffffffffffffffffffffffffffff" });
    expect(other.seed).not.toBe(model.seed);
    expect(other.rows).not.toEqual(model.rows);
  });

  it("transpose le repo : salles, boss, monstres, PNJ, coffres", () => {
    expect(model.rooms.find((r) => r.kind === "hall")!.name).toBe("tiny-forge");
    // Dossiers fusionnés à la profondeur 3 : src/core/internal/quench → src/core/internal.
    expect(model.rooms.map((r) => r.path)).not.toContain("src/core/internal/quench");
    expect(model.rooms.map((r) => r.path)).toContain("src/core/internal");
    // La plus vieille issue (#3) est le boss ; les 4 autres sont des monstres.
    expect(model.boss.issue?.number).toBe(3);
    expect(model.monsters.map((m) => m.issue?.number).sort()).toEqual([17, 22, 31, 40]);
    expect(model.monsters.find((m) => m.issue?.number === 22)!.kind).toBe("bug");
    expect(model.monsters.find((m) => m.issue?.number === 40)!.kind).toBe("feature-creep");
    // Top 3 contributeurs seulement.
    expect(model.npcs.map((n) => n.login)).toEqual(["mira", "tobias", "sana"]);
    // 15 % de 28 fichiers → 5 coffres, le plus gros (logo.png) est légendaire.
    expect(model.chests).toHaveLength(5);
    expect(model.chests[0]).toMatchObject({ file: "docs/assets/logo.png", item: "gem", rarity: "legendary" });
    expect(model.repo.language).toBe("TypeScript");
  });

  it("rattache les commits détaillés aux salles qu'ils touchent", () => {
    const core = model.rooms.find((r) => r.path === "src/core")!;
    expect(core.commitShas).toEqual(["4f2a9c1e0b7d3a5f6e8c9b0a1d2e3f4a5b6c7d8e"]);
    const internal = model.rooms.find((r) => r.path === "src/core/internal")!;
    expect(internal.commitShas).toEqual(["b2c3d4e5f60718293a4b5c6d7e8f901234567890"]);
  });

  it("carte figée (toute variation impose d'incrémenter GENERATOR_VERSION)", () => {
    expect(model.rows.join("\n")).toMatchSnapshot();
  });
});

// Vrais repos figés par `pnpm fixture` : chaque nouveau fichier est couvert automatiquement.
const realFixtures = readdirSync(join(__dirname, "fixtures"))
  .filter((file) => file.endsWith(".json") && file !== "hand.json")
  .sort();

describe.runIf(realFixtures.length > 0).each(realFixtures)("generateDungeon — vrai repo %s", (file) => {
  const snapshot = RepoSnapshotSchema.parse(JSON.parse(readFileSync(join(__dirname, "fixtures", file), "utf8")));
  const model = generateDungeon(snapshot);

  it("respecte tous les invariants", () => {
    expect(validateDungeon(model)).toEqual([]);
  });

  it("est déterministe", () => {
    expect(generateDungeon(structuredClone(snapshot))).toStrictEqual(model);
  });

  it("carte figée", () => {
    expect(model.rows.join("\n")).toMatchSnapshot();
  });
});

describe("generateDungeon — cas limites", () => {
  it("repo vide : hall → antichambre → HEAD, boss générique", () => {
    const model = generateDungeon(minimal());
    expect(validateDungeon(model)).toEqual([]);
    expect(model.rooms.map((r) => r.kind)).toEqual(["hall", "antechamber", "head"]);
    expect(model.boss).toMatchObject({ name: "Legacy Code", issue: null });
    expect(model.chests).toEqual([]);
    expect(model.repo.language).toBeNull();
  });

  it("un seul fichier : un coffre dans le hall", () => {
    const model = generateDungeon(minimal({ tree: [{ path: "index.js", size: 10, type: "blob" }] }));
    expect(validateDungeon(model)).toEqual([]);
    expect(model.chests).toHaveLength(1);
    expect(model.chests[0].roomId).toBe(model.entranceRoomId);
  });

  it("repo calme (sans issue) : monstres TODO génériques", () => {
    const model = generateDungeon({ ...fixture, issues: [] });
    expect(validateDungeon(model)).toEqual([]);
    expect(model.boss.name).toBe("Legacy Code");
    expect(model.monsters.length).toBeGreaterThan(0);
    expect(model.monsters.every((m) => m.kind === "todo" && m.issue === null)).toBe(true);
  });

  it("une seule issue : elle devient le boss, et le donjon reste calme", () => {
    const model = generateDungeon({ ...fixture, issues: fixture.issues.slice(0, 1) });
    expect(validateDungeon(model)).toEqual([]);
    expect(model.boss.issue?.number).toBe(3);
    expect(model.monsters.every((m) => m.kind === "todo")).toBe(true);
  });
});
