import {
  Color,
  DataTexture,
  DoubleSide,
  FrontSide,
  MeshBasicMaterial,
  MeshToonMaterial,
  NearestFilter,
  RGBAFormat,
  UnsignedByteType,
  Vector2,
  type ColorRepresentation,
} from "three";

/**
 * Matériau « Ankama » de toute la scène (GAMEDESIGN.md §5) : MeshToonMaterial
 * étendu par onBeforeCompile, compatible InstancedMesh.
 *
 * - toon en 3 bandes (gradientMap en NearestFilter) ;
 * - ombres colorées : les zones sombres sont relevées vers une teinte violette ;
 * - rim light côté éclairé ;
 * - options : bruit « peint » procédural, dégradé vertical vers l'ombre (îles),
 *   vent dans le vertex shader (herbe), brouillard par salle (texture de révélation).
 *
 * Les uniforms partagés (temps, teinte d'ombre, révélation) sont des objets uniques :
 * un seul useFrame met tout à jour, aucune matrice n'est réécrite.
 */

export const MAX_ROOMS_TEX = 64;

/** Uniforms communs à tous les matériaux de la scène. */
export const sceneUniforms = {
  uTime: { value: 0 },
  /** Position de la caméra projetée (parallaxe du ciel). */
  uCamOffset: { value: new Vector2() },
  uShadowTint: { value: new Color("#3A2E5C") },
  uFog: { value: 0.05 },
  /** R = degré de révélation (0..1) de la salle d'index x. */
  uRevealTex: { value: createRevealTexture() },
};

function createRevealTexture(): DataTexture {
  const tex = new DataTexture(new Uint8Array(MAX_ROOMS_TEX * 4), MAX_ROOMS_TEX, 1, RGBAFormat, UnsignedByteType);
  tex.magFilter = NearestFilter;
  tex.minFilter = NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

/** Écrit le degré de révélation (0..1) de chaque salle. */
export function setRoomReveal(values: ArrayLike<number>) {
  const tex = sceneUniforms.uRevealTex.value;
  const data = tex.image.data as Uint8Array;
  for (let i = 0; i < MAX_ROOMS_TEX; i++) {
    const v = Math.round(Math.max(0, Math.min(1, values[i] ?? 0)) * 255);
    data[i * 4] = v;
  }
  tex.needsUpdate = true;
}

const gradientMap = (() => {
  // Trois bandes : ombre, demi-teinte, lumière.
  const tex = new DataTexture(
    new Uint8Array([105, 105, 105, 255, 185, 185, 185, 255, 255, 255, 255, 255]),
    3,
    1,
    RGBAFormat,
    UnsignedByteType,
  );
  tex.magFilter = NearestFilter;
  tex.minFilter = NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
})();

export type ToonOptions = {
  color?: ColorRepresentation;
  vertexColors?: boolean;
  emissive?: ColorRepresentation;
  emissiveIntensity?: number;
  rim?: ColorRepresentation;
  rimStrength?: number;
  /** Bruit de luminance ±6 % en coordonnées monde : aspect peint sans texture. */
  noise?: boolean;
  /** Dégradé vertical vers la teinte d'ombre, entre ces hauteurs monde (îles, falaises). */
  gradient?: [number, number];
  /** Amplitude du vent (herbe, bannières) ; 0 = aucun. */
  wind?: number;
  /** Brouillard par salle : la géométrie porte un attribut `aRoom`. */
  reveal?: boolean;
  doubleSide?: boolean;
  toneMapped?: boolean;
};

const VERTEX_PARS = /* glsl */ `
uniform float uTime;
uniform float uWind;
varying vec3 vGdWorld;
#ifdef GD_REVEAL
attribute float aRoom;
varying float vRoom;
#endif
`;

const VERTEX_WIND = /* glsl */ `
#ifdef GD_WIND
{
  vec3 gdBase = vec3(0.0);
  #ifdef USE_INSTANCING
  gdBase = instanceMatrix[3].xyz;
  #endif
  float gdH = max(transformed.y, 0.0);
  float gdPhase = gdBase.x * 1.7 + gdBase.z * 1.3;
  float gdSway = sin(uTime * 2.1 + gdPhase) * 0.6 + sin(uTime * 3.7 + gdPhase * 1.9) * 0.25;
  transformed.x += gdSway * uWind * gdH * gdH * 4.0;
  transformed.z += cos(uTime * 1.6 + gdPhase) * uWind * 0.5 * gdH * gdH * 4.0;
}
#endif
`;

const VERTEX_WORLD = /* glsl */ `
{
  vec4 gdWorld = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  gdWorld = instanceMatrix * gdWorld;
  #endif
  vGdWorld = (modelMatrix * gdWorld).xyz;
  #ifdef GD_REVEAL
  vRoom = aRoom;
  #endif
}
`;

const FRAGMENT_PARS = /* glsl */ `
uniform vec3 uShadowTint;
uniform vec3 uRimColor;
uniform float uRimStrength;
varying vec3 vGdWorld;
#ifdef GD_REVEAL
uniform sampler2D uRevealTex;
uniform float uFog;
varying float vRoom;
#endif
float gdHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gdNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(gdHash(i), gdHash(i + vec2(1.0, 0.0)), u.x), mix(gdHash(i + vec2(0.0, 1.0)), gdHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
`;

const FRAGMENT_ALBEDO = /* glsl */ `
#ifdef GD_NOISE
diffuseColor.rgb *= 0.94 + 0.12 * gdNoise(vGdWorld.xz * 1.6 + vGdWorld.y * 0.7);
#endif
#ifdef GD_GRADIENT
diffuseColor.rgb = mix(diffuseColor.rgb * uShadowTint * 2.4, diffuseColor.rgb, smoothstep(GD_GRAD_LOW, GD_GRAD_HIGH, vGdWorld.y));
#endif
#ifdef GD_REVEAL
diffuseColor.rgb *= mix(uFog, 1.0, texture2D(uRevealTex, vec2((vRoom + 0.5) / ${MAX_ROOMS_TEX.toFixed(1)}, 0.5)).r);
#endif
`;

const FRAGMENT_LIGHT = /* glsl */ `
{
  // Ombres colorées : ce que la lumière n'atteint pas tire vers la teinte d'ombre, jamais vers le gris.
  float gdLum = dot(outgoingLight, vec3(0.299, 0.587, 0.114));
  float gdAlbedo = max(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)), 1e-3);
  float gdShade = 1.0 - clamp(gdLum / gdAlbedo, 0.0, 1.0);
  outgoingLight += uShadowTint * diffuseColor.rgb * gdShade * 0.9;
  // Rim light, côté éclairé seulement.
  vec3 gdView = isOrthographic ? vec3(0.0, 0.0, 1.0) : normalize(vViewPosition);
  float gdFresnel = pow(1.0 - clamp(dot(normal, gdView), 0.0, 1.0), 3.0);
  outgoingLight += uRimColor * smoothstep(0.35, 0.5, gdFresnel) * uRimStrength * (1.0 - gdShade);
}
`;

/**
 * Flamme : couleur pure non éclairée (au-delà de 1 pour le bloom), qui vacille
 * dans le vertex shader avec une phase par instance (pas de matrice réécrite).
 */
export function createFlameMaterial(color: ColorRepresentation, intensity = 3): MeshBasicMaterial {
  const material = new MeshBasicMaterial({ color: new Color(color).multiplyScalar(intensity) });
  material.toneMapped = false;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = sceneUniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;")
      .replace(
        "#include <begin_vertex>",
        /* glsl */ `#include <begin_vertex>
        {
          float ph = 0.0;
          #ifdef USE_INSTANCING
          ph = instanceMatrix[3].x * 3.1 + instanceMatrix[3].z * 1.7;
          #endif
          float f = 1.0 + sin(uTime * 13.0 + ph) * 0.12 + sin(uTime * 7.3 + ph * 2.0) * 0.1;
          transformed.y *= f;
          transformed.xz *= 2.0 - f;
          transformed.x += sin(uTime * 5.0 + ph) * 0.02 * max(transformed.y, 0.0) * 8.0;
        }`,
      );
  };
  material.customProgramCacheKey = () => "gd-flame";
  return material;
}

/** Crée un matériau toon de la scène. À mémoriser : un matériau par type d'objet, pas par instance. */
export function createToonMaterial(options: ToonOptions = {}): MeshToonMaterial {
  const material = new MeshToonMaterial({
    color: options.color ?? "#ffffff",
    vertexColors: options.vertexColors ?? false,
    emissive: options.emissive ?? "#000000",
    emissiveIntensity: options.emissiveIntensity ?? 1,
    gradientMap,
    side: options.doubleSide ? DoubleSide : FrontSide,
  });
  material.toneMapped = options.toneMapped ?? true;

  const defines: Record<string, string> = {};
  if (options.noise) defines.GD_NOISE = "";
  if (options.gradient) {
    defines.GD_GRADIENT = "";
    defines.GD_GRAD_LOW = options.gradient[0].toFixed(3);
    defines.GD_GRAD_HIGH = options.gradient[1].toFixed(3);
  }
  if (options.wind) defines.GD_WIND = "";
  if (options.reveal) defines.GD_REVEAL = "";
  material.defines = { ...material.defines, ...defines };

  const rimColor = new Color(options.rim ?? "#B8F0FF");
  const rimStrength = options.rimStrength ?? 0.35;
  const wind = options.wind ?? 0;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = sceneUniforms.uTime;
    shader.uniforms.uShadowTint = sceneUniforms.uShadowTint;
    shader.uniforms.uFog = sceneUniforms.uFog;
    shader.uniforms.uRevealTex = sceneUniforms.uRevealTex;
    shader.uniforms.uRimColor = { value: rimColor };
    shader.uniforms.uRimStrength = { value: rimStrength };
    shader.uniforms.uWind = { value: wind };

    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${VERTEX_PARS}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${VERTEX_WIND}`)
      .replace("#include <project_vertex>", `#include <project_vertex>\n${VERTEX_WORLD}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${FRAGMENT_PARS}`)
      .replace("#include <color_fragment>", `#include <color_fragment>\n${FRAGMENT_ALBEDO}`)
      .replace("#include <opaque_fragment>", `${FRAGMENT_LIGHT}\n#include <opaque_fragment>`);
  };
  // Les variantes (defines) partagent sinon le même programme compilé.
  const cacheKey = Object.entries(defines)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join(",");
  material.customProgramCacheKey = () => `gd-toon:${cacheKey}`;
  return material;
}
