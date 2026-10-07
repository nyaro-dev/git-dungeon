import { describe, expect, it } from "vitest";
import { COMMENT_DAMAGE, SWEEP_LENGTH } from "@/lib/game/ai";
import { pillarsFor } from "@/lib/game/arena";
import { generateDungeon } from "@/lib/dungeon/generate";
import type { Point } from "@/lib/dungeon/types";
import { enterCombat, initGame, isPassable, step, type GameAction } from "@/lib/game/rules";
import type { GameState, MonsterState } from "@/lib/game/types";
import { buildWorld } from "@/lib/game/world";
import { RepoSnapshotSchema } from "@/lib/ingest/snapshot";
import hand from "./fixtures/hand.json";

const world = buildWorld(generateDungeon(RepoSnapshotSchema.parse(hand)));
const model = world.model;
const ante = model.rooms.find((r) => r.kind === "antechamber")!;
const pillars = pillarsFor(model);

const play = (s: GameState, ...actions: GameAction[]) => actions.reduce((acc, a) => step(world, acc, a), s);
const bossOf = (s: GameState) => s.monsters.find((m) => m.archetype === "boss")!;

/** Duel contre le boss dans l'antichambre (les autres monstres sont retirés). */
function duel(hero: Point, boss: Partial<MonsterState> = {}, round = 1): GameState {
  const base = initGame(world);
  const b = { ...base.monsters.find((m) => m.archetype === "boss")!, ...boss };
  const s: GameState = { ...base, hero: { ...base.hero, pos: hero, spells: ["script", null] }, monsters: [b] };
  const fought = enterCombat(world, s, ante.id);
  return { ...fought, combat: { ...fought.combat!, round } };
}

describe("piliers LGTM", () => {
  it("l'antichambre en compte, loin des portes et du boss, et ils bloquent le passage", () => {
    expect(pillars.length).toBeGreaterThan(0);
    for (const p of pillars) {
      expect(p.x >= ante.rect.x && p.x < ante.rect.x + ante.rect.w).toBe(true);
      expect(isPassable(world, initGame(world), p)).toBe(false);
      expect(p).not.toEqual(model.boss.pos);
    }
  });

  it("un monstre poussé contre un pilier est étourdi : il saute son tour", () => {
    // Boss collé à un pilier, héros de l'autre côté sur la même ligne : Script le pousse dedans.
    const pillar = pillars[0];
    const dx = pillar.x === ante.rect.x + 1 ? 1 : -1; // le pilier est sur un bord : on vise de l'intérieur
    const bossPos = { x: pillar.x + dx, y: pillar.y };
    const heroPos = { x: pillar.x + 2 * dx, y: pillar.y };
    const s = duel(heroPos, { pos: bossPos });
    const pushed = play(s, { type: "cast", ability: "script", target: bossPos });
    expect(pushed.events).toContainEqual(expect.objectContaining({ type: "stunned" }));
    expect(bossOf(pushed).intent).toBeNull();
    // Son tour suivant est sauté : le héros, pourtant au contact, n'encaisse rien.
    const after = play(pushed, { type: "end-turn" });
    expect(after.hero.hp).toBe(pushed.hero.hp);
  });
});

describe("boss", () => {
  it("annonce son entrée en scène au début du combat", () => {
    const s = duel({ x: model.boss.pos.x, y: model.boss.pos.y + 2 });
    expect(s.events.map((e) => e.type)).toContain("boss-intro");
  });

  it("phase 1 : balaye 3 cases en ligne si le héros y est", () => {
    const s = duel({ x: model.boss.pos.x, y: model.boss.pos.y + 2 });
    expect(bossOf(s).intent).toMatchObject({ kind: "sweep", dir: "south", length: SWEEP_LENGTH });
    const hit = play(s, { type: "end-turn" });
    expect(hit.hero.hp).toBeLessThan(30);
    // Sortir de la ligne avant le coup : rien.
    const dodged = play(s, { type: "move", direction: "east" }, { type: "end-turn" });
    expect(dodged.hero.hp).toBe(30);
  });

  it("phase 1 : invoque un renfort tous les 3 tours", () => {
    const s = duel({ x: model.boss.pos.x + 2, y: model.boss.pos.y + 2 }, {}, 2);
    const t = play(s, { type: "end-turn" }); // planifie au tour 3
    expect(bossOf(t).intent).toEqual({ kind: "summon" });
    const t2 = play(t, { type: "end-turn" });
    expect(t2.events).toContainEqual(expect.objectContaining({ type: "spawned" }));
    expect(t2.monsters.filter((m) => m.alive)).toHaveLength(2);
  });

  it("passe en phase 2 sous la moitié de ses PV, puis marque des cases « commentaire »", () => {
    const b = bossOf(initGame(world));
    const s = duel({ x: model.boss.pos.x, y: model.boss.pos.y + 1 }, { hp: Math.floor(b.maxHp / 2) + 2 });
    const hit = play(s, { type: "cast", ability: "promise-whip", target: model.boss.pos });
    expect(bossOf(hit).phase).toBe(2);
    expect(hit.events).toContainEqual({ type: "boss-phase", phase: 2 });

    const marked = play(hit, { type: "end-turn" }); // tour 1 → planifie au tour… (impair) : commentaires
    const intent = bossOf(marked).intent;
    if (intent?.kind === "comments") {
      expect(intent.cells).toContainEqual(marked.hero.pos);
      expect(intent.damage).toBe(COMMENT_DAMAGE);
      // Rester dessus : explosion au tour suivant.
      const boom = play(marked, { type: "end-turn" });
      expect(boom.hero.hp).toBeLessThanOrEqual(marked.hero.hp - COMMENT_DAMAGE);
    } else {
      // Tour pair : il balaye ; les commentaires viendront au tour d'après.
      const next = play(marked, { type: "end-turn" });
      expect(bossOf(next).intent?.kind).toBe("comments");
    }
  });

  it("vaincre le boss descelle la porte de HEAD", () => {
    const s = duel({ x: model.boss.pos.x, y: model.boss.pos.y + 1 }, { hp: 2 });
    const won = play(s, { type: "cast", ability: "promise-whip", target: model.boss.pos });
    expect(won.status).toBe("exploring");
    expect(isPassable(world, won, model.sealedDoor)).toBe(true);
  });
});
