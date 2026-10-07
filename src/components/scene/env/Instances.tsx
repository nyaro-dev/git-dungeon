"use client";

import type { ThreeEvent } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { Color, Euler, Matrix4, Quaternion, Vector3, type BufferGeometry, type InstancedMesh, type Material } from "three";

export type InstanceSpec = { x: number; y: number; z: number; yaw: number; scale?: number };

/**
 * Un InstancedMesh générique : positions une fois, couleurs à chaque
 * changement (brouillard, teinte). Un draw call par type de pièce.
 */
export function Instances({
  geometry,
  material,
  items,
  colors,
  onPick,
}: {
  geometry: BufferGeometry;
  material: Material;
  items: InstanceSpec[];
  /** Couleur (multiplicateur) par instance ; même longueur que `items`. */
  colors: Color[];
  /** Clic sur une instance (index dans `items`). */
  onPick?: (index: number) => void;
}) {
  const ref = useRef<InstancedMesh>(null);
  // Déclaré d'emblée : créé après coup par setColorAt, il serait ignoré par le shader déjà compilé.
  const colorBuffer = useMemo(() => new Float32Array(Math.max(1, items.length) * 3), [items.length]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new Matrix4();
    const q = new Quaternion();
    const e = new Euler();
    const s = new Vector3();
    const p = new Vector3();
    items.forEach((it, i) => {
      mesh.setMatrixAt(i, m.compose(p.set(it.x, it.y, it.z), q.setFromEuler(e.set(0, it.yaw, 0)), s.setScalar(it.scale ?? 1)));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    colors.forEach((c, i) => mesh.setColorAt(i, c));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [colors]);

  if (items.length === 0) return null;
  const pick = onPick
    ? (e: ThreeEvent<MouseEvent>) => {
        if (e.instanceId === undefined) return;
        e.stopPropagation();
        onPick(e.instanceId);
      }
    : undefined;
  return (
    <instancedMesh
      // Le nombre d'instances fixe la taille des tampons : on remonte le mesh s'il change.
      key={items.length}
      ref={ref}
      args={[geometry, material, items.length]}
      onClick={pick}
      raycast={onPick ? undefined : () => null}
    >
      <instancedBufferAttribute attach="instanceColor" args={[colorBuffer, 3]} />
    </instancedMesh>
  );
}
