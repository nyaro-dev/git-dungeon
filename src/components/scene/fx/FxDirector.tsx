"use client";

import { useEffect } from "react";
import { useGameStore } from "@/components/game/GameContext";
import type { Point } from "@/lib/dungeon/types";
import { STEP } from "@/lib/game/grid";
import type { EntityRef, MonsterState } from "@/lib/game/types";
import { ACCENT, issueColor } from "@/lib/theme";
import { SCENE_PALETTE } from "../palette";
import { useFx } from "./fx";

/**
 * Traduit chaque lot d'événements du jeu (`state.events`, signalé par `seq`) en
 * réactions visuelles (GAMEDESIGN.md §4) : poussière, étincelles, débris de
 * poussée contre un mur, gerbe à la mort ou à la découverte d'une salle,
 * secousse de caméra proportionnelle aux dégâts. Aucune règle ici.
 */
export function FxDirector() {
  const store = useGameStore();
  const fx = useFx();

  useEffect(
    () =>
      store.subscribe((s, prev) => {
        if (s.seq === prev.seq) return;
        const { hero, events, monsters } = s.state;
        const model = s.world.model;
        const at = (p: Point, y = 0.05): [number, number, number] => [p.x, y, p.y];
        const ahead = { x: hero.pos.x + STEP[hero.facing].x, y: hero.pos.y + STEP[hero.facing].y };
        const colorOf = (m: MonsterState | undefined) => (m?.issue != null ? issueColor(m.issue) : SCENE_PALETTE.todoMonster);
        const monster = (id: number) => monsters.find((m) => m.id === id);

        for (const e of events) {
          switch (e.type) {
            case "moved":
            case "walked":
              fx.burst({ at: at(e.from), count: 4, color: "#b8acd9", speed: 0.9, up: 0.15, gravity: -1, life: 0.35, size: 0.05 });
              break;
            case "jumped":
              fx.burst({ at: at(e.to), count: 12, color: ACCENT, speed: 1.6, up: 0.3, gravity: -2, life: 0.45, size: 0.05 });
              break;
            case "blocked":
              fx.shake(0.12);
              break;
            case "sealed":
              fx.shake(0.3);
              fx.burst({ at: at(ahead, 0.5), count: 14, color: SCENE_PALETTE.sealed, speed: 2.2, up: 0.5, gravity: -3, life: 0.6 });
              break;
            case "bump":
              bumpFx(e.entity);
              break;
            case "combat-start":
              fx.shake(0.2);
              break;
            case "damage": {
              // Gel ∝ force du coup (« hit stop »), plus long contre un mur.
              fx.hitstop(e.source === "wall" || e.source === "collision" ? 100 : e.amount >= 6 ? 120 : 60);
              // Secousse ∝ dégâts ; plus forte si c'est le héros qui encaisse.
              fx.shake(Math.min(0.6, e.amount * (e.unit.kind === "hero" ? 0.07 : 0.045)));
              const color = e.unit.kind === "hero" ? SCENE_PALETTE.boss : colorOf(monster(e.unit.id));
              fx.burst({ at: at(e.at, 0.45), count: 6 + e.amount, color, speed: 2.4, up: 0.5, life: 0.45 });
              if (e.source === "wall" || e.source === "collision") {
                fx.burst({ at: at(e.at, 0.2), count: 14, color: "#6B6F86", speed: 3, up: 0.7, gravity: -9, life: 0.7, size: 0.07 });
              }
              break;
            }
            case "killed":
              if (e.unit.kind === "monster") {
                fx.slowmo(0.3, 150);
                fx.burst({ at: at(e.at, 0.4), count: 34, color: colorOf(monster(e.unit.id)), speed: 3.4, up: 0.8, gravity: -5, life: 0.9, size: 0.08 });
              }
              break;
            case "whiff":
              fx.burst({ at: at(e.at, 0.15), count: 5, color: "#b8acd9", speed: 1, up: 0.3, gravity: -2, life: 0.3, size: 0.05 });
              break;
            case "heal":
              fx.burst({ at: at(e.at, 0.3), count: 16, color: ACCENT, speed: 1, up: 1, gravity: 1.5, life: 1, size: 0.05 });
              break;
            case "spawned":
              fx.burst({ at: at(e.at, 0.3), count: 14, color: colorOf(monster(e.monster)), speed: 1.8, up: 0.6, life: 0.6 });
              break;
            case "entered-room":
              if (e.firstVisit) fx.burst({ at: at(hero.pos, 0.4), count: 22, color: ACCENT, speed: 2.6, up: 0.85, gravity: -5, life: 0.8, size: 0.07 });
              break;
            case "chest-opened": {
              const chest = model.chests[e.chest];
              const legendary = chest.rarity === "legendary";
              fx.shake(legendary ? 0.25 : 0.1);
              fx.burst({ at: at(chest.pos, 0.4), count: legendary ? 60 : 30, color: SCENE_PALETTE.rarity[chest.rarity], speed: 2.6, up: 0.95, gravity: -4, life: 1.1, size: 0.07 });
              fx.burst({ at: at(chest.pos, 0.6), count: 12, color: ACCENT, speed: 1.2, up: 1, gravity: 1, life: 1.2, size: 0.05 });
              break;
            }
            case "secret-found":
              // Le mur s'effondre : débris et poussière.
              fx.shake(0.3);
              fx.burst({ at: at(e.at, 0.3), count: 26, color: "#6B6F86", speed: 3, up: 0.7, gravity: -9, life: 0.8, size: 0.08 });
              fx.burst({ at: at(e.at, 0.4), count: 18, color: "#E8F0FF", speed: 1.5, up: 0.4, gravity: 0.5, life: 1.2, size: 0.05 });
              break;
            case "locked":
              fx.shake(0.12);
              fx.burst({ at: at(e.at, 0.5), count: 8, color: SCENE_PALETTE.rarity.legendary, speed: 1, up: 0.5, life: 0.5, size: 0.05 });
              break;
            case "key-found":
              fx.burst({ at: at(hero.pos, 0.9), count: 40, color: SCENE_PALETTE.rarity.legendary, speed: 2.2, up: 1, gravity: -2, life: 1.4, size: 0.07 });
              break;
            case "fountain":
              fx.burst({ at: at(ahead, 0.5), count: 30, color: "#3FD8F5", speed: 1.8, up: 1, gravity: -5, life: 1, size: 0.06 });
              break;
            case "teleported":
              fx.burst({ at: at(e.from, 0.5), count: 30, color: ACCENT, speed: 2, up: 0.6, gravity: 0, life: 0.7, size: 0.06 });
              fx.burst({ at: at(e.to, 0.5), count: 30, color: ACCENT, speed: 2, up: 0.6, gravity: 0, life: 0.7, size: 0.06 });
              break;
            case "cache-opened":
              fx.burst({ at: at(ahead, 0.4), count: 30, color: ACCENT, speed: 2.4, up: 0.95, gravity: -4, life: 1.1, size: 0.07 });
              break;
            case "stunned":
              fx.burst({ at: at(e.at, 0.9), count: 18, color: "#FFE14D", speed: 1.4, up: 0.2, gravity: 0, life: 0.9, size: 0.06 });
              break;
            case "boss-intro":
              fx.shake(0.35);
              break;
            case "boss-phase": {
              const b = monsters.find((m) => m.archetype === "boss");
              fx.shake(0.6);
              if (b) fx.burst({ at: at(b.pos, 0.8), count: 50, color: SCENE_PALETTE.boss, speed: 4, up: 0.7, gravity: -4, life: 1.1, size: 0.09 });
              break;
            }
            case "combat-won":
            case "won":
              fx.shake(0.25);
              fx.burst({ at: at(hero.pos, 0.3), count: e.type === "won" ? 80 : 40, color: ACCENT, speed: 4.5, up: 0.9, gravity: -6, life: 1.3, size: 0.08 });
              break;
          }
        }

        function bumpFx(entity: EntityRef) {
          if (entity.kind === "chest") {
            const rarity = model.chests[entity.id].rarity;
            fx.burst({ at: at(ahead, 0.4), count: 16, color: SCENE_PALETTE.rarity[rarity], speed: 1.8, up: 0.9, gravity: -2, life: 0.9, size: 0.06 });
          } else if (entity.kind === "npc") {
            fx.burst({ at: at(ahead, 0.7), count: 6, color: SCENE_PALETTE.npc, speed: 0.8, up: 1, gravity: 0.5, life: 0.9, size: 0.05 });
          }
        }
      }),
    [store, fx],
  );

  return null;
}
