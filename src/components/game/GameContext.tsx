"use client";

import { createContext, useContext } from "react";
import { useStore } from "zustand";
import type { GameStore, GameStoreApi } from "@/lib/game/store";

export const GameStoreContext = createContext<GameStoreApi | null>(null);

export function useGameStore(): GameStoreApi {
  const store = useContext(GameStoreContext);
  if (!store) throw new Error("useGameStore doit être utilisé sous <GameStoreContext>");
  return store;
}

/** Sélecteur réactif sur l'état de la partie. */
export function useGame<T>(selector: (s: GameStore) => T): T {
  return useStore(useGameStore(), selector);
}
