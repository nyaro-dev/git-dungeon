import { createStore } from "zustand/vanilla";
import type { DungeonModel, Point } from "@/lib/dungeon/types";
import { key } from "./grid";
import { endTurnFrames, findPath, heroAbilities, initGame, reachableInCombat, step, type GameAction } from "./rules";

/** Délai entre deux monstres pendant le tour ennemi (lisibilité de chaque action). */
export const MONSTER_STEP_MS = 420;
import type { AbilityId, Direction, GameEvent, GameState } from "./types";
import { buildWorld, type World } from "./world";

export type GameStore = {
  world: World;
  state: GameState;
  /** Déplacements restants d'un trajet au clic (un par pas, rythmés par l'UI). */
  path: Direction[];
  /** Dernier événement notable, pour le HUD (`aria-live`). */
  lastNotice: GameEvent | null;
  /** Incrémenté à chaque action jouée : la scène réagit une fois par lot d'événements (`state.events`). */
  seq: number;
  /** Capacité en cours de visée (combat), ou null. */
  aiming: AbilityId | null;
  /** Case survolée (aperçu de visée et de déplacement). */
  hover: Point | null;
  /** Le tour ennemi se joue (monstre après monstre) : les commandes du joueur attendent. */
  busy: boolean;

  move: (direction: Direction) => void;
  /** Exploration : trajet vers une case ; combat : déplacement dans la limite des PM, ou lancer si une capacité est visée. */
  travelTo: (goal: Point) => boolean;
  /** Joue le prochain pas du trajet en cours. */
  advance: () => void;
  aim: (ability: AbilityId | null) => void;
  setHover: (p: Point | null) => void;
  cast: (ability: AbilityId, target: Point) => void;
  endTurn: () => void;
  /** Répond au choix de butin : emplacement à remplacer, ou null pour laisser le sort. */
  equip: (slot: 0 | 1 | null) => void;
  reset: () => void;
};

/** Événements dignes d'une ligne dans le HUD (les autres ne font que de l'effet visuel). */
const NOTABLE = new Set<GameEvent["type"]>([
  "sealed",
  "bump",
  "entered-room",
  "won",
  "combat-start",
  "combat-won",
  "hero-dead",
  "killed",
  "denied",
  "spawned",
  "intent-cancelled",
  "boss-intro",
  "boss-phase",
  "stunned",
  "chest-opened",
  "equipped",
  "loot-discarded",
  "secret-found",
  "locked",
  "key-found",
  "fountain",
  "teleported",
  "cache-opened",
]);

/**
 * Store d'une partie. Aucune règle ici : tout passe par `step`, pur. Un store par
 * partie (`createGameStore`), fourni aux composants par un contexte React.
 */
export function createGameStore(model: DungeonModel) {
  const world = buildWorld(model);
  return createStore<GameStore>()((set, get) => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const clearTimers = () => {
      while (timers.length) clearTimeout(timers.pop());
    };
    const dispatch = (action: GameAction) => {
      const next = step(get().world, get().state, action);
      const notice = next.events.findLast((e) => NOTABLE.has(e.type)) ?? null;
      // Un trajet s'arrête dès que quelque chose se passe (heurt, combat, porte scellée…).
      const interrupted = next.events.some((e) => e.type !== "moved" && e.type !== "entered-room");
      set((s) => ({
        state: next,
        lastNotice: notice ?? s.lastNotice,
        path: interrupted ? [] : s.path,
        seq: s.seq + 1,
        // Le combat se termine : plus rien à viser.
        aiming: next.status === "combat" ? s.aiming : null,
      }));
    };

    return {
      world,
      state: initGame(world),
      path: [],
      lastNotice: null,
      seq: 0,
      aiming: null,
      hover: null,
      busy: false,
      move(direction) {
        if (get().busy) return;
        set({ path: [] });
        dispatch({ type: "move", direction });
      },
      travelTo(goal) {
        const { state, aiming, busy } = get();
        if (busy) return false;
        if (state.status === "combat") {
          if (aiming) {
            get().cast(aiming, goal);
            return true;
          }
          const reach = reachableInCombat(get().world, state).get(key(goal));
          set({ path: reach?.path ?? [] });
          return reach !== undefined;
        }
        const path = findPath(get().world, state, goal);
        set({ path: path ?? [] });
        return path !== null;
      },
      advance() {
        if (get().busy) return;
        const [next, ...rest] = get().path;
        if (!next) return;
        set({ path: rest });
        dispatch({ type: "move", direction: next });
      },
      aim(ability) {
        const { state } = get();
        if (ability && (state.status !== "combat" || !heroAbilities(state).includes(ability))) return;
        set({ aiming: get().aiming === ability ? null : ability, path: [] });
      },
      setHover(p) {
        const h = get().hover;
        if ((h === null && p === null) || (h && p && h.x === p.x && h.y === p.y)) return;
        set({ hover: p });
      },
      cast(ability, target) {
        if (get().busy) return;
        set({ path: [] });
        dispatch({ type: "cast", ability, target });
        // Après un lancer réussi, la visée se referme ; refusé, elle reste ouverte.
        if (!get().state.events.some((e) => e.type === "denied")) set({ aiming: null });
      },
      endTurn() {
        if (get().busy || get().state.status !== "combat") return;
        // Le tour ennemi se joue monstre après monstre : une étape toutes les MONSTER_STEP_MS.
        const frames = endTurnFrames(get().world, get().state);
        set({ path: [], aiming: null, busy: frames.length > 1 });
        frames.forEach((frame, i) => {
          const show = () =>
            set((s) => ({
              state: frame,
              lastNotice: frame.events.findLast((e) => NOTABLE.has(e.type)) ?? s.lastNotice,
              seq: s.seq + 1,
              busy: i < frames.length - 1,
            }));
          if (i === 0) show();
          else timers.push(setTimeout(show, i * MONSTER_STEP_MS));
        });
      },
      equip(slot) {
        dispatch({ type: "equip", slot });
      },
      reset() {
        clearTimers();
        set((s) => ({ state: initGame(get().world), path: [], lastNotice: null, seq: s.seq + 1, aiming: null, hover: null, busy: false }));
      },
    };
  });
}

export type GameStoreApi = ReturnType<typeof createGameStore>;
