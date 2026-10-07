"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { DungeonModel } from "@/lib/dungeon/types";
import { ABILITIES } from "@/lib/game/abilities";
import { heroAbilities, type Direction } from "@/lib/game/rules";
import { createGameStore } from "@/lib/game/store";
import { useReducedMotion } from "@/lib/hooks";
import { AnchorContext, AnchorRegistry } from "./anchors";
import { GameStoreContext, useGame, useGameStore } from "./GameContext";
import { Hud } from "./Hud";
import { Tags } from "./Tags";

// three.js n'a rien à faire côté serveur ni dans le bundle de l'accueil.
const GameScene = dynamic(() => import("@/components/scene/GameScene"), {
  ssr: false,
  loading: () => <SceneLoading />,
});

function SceneLoading() {
  return (
    <div className="qm-hud grid h-full place-items-center">
      <p role="status" className="qm-paper rounded-full px-4 py-2 text-sm">
        Allumage des torches…
      </p>
    </div>
  );
}

/** Durée d'un pas lors d'un trajet au clic. */
const STEP_MS = 110;

const KEYS: Record<string, Direction> = {
  ArrowUp: "north",
  ArrowRight: "east",
  ArrowDown: "south",
  ArrowLeft: "west",
  // QWERTY et AZERTY.
  w: "north",
  z: "north",
  d: "east",
  s: "south",
  a: "west",
  q: "west",
};

/** Une partie : un store par donjon, la scène 3D, les contrôles et le HUD. */
export function Game({ model }: { model: DungeonModel }) {
  const [store] = useState(() => createGameStore(model));
  // Dev uniquement : le store est accessible depuis la console pour inspecter une partie.
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    (window as unknown as { __gitDungeon?: unknown }).__gitDungeon = store;
  }, [store]);
  return (
    <GameStoreContext value={store}>
      <GameView />
    </GameStoreContext>
  );
}

function GameView() {
  const store = useGameStore();
  const reducedMotion = useReducedMotion();
  const walking = useGame((s) => s.path.length > 0);
  const repo = useGame((s) => s.world.model.repo.fullName);
  const [anchors] = useState(() => new AnchorRegistry());

  // Clavier : flèches, WASD, ZQSD. Ignoré pendant la saisie dans un champ.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
      const game = store.getState();
      const inCombat = game.state.status === "combat";

      // Combat : 1–4 visent une capacité, Espace/Entrée finissent le tour, Échap annule la visée.
      if (inCombat && /^[1-4]$/.test(e.key)) {
        const ability = heroAbilities(game.state)[Number(e.key) - 1];
        if (!ability) return;
        e.preventDefault();
        if (ABILITIES[ability].target === "self") game.cast(ability, game.state.hero.pos);
        else game.aim(ability);
        return;
      }
      if (inCombat && (e.key === " " || e.key === "Enter")) {
        // Un bouton focalisé garde son propre comportement au clavier.
        if (el?.tagName === "BUTTON") return;
        e.preventDefault();
        game.endTurn();
        return;
      }
      if (e.key === "Escape" && game.aiming) {
        e.preventDefault();
        game.aim(null);
        return;
      }

      const direction = KEYS[e.key] ?? KEYS[e.key.toLowerCase()];
      if (!direction) return;
      e.preventDefault();
      game.move(direction);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store]);

  // Trajet au clic : un pas toutes les STEP_MS tant qu'il en reste.
  useEffect(() => {
    if (!walking) return;
    const id = window.setInterval(() => store.getState().advance(), STEP_MS);
    return () => window.clearInterval(id);
  }, [walking, store]);

  return (
    <div className="hud-frame relative w-full overflow-hidden rounded-[24px]">
      <div className="relative h-[70vh] min-h-[420px] w-full overflow-hidden rounded-[23px] bg-background">
      <AnchorContext value={anchors}>
          <GameScene reducedMotion={reducedMotion} label={`Donjon de ${repo}, vue isométrique`} anchors={anchors} />
          <Tags />
        </AnchorContext>
        <Hud />
      </div>
    </div>
  );
}
