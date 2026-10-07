"use client";

import { useFrame } from "@react-three/fiber";
import { sceneUniforms } from "../materials/toon";

/**
 * Le seul useFrame qui alimente les shaders : temps (vent, scintillement,
 * nébuleuse) et parallaxe du ciel. Mouvement réduit : le temps est figé, la
 * scène reste lisible mais immobile.
 */
export function SceneDriver({ reducedMotion }: { reducedMotion: boolean }) {
  useFrame((state) => {
    if (!reducedMotion) sceneUniforms.uTime.value = state.clock.elapsedTime;
    const cam = state.camera.position;
    sceneUniforms.uCamOffset.value.set(cam.x - cam.z, cam.y);
  });
  return null;
}
