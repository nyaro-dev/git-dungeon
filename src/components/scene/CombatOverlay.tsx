"use client";

import type { ThreeEvent } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { Color, DoubleSide, Matrix4, type InstancedMesh } from "three";
import { useGame, useGameStore } from "@/components/game/GameContext";
import type { Point } from "@/lib/dungeon/types";
import { ABILITIES, checkCast } from "@/lib/game/abilities";
import { Ctx } from "@/lib/game/engine";
import { add, key, same } from "@/lib/game/grid";
import { reachableInCombat } from "@/lib/game/rules";
import type { GameState, Intent, MonsterState } from "@/lib/game/types";
import type { World } from "@/lib/game/world";
import { ACCENT, CONTRAST } from "@/lib/theme";

const DANGER = "#E8384F";
const NO_LOS = "#8B5CF6";
const GLYPH = "#9B6BD4";

/**
 * Couche tactique du combat (GAMEDESIGN.md §1 « tout se voit avant d'agir ») :
 * cases atteignables, portée de la capacité visée, cases menacées par les
 * intentions, glyphes, case survolée. Plus le plan qui capte le pointeur. Les
 * étiquettes (intentions, PV, aperçu des dégâts) sont en DOM : components/game/Tags.tsx.
 */
export function CombatOverlay() {
  const store = useGameStore();
  const world = useGame((s) => s.world);
  const state = useGame((s) => s.state);
  const aiming = useGame((s) => s.aiming);
  const hover = useGame((s) => s.hover);
  const inCombat = state.status === "combat" && state.combat !== null;

  const layers = useMemo(() => (inCombat ? computeLayers(world, state, aiming) : null), [inCombat, world, state, aiming]);
  const toCell = (e: ThreeEvent<PointerEvent | MouseEvent>): Point => ({ x: Math.round(e.point.x), y: Math.round(e.point.z) });

  return (
    <group>
      {/* Plan de saisie : tout clic sur le sol passe par lui (cases, ponts, portes). */}
      <mesh
        rotation-x={-Math.PI / 2}
        position={[world.width / 2, 0.02, world.height / 2]}
        onPointerMove={(e) => store.getState().setHover(toCell(e))}
        onPointerLeave={() => store.getState().setHover(null)}
        onClick={(e) => {
          e.stopPropagation();
          store.getState().travelTo(toCell(e));
        }}
      >
        <planeGeometry args={[world.width + 20, world.height + 20]} />
        <meshBasicMaterial visible={false} />
      </mesh>

      {layers && (
        <>
          <CellLayer cells={layers.reach} color={CONTRAST} opacity={0.28} y={0.03} />
          <CellLayer cells={layers.range} color={ACCENT} opacity={0.32} y={0.035} />
          <CellLayer cells={layers.blocked} color={NO_LOS} opacity={0.22} y={0.035} />
          <CellLayer cells={layers.glyphs} color={GLYPH} opacity={0.3} y={0.032} />
          <CellLayer cells={layers.danger} color={DANGER} opacity={0.42} y={0.04} />
        </>
      )}
      {hover && inCombat && <CellLayer cells={[hover]} color="#ffffff" opacity={0.25} y={0.045} />}

    </group>
  );
}

/** Cases des calques tactiques, recalculées à chaque changement d'état ou de visée. */
function computeLayers(world: World, state: GameState, aiming: GameState["hero"]["weapon"] | string | null) {
  const ctx = new Ctx(world, state);
  const room = world.model.rooms[state.combat!.roomId].rect;
  const reach: Point[] = [];
  const range: Point[] = [];
  const blocked: Point[] = [];

  if (aiming) {
    const ability = ABILITIES[aiming as keyof typeof ABILITIES];
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        const p = { x, y };
        const denial = checkCast(ctx, ability, p);
        // Dans la portée et visible (même si la case elle-même n'est pas une cible) : lime ;
        // dans la portée mais masquée : violet.
        if (denial === null || denial === "invalid-target" || denial === "occupied") range.push(p);
        else if (denial === "no-line-of-sight") blocked.push(p);
      }
    }
  } else {
    for (const k of reachableInCombat(world, state).keys()) {
      const [x, y] = k.split(",").map(Number);
      if (!same({ x, y }, state.hero.pos)) reach.push({ x, y });
    }
  }

  const danger: Point[] = [];
  const seen = new Set<string>();
  const mark = (p: Point) => {
    if (!seen.has(key(p))) {
      seen.add(key(p));
      danger.push(p);
    }
  };
  for (const m of ctx.arenaMonsters()) {
    if (!m.intent) continue;
    for (const p of threatenedCells(ctx, m, m.intent)) mark(p);
  }

  const glyphs: Point[] = [];
  for (const g of state.combat!.glyphs) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) glyphs.push({ x: g.at.x + dx, y: g.at.y + dy });
  }
  return { reach, range, blocked, danger, glyphs };
}

/** Cases que l'intention frappera (pour les surligner en rouge). */
function threatenedCells(ctx: Ctx, m: MonsterState, intent: Intent): Point[] {
  switch (intent.kind) {
    case "strike":
      return [add(m.pos, intent.dir)];
    case "charge": {
      const out: Point[] = [];
      let p = add(m.pos, intent.dir);
      while (ctx.inArena(p) && !ctx.propAt(p)) {
        out.push(p);
        if (ctx.unitAt(p)) break;
        p = add(p, intent.dir);
      }
      return out;
    }
    case "shoot":
      // Le tir vise le héros : seule sa case est menacée (on s'abrite en cassant la ligne de vue).
      return [ctx.s.hero.pos];
    case "sweep":
      return Array.from({ length: intent.length }, (_, k) => add(m.pos, intent.dir, k + 1)).filter((p) => ctx.inArena(p));
    case "comments":
      return intent.cells;
    case "reproduce":
    case "summon":
      return [];
  }
}

/** Capacité fixe : une salle fait au plus 11×11 cases (glyphes : quelques zones 3×3 en plus). */
const LAYER_CAPACITY = 192;

function CellLayer({ cells, color, opacity, y }: { cells: Point[]; color: string; opacity: number; y: number }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new Matrix4();
    const n = Math.min(cells.length, LAYER_CAPACITY);
    for (let i = 0; i < n; i++) mesh.setMatrixAt(i, m.makeTranslation(cells[i].x, y, cells[i].y));
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
  }, [cells, y]);
  const c = useMemo(() => new Color(color), [color]);
  if (cells.length === 0) return null;
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, LAYER_CAPACITY]} raycast={() => null} renderOrder={5}>
      <boxGeometry args={[0.9, 0.012, 0.9]} />
      <meshBasicMaterial color={c} transparent opacity={opacity} depthWrite={false} side={DoubleSide} toneMapped={false} />
    </instancedMesh>
  );
}
