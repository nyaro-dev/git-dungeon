"use client";

import { Outlines } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Group } from "three";
import { useGame } from "@/components/game/GameContext";
import type { Point } from "@/lib/dungeon/types";
import { featuresFor } from "@/lib/game/features";
import { revealedTiles } from "@/lib/game/visibility";
import { ACCENT } from "@/lib/theme";
import { OUTLINE, toon } from "./Entities";
import { useFx } from "./fx/fx";
import { useDungeonKit } from "./kit";
import { sceneMaterials } from "./materials/library";
import { sceneUniforms } from "./materials/toon";
import { SCENE_PALETTE } from "./palette";


/**
 * Éléments d'exploration (GAMEDESIGN.md §3) : fontaines (fix), portails (revert),
 * caches (feat), portail du hall ; indices visuels des secrets (courant d'air
 * devant le mur fissuré) et du coffre de la Clé HEAD (étincelles dorées).
 * Visibles seulement dans les zones révélées.
 */
export function Features() {
  const kit = useDungeonKit();
  const world = useGame((s) => s.world);
  const visitedRooms = useGame((s) => s.state.visitedRooms);
  const used = useGame((s) => s.state.usedFeatures);
  const revealed = useMemo(() => revealedTiles(world, visitedRooms), [world, visitedRooms]);
  const f = featuresFor(world.model);
  const visible = (p: Point) => revealed[p.y * world.width + p.x] === 1;

  return (
    <group>
      {f.features
        .filter((x) => visible(x.pos))
        .map((x) => {
          const spent = x.kind !== "portal" && used.includes(x.id);
          if (x.kind === "fountain") {
            return (
              <group key={`f${x.id}`} position={[x.pos.x, 0, x.pos.y]}>
                <mesh geometry={kit.P_fountain} material={sceneMaterials().kit}>
                  <Outlines thickness={0.03} color={OUTLINE} />
                </mesh>
                {!spent && <mesh geometry={kit.P_water} material={sceneMaterials().water} />}
              </group>
            );
          }
          if (x.kind === "portal") return <Portal key={`f${x.id}`} at={x.pos} />;
          // Cache (feat) : un coffre aux garnitures lime, tant qu'il n'est pas ouvert.
          if (spent) return null;
          return (
            <group key={`f${x.id}`} position={[x.pos.x, 0, x.pos.y]} rotation-y={Math.PI / 6}>
              <mesh geometry={kit.P_chest} material={sceneMaterials().kit}>
                <Outlines thickness={0.035} color={OUTLINE} />
              </mesh>
              <mesh geometry={kit.P_chest_trim} material={toon(ACCENT, 0.5, "#ffffff")} />
            </group>
          );
        })}
      {f.hallPortal && visible(f.hallPortal) && <Portal at={f.hallPortal} />}
      <Hints revealed={revealed} />
    </group>
  );
}

function Portal({ at }: { at: Point }) {
  const kit = useDungeonKit();
  const core = useRef<Group>(null);
  useFrame(() => {
    if (core.current) core.current.rotation.y = sceneUniforms.uTime.value * 1.5;
  });
  return (
    <group position={[at.x, 0, at.y]} rotation-y={Math.PI / 4}>
      <mesh geometry={kit.P_portal} material={sceneMaterials().kit}>
        <Outlines thickness={0.03} color={OUTLINE} />
      </mesh>
      <group ref={core} position={[0, 0.55, 0]}>
        <mesh geometry={kit.P_portal_core} material={sceneMaterials().portalCore} position={[0, -0.55, 0]} />
      </group>
    </group>
  );
}

/** Indices périodiques : courant d'air (secret non trouvé), étincelles dorées (clé). */
function Hints({ revealed }: { revealed: Uint8Array }) {
  const fx = useFx();
  const world = useGame((s) => s.world);
  const found = useGame((s) => s.state.foundSecrets);
  const opened = useGame((s) => s.state.openedChests);
  const last = useRef(0);
  const f = featuresFor(world.model);

  useFrame((state) => {
    if (fx.reducedMotion) return;
    const t = state.clock.elapsedTime;
    if (t - last.current < 1.3) return;
    last.current = t;
    for (const s of f.secrets) {
      if (found.includes(s.roomId) || !revealed[s.door.y * world.width + s.door.x]) continue;
      fx.burst({ at: [s.door.x, 0.4, s.door.y], count: 5, color: "#E8F0FF", speed: 0.7, up: 0.1, gravity: 0.6, life: 1.2, size: 0.035 });
    }
    if (f.keyChest !== null && !opened.includes(f.keyChest)) {
      const c = world.model.chests[f.keyChest].pos;
      if (revealed[c.y * world.width + c.x]) {
        fx.burst({ at: [c.x, 0.55, c.y], count: 4, color: SCENE_PALETTE.rarity.legendary, speed: 0.5, up: 1, gravity: 0.8, life: 1.1, size: 0.04 });
      }
    }
  });
  return null;
}
