import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { Rng, compareStrings, hash128 } from "@/lib/dungeon/rng";

const draw = (rng: Rng, n: number) => Array.from({ length: n }, () => rng.nextUint32());

describe("hash128", () => {
  it("est stable (valeurs figées : toute variation casse les donjons partagés)", () => {
    expect(hash128("facebook/react@abc1234")).toMatchInlineSnapshot(`
      [
        134171088,
        3187493347,
        4279852708,
        1387949836,
      ]
    `);
  });
});

describe("Rng", () => {
  it("donne la même suite pour le même seed", () => {
    expect(draw(Rng.fromSeed("a"), 50)).toEqual(draw(Rng.fromSeed("a"), 50));
  });

  it("donne des suites différentes pour des seeds différents", () => {
    expect(draw(Rng.fromSeed("a"), 10)).not.toEqual(draw(Rng.fromSeed("b"), 10));
  });

  it("suite figée pour un seed connu", () => {
    expect(draw(Rng.fromSeed("git-dungeon"), 5)).toMatchInlineSnapshot(`
      [
        2438397404,
        597497319,
        3914872844,
        2275565913,
        1209909744,
      ]
    `);
  });

  it("fork ne dépend pas des tirages déjà faits sur le parent", () => {
    const fresh = Rng.fromSeed("s");
    const used = Rng.fromSeed("s");
    draw(used, 100);
    expect(draw(fresh.fork("layout"), 20)).toEqual(draw(used.fork("layout"), 20));
    expect(draw(fresh.fork("layout"), 5)).not.toEqual(draw(fresh.fork("populate"), 5));
  });

  it("fromState reprend exactement là où le flux s'était arrêté", () => {
    const rng = Rng.fromSeed("partie");
    draw(rng, 7);
    const resumed = Rng.fromState(rng.state());
    expect(draw(resumed, 20)).toEqual(draw(rng, 20));
  });

  it("int reste dans ses bornes et next dans [0, 1)", () => {
    fc.assert(
      fc.property(fc.string(), fc.integer({ min: -1000, max: 1000 }), fc.nat(50), (seed, min, span) => {
        const rng = Rng.fromSeed(seed);
        for (let i = 0; i < 20; i++) {
          const v = rng.int(min, min + span);
          if (v < min || v > min + span || !Number.isInteger(v)) return false;
          const f = rng.next();
          if (f < 0 || f >= 1) return false;
        }
        return true;
      }),
    );
  });

  it("int couvre toutes les valeurs d'un d6 de façon équilibrée", () => {
    const rng = Rng.fromSeed("d6");
    const counts = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 6000; i++) counts[rng.int(1, 6) - 1]++;
    for (const c of counts) expect(c).toBeGreaterThan(850);
  });

  it("weightedIndex ignore les poids nuls", () => {
    const rng = Rng.fromSeed("w");
    for (let i = 0; i < 200; i++) expect(rng.weightedIndex([0, 3, 0, 1])).toBeOneOf([1, 3]);
    expect(() => rng.weightedIndex([0, 0])).toThrow();
  });

  it("shuffle est une permutation et ne modifie pas l'entrée", () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = Rng.fromSeed("x").shuffle(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...out].sort((a, b) => a - b)).toEqual(input);
  });
});

describe("compareStrings", () => {
  it("compare par unités de code, sans dépendre de la locale", () => {
    expect(["b", "B", "a", "é", "e"].sort(compareStrings)).toEqual(["B", "a", "b", "e", "é"]);
  });
});
