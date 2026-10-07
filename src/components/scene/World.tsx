"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Color, type PointLight } from "three";
import { useGame } from "@/components/game/GameContext";
import type { Point } from "@/lib/dungeon/types";
import { pillarsFor } from "@/lib/game/arena";
import { featuresFor } from "@/lib/game/features";
import { bossDefeated } from "@/lib/game/rules";
import { revealedTiles } from "@/lib/game/visibility";
import { dressDungeon, type Decor, type Placed } from "./env/dressing";
import { Instances, type InstanceSpec } from "./env/Instances";
import { buildIslands } from "./env/islands";
import { useDungeonKit } from "./kit";
import { sceneMaterials } from "./materials/library";
import { MAX_ROOMS_TEX, sceneUniforms, setRoomReveal } from "./materials/toon";
import { DEFAULT_CRYSTAL, LANGUAGE_CRYSTAL, SCENE_PALETTE } from "./palette";

const WHITE = new Color("#ffffff");
const TORCH_LIGHTS = 4;

const placed = (items: Placed[], y = 0): InstanceSpec[] => items.map((p) => ({ x: p.x, y, z: p.y, yaw: p.yaw }));
const decor = (items: Decor[]): InstanceSpec[] => items.map((d) => ({ x: d.x, y: d.y, z: d.z, yaw: d.yaw, scale: d.scale }));

/**
 * Le monde « Néant du dépôt » : îles flottantes, dalles, ponts, rebords, portes
 * et décor (herbe au vent, cristaux, rochers, torches). Le brouillard de guerre
 * passe par la couleur d'instance (cases) et par la texture de révélation (îles).
 */
export function World() {
  const world = useGame((s) => s.world);
  const visitedRooms = useGame((s) => s.state.visitedRooms);
  const sealed = useGame((s) => (bossDefeated(s.state) ? null : s.world.model.sealedDoor));
  const foundSecrets = useGame((s) => s.state.foundSecrets);
  const hasKey = useGame((s) => s.state.hasKey);
  const kit = useDungeonKit();
  const materials = sceneMaterials();
  const model = world.model;
  const features = featuresFor(model);

  const dressing = useMemo(() => dressDungeon(model), [model]);
  const islands = useMemo(() => buildIslands(model), [model]);
  useEffect(() => () => islands.dispose(), [islands]);

  // Îles : brouillard par salle, levé en ~0,45 s à la découverte (vague de révélation).
  const reveal = useRef<{ current: Float32Array; target: Float32Array } | null>(null);
  useEffect(() => {
    reveal.current ??= { current: new Float32Array(MAX_ROOMS_TEX), target: new Float32Array(MAX_ROOMS_TEX) };
    reveal.current.target.fill(0);
    for (const id of visitedRooms) if (id < MAX_ROOMS_TEX) reveal.current.target[id] = 1;
  }, [visitedRooms]);
  useFrame((_, dt) => {
    const r = reveal.current;
    if (!r) return;
    let changed = false;
    for (let i = 0; i < MAX_ROOMS_TEX; i++) {
      if (r.current[i] === r.target[i]) continue;
      // Mouvement réduit (temps figé) : révélation immédiate.
      const step = sceneUniforms.uTime.value === 0 ? 1 : dt / 0.45;
      r.current[i] = r.target[i] > r.current[i] ? Math.min(r.target[i], r.current[i] + step) : r.target[i];
      changed = true;
    }
    if (changed) setRoomReveal(r.current);
  });

  const hiddenSecret = (p: Point) => features.secrets.some((x) => x.door.x === p.x && x.door.y === p.y && !foundSecrets.includes(x.roomId));

  // Placements : calculés une fois par donjon (et quand un secret est trouvé).
  const items = useMemo(
    () => ({
      floors: placed(dressing.floors),
      bridges: placed(dressing.bridges),
      doors: placed(dressing.doors.filter((d) => !hiddenSecret(d))),
      cracks: placed(dressing.doors.filter((d) => hiddenSecret(d))),
      parapets: placed(dressing.parapets),
      grass: decor(dressing.grass),
      crystals: decor(dressing.crystals),
      rocks: decor(dressing.rocks),
      torches: decor(dressing.torches),
      pillars: pillarsFor(model).map((p) => ({ x: p.x, y: 0, z: p.y, yaw: Math.PI / 8 })),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hiddenSecret dépend de foundSecrets, listé
    [dressing, model, foundSecrets],
  );

  // Couleurs : recalculées à chaque salle découverte (brouillard) ou porte descellée.
  const revealed = useMemo(() => revealedTiles(world, visitedRooms), [world, visitedRooms]);
  const colors = useMemo(() => {
    const fogged = (x: number, y: number, base: Color = WHITE) => {
      const c = base.clone();
      if (!revealed[Math.round(y) * world.width + Math.round(x)]) c.multiplyScalar(SCENE_PALETTE.fog);
      return c;
    };
    const head = new Color(SCENE_PALETTE.headFloor).lerp(WHITE, 0.35);
    const seal = new Color(SCENE_PALETTE.sealed);
    const crystal = new Color(LANGUAGE_CRYSTAL[model.repo.language ?? ""] ?? DEFAULT_CRYSTAL);
    const isHead = (p: Placed) => world.roomAt[p.y * world.width + p.x] === model.exitRoomId;
    const isSealed = (p: Placed) => sealed !== null && p.x === sealed.x && p.y === sealed.y;
    const lock = new Color(SCENE_PALETTE.rarity.legendary);
    const isLocked = (p: Placed) => !hasKey && features.lockedDoor !== null && p.x === features.lockedDoor.x && p.y === features.lockedDoor.y;
    return {
      floors: dressing.floors.map((p) => fogged(p.x, p.y, isHead(p) ? head : WHITE)),
      bridges: dressing.bridges.map((p) => fogged(p.x, p.y)),
      doors: dressing.doors.filter((d) => !hiddenSecret(d)).map((p) => fogged(p.x, p.y, isSealed(p) ? seal : isLocked(p) ? lock : WHITE)),
      cracks: dressing.doors.filter((d) => hiddenSecret(d)).map((p) => fogged(p.x, p.y)),
      parapets: dressing.parapets.map((p) => fogged(p.x, p.y)),
      grass: dressing.grass.map((d) => fogged(d.x, d.z)),
      crystals: dressing.crystals.map((d) => fogged(d.x, d.z, crystal)),
      rocks: dressing.rocks.map((d) => fogged(d.x, d.z)),
      torches: dressing.torches.map((d) => fogged(d.x, d.z)),
      pillars: pillarsFor(model).map((p) => fogged(p.x, p.y)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hiddenSecret dépend de foundSecrets, listé
  }, [dressing, revealed, sealed, world, model, foundSecrets, hasKey, features]);

  // Torches éteintes dans le brouillard : seules celles des zones révélées brûlent.
  const litTorches = useMemo(() => dressing.torches.filter((t) => revealed[t.z * world.width + t.x]), [dressing, revealed, world.width]);
  const flames = useMemo(
    () => ({ items: litTorches.map((t) => ({ x: t.x, y: t.y + 0.62, z: t.z, yaw: 0 })), colors: litTorches.map(() => WHITE) }),
    [litTorches],
  );


  return (
    <group>
      <mesh geometry={islands} material={materials.island} raycast={() => null} />
      <Instances geometry={kit.P_floor} material={materials.kit} items={items.floors} colors={colors.floors} />
      <Instances geometry={kit.P_bridge} material={materials.kit} items={items.bridges} colors={colors.bridges} />
      <Instances geometry={kit.P_door} material={materials.kit} items={items.doors} colors={colors.doors} />
      <Instances geometry={kit.P_crack} material={materials.kit} items={items.cracks} colors={colors.cracks} />
      <Instances geometry={kit.P_parapet} material={materials.kit} items={items.parapets} colors={colors.parapets} />
      <Instances geometry={kit.P_grass} material={materials.grass} items={items.grass} colors={colors.grass} />
      <Instances geometry={kit.P_crystal} material={materials.crystal} items={items.crystals} colors={colors.crystals} />
      <Instances geometry={kit.P_rock} material={materials.kit} items={items.rocks} colors={colors.rocks} />
      <Instances geometry={kit.P_torch} material={materials.kit} items={items.torches} colors={colors.torches} />
      <Instances geometry={kit.P_flame} material={materials.flame} items={flames.items} colors={flames.colors} />
      <Instances geometry={kit.P_pillar} material={materials.kit} items={items.pillars} colors={colors.pillars} />
      <TorchLights torches={litTorches} />
    </group>
  );
}

/**
 * Un nombre FIXE de lumières (changer le nombre recompile les shaders), posées
 * sur les torches allumées les plus proches du héros, avec un vacillement.
 */
function TorchLights({ torches }: { torches: Decor[] }) {
  const pos = useGame((s) => s.state.hero.pos);
  const lights = useRef<(PointLight | null)[]>([]);
  const nearest = useMemo(
    () =>
      torches
        .map((t) => ({ t, d: (t.x - pos.x) ** 2 + (t.z - pos.y) ** 2 }))
        .sort((a, b) => a.d - b.d)
        .slice(0, TORCH_LIGHTS)
        .map(({ t }) => t),
    [torches, pos],
  );

  useFrame((state) => {
    const time = state.clock.elapsedTime;
    lights.current.forEach((l, i) => {
      if (!l) return;
      const on = i < nearest.length;
      l.intensity = on ? 3.2 + Math.sin(time * 11.3 + i * 1.7) * 0.4 + Math.sin(time * 6.1 + i) * 0.3 : 0;
    });
  });

  return (
    <>
      {Array.from({ length: TORCH_LIGHTS }, (_, i) => {
        const t = nearest[i];
        return (
          <pointLight
            key={i}
            ref={(l) => {
              lights.current[i] = l;
            }}
            position={t ? [t.x, t.y + 0.85, t.z] : [0, -100, 0]}
            color={SCENE_PALETTE.heroLight}
            intensity={0}
            distance={6}
            decay={1.8}
          />
        );
      })}
    </>
  );
}
