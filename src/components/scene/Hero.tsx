"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import { MathUtils, type Group } from "three";
import { useGame, useGameStore } from "@/components/game/GameContext";
import { STEP, type Direction } from "@/lib/game/rules";
import { Outlines } from "@react-three/drei";
import { HERO_NECK, useCharacters } from "./characters";
import { CHARACTER_OUTLINE, OUTLINE } from "./Entities";
import { useFx } from "./fx/fx";
import { sceneMaterials } from "./materials/library";
import { SCENE_PALETTE } from "./palette";

const YAW: Record<Direction, number> = { south: 0, east: Math.PI / 2, north: Math.PI, west: -Math.PI / 2 };
/** Durée d'un saut de case : un peu sous le rythme des trajets (110 ms) pour enchaîner. */
const HOP_S = 0.105;
const HOP_HEIGHT = 0.18;
const LUNGE_S = 0.22;

function shortestAngle(from: number, to: number): number {
  const d = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
  return d < -Math.PI ? d + Math.PI * 2 : d;
}

/**
 * Le héros, animé comme un personnage cartoon : il SAUTE de case en case
 * (étirement à l'envol, écrasement à l'atterrissage), fait un élan vers ce qu'il
 * heurte, respire à l'arrêt. Mouvement réduit : il se téléporte, sans rebond.
 */
export function Hero({ reducedMotion }: { reducedMotion: boolean }) {
  const store = useGameStore();
  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  const head = useRef<Group>(null);
  const chars = useCharacters();
  const pos = useGame((s) => s.state.hero.pos);
  const facing = useGame((s) => s.state.hero.facing);
  const [initial] = useState<[number, number, number]>(() => [pos.x, 0, pos.y]);

  // État d'animation (hors React : modifié à chaque frame).
  const anim = useRef({ fromX: pos.x, fromZ: pos.y, toX: pos.x, toZ: pos.y, hop: 1, land: 0, lunge: 1, lungeDir: STEP.south, hurt: 0 });
  const fx = useFx();

  useEffect(() => {
    const a = anim.current;
    const g = root.current;
    a.fromX = g ? g.position.x : a.toX;
    a.fromZ = g ? g.position.z : a.toZ;
    a.toX = pos.x;
    a.toZ = pos.y;
    a.hop = 0;
  }, [pos]);

  // Élan vers l'entité heurtée.
  useEffect(
    () =>
      store.subscribe((s, prev) => {
        if (s.seq === prev.seq) return;
        if (s.state.events.some((e) => e.type === "damage" && e.unit.kind === "hero")) anim.current.hurt = 1;
        if (!s.state.events.some((e) => e.type === "bump" || e.type === "cast")) return;
        anim.current.lunge = 0;
        anim.current.lungeDir = STEP[s.state.hero.facing];
      }),
    [store],
  );

  useFrame((state, dt) => {
    const g = root.current;
    const b = body.current;
    const hd = head.current;
    if (!g || !b || !hd) return;
    const a = anim.current;
    // Échelle de temps du combat : figé pendant un hitstop, ralenti à la mort d'un ennemi.
    const delta = Math.min(dt, 1 / 20) * fx.timeScale;
    const t = state.clock.elapsedTime;

    if (reducedMotion) {
      g.position.set(a.toX, 0, a.toZ);
      g.rotation.y = YAW[facing];
      b.position.set(0, 0, 0);
      b.scale.set(1, 1, 1);
      hd.rotation.set(0, 0, 0);
      return;
    }

    // Saut : arc parabolique entre deux cases.
    if (a.hop < 1) {
      a.hop = Math.min(1, a.hop + delta / HOP_S);
      if (a.hop === 1) a.land = 1;
    }
    const k = MathUtils.smootherstep(a.hop, 0, 1);
    g.position.x = MathUtils.lerp(a.fromX, a.toX, k);
    g.position.z = MathUtils.lerp(a.fromZ, a.toZ, k);
    const air = a.hop < 1 ? Math.sin(Math.PI * a.hop) : 0;

    // Élan avec anticipation : il se ramasse (35 % du geste) puis s'élance et revient.
    let lungeOffset = 0;
    let crouch = 0;
    if (a.lunge < 1) {
      a.lunge = Math.min(1, a.lunge + delta / LUNGE_S);
      const ANTICIPATION = 0.35;
      if (a.lunge < ANTICIPATION) {
        crouch = Math.sin((Math.PI / 2) * (a.lunge / ANTICIPATION)) * 0.16;
        lungeOffset = -0.06 * (a.lunge / ANTICIPATION);
      } else {
        const k2 = (a.lunge - ANTICIPATION) / (1 - ANTICIPATION);
        crouch = 0.16 * (1 - Math.min(1, k2 * 3));
        lungeOffset = Math.sin(Math.PI * k2) * 0.36;
      }
    }
    // Coup encaissé : recul et écrasement bref.
    let recoil = 0;
    if (a.hurt > 0) {
      a.hurt = Math.max(0, a.hurt - delta * 5);
      recoil = a.hurt * 0.12;
    }

    // Écrasement à l'atterrissage, qui revient en ressort.
    a.land = Math.max(0, a.land - delta * 7);
    const squash = a.land * 0.22 + crouch + recoil;
    const breathe = a.hop >= 1 && a.lunge >= 1 ? Math.sin(t * 3.2) * 0.03 : 0;
    const stretch = air * 0.16;
    b.scale.set(1 + squash * 0.6 - stretch * 0.4, 1 - squash + stretch + breathe, 1 + squash * 0.6 - stretch * 0.4);
    b.position.set(a.lungeDir.x * (lungeOffset - recoil), air * HOP_HEIGHT, a.lungeDir.y * (lungeOffset - recoil));

    // Tête : animation secondaire, en retard sur le corps (elle plonge à l'élan,
    // part en arrière au saut, se balance doucement au repos).
    hd.rotation.x = crouch * 0.9 - air * 0.18 + recoil * -1.2 + (lungeOffset > 0 ? lungeOffset * 0.5 : 0);
    hd.rotation.z = Math.sin(t * 1.7) * 0.05;
    hd.position.y = HERO_NECK - squash * 0.05;

    g.rotation.y += shortestAngle(g.rotation.y, YAW[facing]) * (1 - Math.exp(-22 * delta));
  });

  return (
    // Position initiale seulement : useFrame anime ensuite (la repasser ferait sauter le héros).
    <group ref={root} position={initial}>
      <group ref={body}>
        <mesh geometry={chars.C_hero} material={sceneMaterials().hero}>
          <Outlines thickness={CHARACTER_OUTLINE * 1.3} color={OUTLINE} />
        </mesh>
        <group ref={head} position={[0, HERO_NECK, 0]}>
          <mesh geometry={chars.C_hero_head} material={sceneMaterials().hero}>
            <Outlines thickness={CHARACTER_OUTLINE} color={OUTLINE} />
          </mesh>
        </group>
      </group>
      {/* Torche portée : la lumière suit le héros, avec un léger vacillement (Torch). */}
      <Torch />
    </group>
  );
}

/** Lumière chaude qui vacille comme une flamme (somme de sinus, sans aléa). */
function Torch() {
  const light = useRef<import("three").PointLight>(null);
  useFrame((state) => {
    const l = light.current;
    if (!l) return;
    const t = state.clock.elapsedTime;
    l.intensity = 10 + Math.sin(t * 13.1) * 0.35 + Math.sin(t * 7.3 + 1.7) * 0.5 + Math.sin(t * 23.9) * 0.2;
  });
  // Assez haut pour ne pas brûler la tête du personnage (la lumière décroît en 1/d^1.6).
  return <pointLight ref={light} position={[0, 2, 0]} color={SCENE_PALETTE.heroLight} intensity={10} distance={10} decay={1.6} />;
}
