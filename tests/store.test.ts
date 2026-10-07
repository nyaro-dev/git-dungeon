import { describe, expect, it } from "vitest";
import { generateDungeon } from "@/lib/dungeon/generate";
import { createGameStore } from "@/lib/game/store";
import { RepoSnapshotSchema } from "@/lib/ingest/snapshot";
import hand from "./fixtures/hand.json";

const model = generateDungeon(RepoSnapshotSchema.parse(hand));

describe("createGameStore", () => {
  it("suit un trajet pas à pas et s'arrête au heurt", () => {
    const store = createGameStore(model);
    const npc = model.npcs[0];
    expect(store.getState().travelTo(npc.pos)).toBe(true);
    const steps = store.getState().path.length;
    for (let i = 0; i < steps; i++) store.getState().advance();

    const { state, path, lastNotice } = store.getState();
    expect(path).toEqual([]);
    expect(lastNotice).toEqual({ type: "bump", entity: { kind: "npc", id: npc.id } });
    expect(state.turn).toBe(steps - 1);
  });

  it("un déplacement manuel annule le trajet en cours", () => {
    const store = createGameStore(model);
    const hall = model.rooms[model.entranceRoomId].rect;
    store.getState().travelTo({ x: hall.x, y: hall.y });
    store.getState().move("north");
    expect(store.getState().path).toEqual([]);
  });

  it("travelTo vers une case inaccessible ne lance rien", () => {
    const store = createGameStore(model);
    const head = model.rooms[model.exitRoomId].rect;
    expect(store.getState().travelTo({ x: head.x, y: head.y })).toBe(false);
    expect(store.getState().path).toEqual([]);
  });

  it("reset revient à l'état initial", () => {
    const store = createGameStore(model);
    store.getState().travelTo(model.npcs[0].pos);
    store.getState().advance();
    store.getState().reset();
    expect(store.getState().state.turn).toBe(0);
    expect(store.getState().state.hero.pos).toEqual(model.spawn);
  });
});
