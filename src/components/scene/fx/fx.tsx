"use client";

import { useFrame } from "@react-three/fiber";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Color, DynamicDrawUsage, Matrix4, Quaternion, Vector3, type InstancedMesh } from "three";

/**
 * Effets visuels d'une partie : particules (un seul InstancedMesh recyclé) et
 * « trauma » de caméra (secousse ∝ trauma², qui décroît). Les composants de la
 * scène déclenchent, le rendu consomme ; rien ici ne touche aux règles du jeu.
 * L'aléa des particules est purement visuel : il n'entre jamais dans l'état de jeu.
 */

const MAX_PARTICLES = 256;

export type Burst = {
  at: [number, number, number];
  count: number;
  color: string;
  /** Vitesse initiale (unités/s). */
  speed?: number;
  /** Fraction verticale de l'impulsion : 0 = à plat (poussière), 1 = jet vers le haut. */
  up?: number;
  /** Gravité (unités/s²), négative = tombe. */
  gravity?: number;
  life?: number;
  size?: number;
};

type Particle = {
  alive: boolean;
  pos: Vector3;
  vel: Vector3;
  age: number;
  life: number;
  size: number;
  gravity: number;
  color: Color;
};

/** Moteur d'effets : tout l'état mutable est ici, hors du rendu React. */
export class FxEngine {
  reducedMotion = false;
  private trauma = 0;
  /** Horloge réelle (s) et fenêtres de gel / ralenti (hitstop, mort au ralenti). */
  private clock = 0;
  private freezeUntil = 0;
  private slowUntil = 0;
  private slowFactor = 1;
  private cursor = 0;
  private readonly pool: Particle[] = Array.from({ length: MAX_PARTICLES }, () => ({
    alive: false,
    pos: new Vector3(),
    vel: new Vector3(),
    age: 0,
    life: 1,
    size: 0.1,
    gravity: 0,
    color: new Color(),
  }));
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly s = new Vector3();

  setReducedMotion(value: boolean) {
    this.reducedMotion = value;
  }

  /**
   * Échelle de temps des animations de combat (héros, monstres, particules) :
   * 0 pendant un hitstop, < 1 pendant un ralenti. Le décor et la caméra n'en
   * dépendent pas : seul l'impact se fige.
   */
  get timeScale(): number {
    if (this.clock < this.freezeUntil) return 0;
    if (this.clock < this.slowUntil) return this.slowFactor;
    return 1;
  }

  /** Gel de l'action (« hit stop ») : ~60 ms pour un coup, ~120 ms pour un gros. */
  hitstop(ms: number) {
    if (this.reducedMotion) return;
    this.freezeUntil = Math.max(this.freezeUntil, this.clock + ms / 1000);
  }

  /** Ralenti (mort d'un ennemi) qui commence après l'éventuel hitstop. */
  slowmo(factor: number, ms: number) {
    if (this.reducedMotion) return;
    const start = Math.max(this.clock, this.freezeUntil);
    this.slowFactor = factor;
    this.slowUntil = Math.max(this.slowUntil, start + ms / 1000);
  }

  /** Secousse de caméra à appliquer (0..1), lue par CameraRig. */
  get shakeAmount(): number {
    return this.trauma * this.trauma;
  }

  shake(amount: number) {
    if (this.reducedMotion) return;
    this.trauma = Math.min(1, this.trauma + amount);
  }

  burst({ at, count, color, speed = 1.6, up = 0.6, gravity = -6, life = 0.6, size = 0.09 }: Burst) {
    // Mouvement réduit : quelques particules lentes, pas d'explosion.
    const n = this.reducedMotion ? Math.min(3, count) : count;
    const sp = this.reducedMotion ? speed * 0.3 : speed;
    for (let i = 0; i < n; i++) {
      const p = this.pool[this.cursor];
      this.cursor = (this.cursor + 1) % MAX_PARTICLES;
      const angle = Math.random() * Math.PI * 2;
      const spread = sp * (0.5 + Math.random() * 0.5);
      p.alive = true;
      p.pos.set(at[0], at[1], at[2]);
      p.vel.set(Math.cos(angle) * spread * (1 - up), spread * up * (0.6 + Math.random() * 0.8), Math.sin(angle) * spread * (1 - up));
      p.age = 0;
      p.life = life * (0.7 + Math.random() * 0.6);
      p.size = size * (0.7 + Math.random() * 0.6);
      p.gravity = gravity;
      p.color.set(color);
    }
  }

  /** Avance la simulation et écrit les instances. Appelé à chaque frame. */
  update(dt: number, mesh: InstancedMesh) {
    const real = Math.min(dt, 1 / 20);
    this.clock += real;
    this.trauma = Math.max(0, this.trauma - real * 1.6);
    // Les particules suivent l'échelle de temps : elles se figent avec l'impact.
    const delta = real * this.timeScale;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.pool[i];
      if (p.alive) {
        p.age += delta;
        if (p.age >= p.life) p.alive = false;
        p.vel.y += p.gravity * delta;
        p.vel.multiplyScalar(1 - 2.5 * delta); // traînée de l'air
        p.pos.addScaledVector(p.vel, delta);
        if (p.pos.y < 0.02) {
          p.pos.y = 0.02;
          p.vel.y = 0;
        }
      }
      // Rétrécit en fin de vie (pas de transparence : ni tri, ni overdraw).
      const k = p.alive ? p.size * (1 - (p.age / p.life) ** 2) : 0;
      mesh.setMatrixAt(i, this.m.compose(p.pos, this.q, this.s.setScalar(k)));
      mesh.setColorAt(i, p.color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
}

const FxContext = createContext<FxEngine | null>(null);

export function useFx(): FxEngine {
  const fx = useContext(FxContext);
  if (!fx) throw new Error("useFx doit être utilisé sous <FxProvider>");
  return fx;
}

/** Fournit `useFx()` et dessine les particules. À placer dans le <Canvas>. */
export function FxProvider({ reducedMotion, children }: { reducedMotion: boolean; children: ReactNode }) {
  const mesh = useRef<InstancedMesh>(null);
  const [engine] = useState(() => new FxEngine());
  const [colorBuffer] = useState(() => new Float32Array(MAX_PARTICLES * 3));

  useEffect(() => engine.setReducedMotion(reducedMotion), [engine, reducedMotion]);
  useFrame((_, dt) => {
    if (mesh.current) engine.update(dt, mesh.current);
  });

  return (
    <FxContext value={engine}>
      {children}
      <instancedMesh ref={mesh} args={[undefined, undefined, MAX_PARTICLES]} frustumCulled={false} raycast={() => null}>
        <instancedBufferAttribute attach="instanceColor" args={[colorBuffer, 3]} usage={DynamicDrawUsage} />
        <icosahedronGeometry args={[1, 0]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </FxContext>
  );
}
