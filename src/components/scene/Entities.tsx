"use client";

import { Outlines } from "@react-three/drei";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { MathUtils, type Group } from "three";
import { useGame, useGameStore } from "@/components/game/GameContext";
import type { Point } from "@/lib/dungeon/types";
import type { Archetype, MonsterState } from "@/lib/game/types";
import { revealedTiles } from "@/lib/game/visibility";
import { issueColor } from "@/lib/theme";
import { useCharacters, type CharacterPart } from "./characters";
import { useFx } from "./fx/fx";
import { useDungeonKit } from "./kit";
import { sceneMaterials } from "./materials/library";
import { createToonMaterial, sceneUniforms } from "./materials/toon";
import { SCENE_PALETTE } from "./palette";

/** Contour des entités : plus épais que le décor (pilier 3 de la DA). */
export const OUTLINE = "#1B1426";
const OUTLINE_THICKNESS = 0.035;
/** Contour des personnages : plus fin, les yeux et détails en ont un aussi. */
export const CHARACTER_OUTLINE = 0.016;
/** Boss : réduit pour tenir sur son socle, posé dessus. */
const BOSS_SCALE = 0.85;
const PEDESTAL_TOP = 0.22;

const materialCache = new Map<string, ReturnType<typeof createToonMaterial>>();
/** Un matériau toon par couleur (et émissif), partagé entre entités identiques. */
export function toon(color: string, emissive = 0, rim = "#B8F0FF") {
  const k = `${color}:${emissive}:${rim}`;
  let m = materialCache.get(k);
  if (!m) {
    m = createToonMaterial({ color, emissive: color, emissiveIntensity: emissive, rim, rimStrength: 0.45 });
    materialCache.set(k, m);
  }
  return m;
}
/** Corps de monstre : couleurs de sommet en gris, teintées par la couleur de l'issue. */
function tinted(color: string) {
  const k = `tinted:${color}`;
  let m = materialCache.get(k);
  if (!m) {
    m = createToonMaterial({ color, vertexColors: true, emissive: color, emissiveIntensity: 0.08, rimStrength: 0.45 });
    materialCache.set(k, m);
  }
  return m;
}
function kitToon() {
  let m = materialCache.get("kit-vertex");
  if (!m) {
    m = createToonMaterial({ vertexColors: true, noise: true, rimStrength: 0.3 });
    materialCache.set("kit-vertex", m);
  }
  return m;
}

/**
 * Monstres, boss, coffres et PNJ. Les monstres viennent de l'état du jeu
 * (positions et PV dynamiques), glissent d'une case à l'autre et regardent le
 * héros. Coffres et socle viennent du kit Blender, personnages du GLB chibi
 * (characters.py). N'apparaissent que dans les zones révélées.
 */
export function Entities() {
  const store = useGameStore();
  const kit = useDungeonKit();
  const chars = useCharacters();
  const heroPos = useGame((s) => s.state.hero.pos);
  const world = useGame((s) => s.world);
  const visitedRooms = useGame((s) => s.state.visitedRooms);
  const monsters = useGame((s) => s.state.monsters);
  const opened = useGame((s) => s.state.openedChests);
  const revealed = useMemo(() => revealedTiles(world, visitedRooms), [world, visitedRooms]);
  const { model } = world;
  const boss = monsters.find((m) => m.archetype === "boss")!;

  const visible = (p: Point) => revealed[p.y * world.width + p.x] === 1;
  const goTo = (p: Point) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    store.getState().travelTo(p);
  };

  return (
    <group>
      {monsters
        .filter((m) => m.alive && m.archetype !== "boss" && visible(m.pos))
        .map((m) => (
          <Unit key={`m${m.id}`} at={m.pos} face={heroPos} seed={m.id} amplitude={0.06} unitId={m.id} onClick={goTo(m.pos)}>
            <MonsterBody monster={m} />
          </Unit>
        ))}
      {visible(model.boss.pos) && (
        // Le socle reste après la victoire : on sait où le boss se tenait.
        <mesh geometry={kit.P_pedestal} material={kitToon()} position={[model.boss.pos.x, 0, model.boss.pos.y]} />
      )}
      {boss.alive && visible(boss.pos) && (
        <Unit at={boss.pos} face={heroPos} seed={99} amplitude={0.05} speed={1.4} unitId={boss.id} onClick={goTo(boss.pos)}>
          <group position={[0, PEDESTAL_TOP, 0]} scale={BOSS_SCALE}>
            <mesh geometry={chars.C_boss} material={tinted(SCENE_PALETTE.boss)}>
              <Outlines thickness={CHARACTER_OUTLINE * 1.5} color={OUTLINE} />
            </mesh>
            <mesh geometry={chars.C_boss_face} material={sceneMaterials().character}>
              <Outlines thickness={CHARACTER_OUTLINE} color={OUTLINE} />
            </mesh>
            {/* Yeux qui brûlent : au-delà de 1, captés par le bloom. */}
            <mesh geometry={chars.C_boss_glow} material={toon("#FFE14D", 2.2, "#ffffff")} />
          </group>
        </Unit>
      )}
      {model.chests
        .filter((c) => !opened.includes(c.id) && visible(c.pos))
        .map((c) => {
          const rarity = SCENE_PALETTE.rarity[c.rarity];
          return (
            <group key={`c${c.id}`} position={[c.pos.x, 0, c.pos.y]} onClick={goTo(c.pos)}>
              <mesh geometry={kit.P_chest} material={kitToon()}>
                <Outlines thickness={OUTLINE_THICKNESS} color={OUTLINE} />
              </mesh>
              <mesh geometry={kit.P_chest_trim} material={toon(rarity, c.rarity === "legendary" ? 0.6 : 0.25, "#ffffff")} />
            </group>
          );
        })}
      {model.npcs
        .filter((n) => visible(n.pos))
        .map((n) => (
          <Unit key={`n${n.id}`} at={n.pos} face={heroPos} seed={50 + n.id} amplitude={0.025} speed={0.8} onClick={goTo(n.pos)}>
            <mesh geometry={chars.C_npc} material={sceneMaterials().character}>
              <Outlines thickness={CHARACTER_OUTLINE} color={OUTLINE} />
            </mesh>
          </Unit>
        ))}
    </group>
  );
}

const MONSTER_PARTS: Record<Exclude<Archetype, "boss">, [CharacterPart, CharacterPart]> = {
  slime: ["C_slime", "C_slime_face"],
  bug: ["C_bug", "C_bug_face"],
  "feature-creep": ["C_creep", "C_creep_face"],
  sphinx: ["C_sphinx", "C_sphinx_face"],
  goblin: ["C_goblin", "C_goblin_face"],
};

/** Corps d'un monstre selon son archétype : silhouette chibi, teinte de l'issue. */
function MonsterBody({ monster }: { monster: MonsterState }) {
  const chars = useCharacters();
  const color = monster.issue !== null ? issueColor(monster.issue) : SCENE_PALETTE.todoMonster;
  const [body, face] = MONSTER_PARTS[monster.archetype === "boss" ? "goblin" : monster.archetype];
  return (
    <>
      <mesh geometry={chars[body]} material={tinted(color)}>
        <Outlines thickness={CHARACTER_OUTLINE * 1.3} color={OUTLINE} />
      </mesh>
      <mesh geometry={chars[face]} material={sceneMaterials().character}>
        <Outlines thickness={CHARACTER_OUTLINE} color={OUTLINE} />
      </mesh>
    </>
  );
}

/**
 * Une unité animée : glisse vers sa case (amortissement), respire (étirement à
 * volume conservé, sy = 1 + a, sx = sz = 1/√(1 + a)). Le temps partagé des
 * shaders est figé en mouvement réduit : l'unité saute alors sans glisser.
 */
function Unit({
  at,
  face,
  seed,
  amplitude,
  speed = 2,
  unitId,
  onClick,
  children,
}: {
  at: Point;
  /** Case regardée (le héros) : l'unité s'y tourne. */
  face?: Point;
  seed: number;
  amplitude: number;
  speed?: number;
  /** Monstre représenté : réagit à ses coups (recul, écrasement). */
  unitId?: number;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
  children: ReactNode;
}) {
  const store = useGameStore();
  const fx = useFx();
  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  const hit = useRef({ t: 0, dx: 0, dz: 0 });

  // Coup reçu : recul dans le sens du coup (depuis le héros) et écrasement.
  useEffect(() => {
    if (unitId === undefined) return;
    return store.subscribe((s, prev) => {
      if (s.seq === prev.seq) return;
      if (!s.state.events.some((e) => e.type === "damage" && e.unit.kind === "monster" && e.unit.id === unitId)) return;
      const h = s.state.hero.pos;
      const m = s.state.monsters.find((x) => x.id === unitId);
      const dx = m ? Math.sign(m.pos.x - h.x) : 0;
      const dz = m ? Math.sign(m.pos.y - h.y) : 0;
      hit.current = { t: 1, dx, dz };
    });
  }, [store, unitId]);

  useFrame((_, dt) => {
    const g = root.current;
    const b = body.current;
    if (!g || !b) return;
    const delta = Math.min(dt, 1 / 20) * fx.timeScale;
    const frozen = sceneUniforms.uTime.value === 0;
    if (frozen) {
      g.position.set(at.x, 0, at.y);
    } else {
      g.position.x = MathUtils.damp(g.position.x, at.x, 12, delta);
      g.position.z = MathUtils.damp(g.position.z, at.y, 12, delta);
    }
    const h = hit.current;
    if (h.t > 0) h.t = Math.max(0, h.t - delta * 4.5);
    const knock = h.t * h.t * 0.22;
    const t = sceneUniforms.uTime.value * speed + seed * 1.37;
    const a = Math.sin(t * 2) * amplitude - h.t * 0.3;
    b.scale.set(1 / Math.sqrt(Math.max(0.3, 1 + a)), 1 + a, 1 / Math.sqrt(Math.max(0.3, 1 + a)));
    // Les modèles regardent +Z (le « sud ») : lacet = atan2(dx, dz).
    if (face && (face.x !== at.x || face.y !== at.y)) {
      const yaw = Math.atan2(face.x - at.x, face.y - at.y);
      const d = Math.atan2(Math.sin(yaw - g.rotation.y), Math.cos(yaw - g.rotation.y));
      g.rotation.y = frozen ? yaw : g.rotation.y + d * (1 - Math.exp(-8 * delta));
    }
    // Recul exprimé dans le repère du monde, ramené dans celui de l'unité (qui pivote).
    const cos = Math.cos(g.rotation.y);
    const sin = Math.sin(g.rotation.y);
    const kx = h.dx * knock;
    const kz = h.dz * knock;
    b.position.set(kx * cos - kz * sin, Math.max(0, Math.sin(t)) * amplitude * 1.2, kx * sin + kz * cos);
  });
  return (
    <group ref={root} position={[at.x, 0, at.y]} onClick={onClick}>
      <group ref={body}>{children}</group>
    </group>
  );
}
