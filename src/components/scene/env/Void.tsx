"use client";

import { useMemo } from "react";
import { Color, ShaderMaterial } from "three";
import { sceneUniforms } from "../materials/toon";

/**
 * Le Néant du dépôt : fond plein écran dessiné en premier (dégradé indigo,
 * nébuleuse qui dérive, étoiles qui scintillent avec une légère parallaxe sur
 * la caméra). Un seul quad, un seul shader, aucune texture.
 */
export function Void({ quality }: { quality: "high" | "low" }) {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        depthWrite: false,
        depthTest: false,
        defines: { NEBULA_OCTAVES: quality === "low" ? 2 : 4 },
        uniforms: {
          uTime: sceneUniforms.uTime,
          uOffset: sceneUniforms.uCamOffset,
          uTop: { value: new Color("#1A1530") },
          uMid: { value: new Color("#0B0E1A") },
          uBottom: { value: new Color("#05070D") },
          uNebulaA: { value: new Color("#3B2A6B") },
          uNebulaB: { value: new Color("#1E4E6B") },
          uStar: { value: new Color("#E8F0FF") },
        },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = vec4(position.xy, 1.0, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          uniform vec2 uOffset;
          uniform vec3 uTop, uMid, uBottom, uNebulaA, uNebulaB, uStar;
          varying vec2 vUv;

          float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float noise(vec2 p) {
            vec2 i = floor(p), f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
          }
          float fbm(vec2 p) {
            float v = 0.0, a = 0.5;
            for (int i = 0; i < NEBULA_OCTAVES; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
            return v;
          }
          float stars(vec2 uv, float scale, float threshold) {
            vec2 cell = floor(uv * scale);
            vec2 local = fract(uv * scale) - 0.5;
            float h = hash(cell);
            if (h < threshold) return 0.0;
            vec2 jitter = vec2(hash(cell + 3.1), hash(cell + 7.7)) - 0.5;
            float d = length(local - jitter * 0.7);
            float twinkle = 0.6 + 0.4 * sin(uTime * (1.5 + h * 3.0) + h * 40.0);
            return smoothstep(0.08, 0.0, d) * twinkle;
          }
          void main() {
            vec3 col = mix(uBottom, uMid, smoothstep(0.0, 0.45, vUv.y));
            col = mix(col, uTop, smoothstep(0.45, 1.0, vUv.y));
            vec2 p = vUv * vec2(2.0, 1.2) + uOffset * 0.015;
            float n = fbm(p * 2.2 + vec2(uTime * 0.01, 0.0));
            float m = fbm(p * 1.3 - vec2(0.0, uTime * 0.006) + 4.0);
            col += uNebulaA * smoothstep(0.45, 0.9, n) * 0.55 + uNebulaB * smoothstep(0.5, 0.95, m) * 0.4;
            vec2 sp = vUv * vec2(1.6, 1.0);
            col += uStar * stars(sp + uOffset * 0.004, 60.0, 0.965);
            col += uStar * stars(sp + uOffset * 0.008, 32.0, 0.975) * 1.4;
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      }),
    [quality],
  );

  return (
    <mesh renderOrder={-1000} frustumCulled={false} material={material} raycast={() => null}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}
