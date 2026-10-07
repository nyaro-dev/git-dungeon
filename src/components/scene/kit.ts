"use client";

import { useGLTF } from "@react-three/drei";
import { useMemo } from "react";
import { BufferAttribute, BufferGeometry, Matrix3, Mesh, Vector3, type Object3D } from "three";

/** Kit low-poly produit par scripts/blender/dungeon-kit (pnpm kit). */
export const KIT_URL = "/models/dungeon-kit.glb";
const PROTOTYPES = [
  "P_floor",
  "P_bridge",
  "P_parapet",
  "P_door",
  "P_chest",
  "P_chest_trim",
  "P_pedestal",
  "P_torch",
  "P_flame",
  "P_grass",
  "P_crystal",
  "P_rock",
  "P_pillar",
  "P_fountain",
  "P_water",
  "P_portal",
  "P_portal_core",
  "P_crack",
] as const;
export type Prototype = (typeof PROTOTYPES)[number];

/**
 * Géométrie d'un prototype, prête pour un InstancedMesh.
 *
 * Le GLB est quantifié (KHR_mesh_quantization) : positions en entiers 16 bits
 * normalisés, l'échelle réelle étant portée par la transformation du nœud. On
 * réécrit donc positions et normales en flottants, transformation appliquée ;
 * `applyMatrix4` sur l'attribut normalisé écrêterait tout à [-1, 1].
 */
export function bake(node: Object3D): BufferGeometry {
  node.updateWorldMatrix(true, false);
  const source = (node as Mesh).geometry;
  const m = node.matrixWorld;
  const normalMatrix = new Matrix3().getNormalMatrix(m);
  const pos = source.getAttribute("position");
  const nor = source.getAttribute("normal");
  const positions = new Float32Array(pos.count * 3);
  const normals = new Float32Array(pos.count * 3);
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(m).toArray(positions, i * 3);
    if (nor) v.fromBufferAttribute(nor, i).applyMatrix3(normalMatrix).normalize().toArray(normals, i * 3);
  }
  const out = new BufferGeometry();
  out.setAttribute("position", new BufferAttribute(positions, 3));
  if (nor) out.setAttribute("normal", new BufferAttribute(normals, 3));
  const color = source.getAttribute("color");
  if (color) out.setAttribute("color", color);
  if (source.index) out.setIndex(source.index);
  out.computeBoundingSphere();
  return out;
}

/** Géométries du kit, une par prototype (suspend tant que le GLB charge). */
export function useDungeonKit(): Record<Prototype, BufferGeometry> {
  // drei branche le décodeur meshopt par défaut.
  const { nodes } = useGLTF(KIT_URL);
  return useMemo(() => {
    const out = {} as Record<Prototype, BufferGeometry>;
    for (const name of PROTOTYPES) {
      const node = nodes[name];
      if (!node) throw new Error(`dungeon-kit.glb : prototype ${name} manquant`);
      out[name] = bake(node);
    }
    return out;
  }, [nodes]);
}

useGLTF.preload(KIT_URL);
