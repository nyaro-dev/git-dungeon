import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { MAX_FOLDER_ROOMS } from "@/lib/dungeon/folders";
import { generateDungeon } from "@/lib/dungeon/generate";
import { validateDungeon } from "@/lib/dungeon/validate";
import type { RepoSnapshot } from "@/lib/ingest/snapshot";

const segment = fc.constantFrom("src", "lib", "app", "docs", "test", "a", "b", "c", "core", "ui", "x-y", "ÉtÉ", "日本");
const fileName = fc.constantFrom("index.ts", "README.md", "data.json", "style.css", "logo.png", "Makefile", "main.go");
const filePath = fc
  .tuple(fc.array(segment, { minLength: 0, maxLength: 7 }), fileName)
  .map(([dirs, name]) => [...dirs, name].join("/"));
const isoDate = fc
  .integer({ min: Date.UTC(2010, 0, 1), max: Date.UTC(2026, 9, 1) })
  .map((ms) => new Date(ms).toISOString());

const snapshotArb: fc.Arbitrary<RepoSnapshot> = fc.record({
  fullName: fc.constantFrom("o/r", "acme/forge", "big/monorepo"),
  sha: fc.stringMatching(/^[0-9a-f]{40}$/),
  defaultBranch: fc.constant("main"),
  stars: fc.nat(100000),
  createdAt: isoDate,
  pushedAt: isoDate,
  tree: fc
    .uniqueArray(filePath, { maxLength: 800, size: "large" })
    .chain((paths) =>
      fc.tuple(...paths.map((path) => fc.nat(200000).map((size) => ({ path, size, type: "blob" as const })))),
    ),
  issues: fc
    .uniqueArray(fc.integer({ min: 1, max: 99999 }), { maxLength: 100, size: "medium" })
    .chain((numbers) =>
      fc.tuple(
        ...numbers.map((number) =>
          fc.record({
            number: fc.constant(number),
            title: fc.string({ maxLength: 60 }),
            comments: fc.nat(500),
            createdAt: isoDate,
            labels: fc.array(fc.constantFrom("bug", "enhancement", "help wanted", "Feature"), { maxLength: 3 }),
          }),
        ),
      ),
    ),
  commits: fc.array(
    fc.record({
      sha: fc.stringMatching(/^[0-9a-f]{40}$/),
      message: fc.string({ maxLength: 80 }),
      date: isoDate,
      author: fc.constantFrom("ana", "bo", "cy"),
      files: fc.option(fc.array(filePath, { maxLength: 6 }), { nil: undefined }),
    }),
    { maxLength: 30 },
  ),
  contributors: fc.uniqueArray(
    fc.record({ login: fc.string({ minLength: 1, maxLength: 12 }), avatarUrl: fc.constant("https://example.test/a.png"), contributions: fc.nat(5000) }),
    { maxLength: 10, selector: (c) => c.login },
  ),
  languages: fc.dictionary(fc.constantFrom("TypeScript", "Go", "Rust", "CSS"), fc.nat(1_000_000)),
  truncated: fc.boolean(),
});

describe("generateDungeon — propriétés", () => {
  it("tout snapshot donne un donjon valide, et toujours le même", () => {
    const roomCounts: number[] = [];
    fc.assert(
      fc.property(snapshotArb, (snapshot) => {
        const model = generateDungeon(snapshot);
        roomCounts.push(model.rooms.length);
        expect(validateDungeon(model)).toEqual([]);
        expect(generateDungeon(snapshot)).toStrictEqual(model);
      }),
      { numRuns: 120 },
    );
    // Garde-fou : le test ne vaut que s'il couvre aussi les gros repos, plafond de salles compris.
    expect(roomCounts.filter((n) => n >= MAX_FOLDER_ROOMS).length).toBeGreaterThan(10);
    expect(roomCounts.filter((n) => n <= 5).length).toBeGreaterThan(0);
  }, 120_000);

  it("monorepo géant (2 000 fichiers, centaines de dossiers) : plafonné et valide", () => {
    const tree: RepoSnapshot["tree"] = [];
    for (let i = 0; i < 2000; i++) {
      tree.push({ path: `packages/p${i % 250}/src/deep/er/f${i}.ts`, size: (i * 7919) % 50000, type: "blob" });
    }
    const model = generateDungeon({
      fullName: "big/monorepo",
      sha: "1".repeat(40),
      defaultBranch: "main",
      stars: 1,
      createdAt: "2020-01-01T00:00:00Z",
      pushedAt: "2026-01-01T00:00:00Z",
      tree,
      issues: Array.from({ length: 100 }, (_, i) => ({
        number: i + 1,
        title: `issue ${i}`,
        comments: i,
        createdAt: `2020-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`,
        labels: i % 2 ? ["bug"] : [],
      })),
      commits: [],
      contributors: [],
      languages: { TypeScript: 1 },
      truncated: true,
    });
    expect(validateDungeon(model)).toEqual([]);
    expect(model.rooms.filter((r) => r.kind !== "head").length).toBeLessThanOrEqual(MAX_FOLDER_ROOMS);
    expect(model.monsters.length).toBe(40);
  });
});
