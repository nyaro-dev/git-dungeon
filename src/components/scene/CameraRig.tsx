"use client";

import { OrbitControls, OrthographicCamera } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState, type ComponentRef } from "react";
import { MathUtils, MOUSE, TOUCH, Vector3 } from "three";
import { useGame } from "@/components/game/GameContext";
import { useFx } from "./fx/fx";

/** Direction de vue isométrique : la caméra regarde depuis (+x, +y, +z). */
const ISO_OFFSET = new Vector3(1, 1, 1).normalize().multiplyScalar(40);

/**
 * Caméra orthographique isométrique qui suit le héros. Molette et pincement
 * zooment ; ni rotation ni panoramique (un tap reste un ordre de déplacement).
 */
export function CameraRig({ reducedMotion }: { reducedMotion: boolean }) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const fx = useFx();
  const pos = useGame((s) => s.state.hero.pos);
  const goal = useRef(new Vector3(pos.x, 0, pos.y));
  // Valeurs initiales seulement : les repasser à chaque rendu ferait sauter la caméra.
  const [initial] = useState(() => ({
    target: [pos.x, 0, pos.y] as [number, number, number],
    position: [pos.x + ISO_OFFSET.x, ISO_OFFSET.y, pos.y + ISO_OFFSET.z] as [number, number, number],
  }));

  useEffect(() => {
    goal.current.set(pos.x, 0, pos.y);
  }, [pos]);

  useFrame((state, delta) => {
    const c = controls.current;
    if (!c) return;
    const t = c.target;
    if (reducedMotion) {
      t.copy(goal.current);
    } else {
      t.x = MathUtils.damp(t.x, goal.current.x, 6, delta);
      t.z = MathUtils.damp(t.z, goal.current.z, 6, delta);
    }
    state.camera.position.copy(t).add(ISO_OFFSET);
    state.camera.lookAt(t);
    // Secousse ∝ trauma² (« The art of screenshake ») : bruit déterministe en sinus, pas d'aléa.
    const shake = fx.shakeAmount;
    if (shake > 0) {
      const time = state.clock.elapsedTime;
      state.camera.position.x += Math.sin(time * 47.3) * 0.35 * shake;
      state.camera.position.y += Math.sin(time * 53.1 + 1.3) * 0.25 * shake;
      state.camera.position.z += Math.sin(time * 41.7 + 2.1) * 0.35 * shake;
    }
  });

  return (
    <>
      <OrthographicCamera makeDefault position={initial.position} zoom={48} near={0.1} far={200} />
      <OrbitControls
        ref={controls}
        target={initial.target}
        enableRotate={false}
        enablePan={false}
        enableZoom
        minZoom={18}
        maxZoom={120}
        mouseButtons={{ MIDDLE: MOUSE.DOLLY }}
        touches={{ TWO: TOUCH.DOLLY_PAN }}
      />
    </>
  );
}
