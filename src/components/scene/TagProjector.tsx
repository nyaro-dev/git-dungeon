"use client";

import { useFrame } from "@react-three/fiber";
import { Vector3 } from "three";
import type { AnchorRegistry } from "@/components/game/anchors";

const v = new Vector3();

/** Projette chaque frame les étiquettes DOM ancrées sur leur point monde. */
export function TagProjector({ registry }: { registry: AnchorRegistry }) {
  useFrame(({ camera, size }) => {
    registry.forEach((a) => {
      v.set(a.x, a.y, a.z).project(camera);
      const x = (v.x * 0.5 + 0.5) * size.width;
      const y = (-v.y * 0.5 + 0.5) * size.height;
      a.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
    });
  });
  return null;
}
