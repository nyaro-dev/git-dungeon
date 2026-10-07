"use client";

import { PerformanceMonitor } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Bloom, BrightnessContrast, EffectComposer, HueSaturation, SMAA, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { Suspense, useState } from "react";
import { dprCap, getQualityTier, setQualityTier, type QualityTier } from "@/lib/perf";
import { CameraRig } from "./CameraRig";
import { FrameloopKick, useVisibleFrameloop } from "./canvas-utils";
import type { AnchorRegistry } from "@/components/game/anchors";
import { CombatOverlay } from "./CombatOverlay";
import { Entities } from "./Entities";
import { Features } from "./Features";
import { SceneDriver } from "./env/SceneDriver";
import { Void } from "./env/Void";
import { FxDirector } from "./fx/FxDirector";
import { FxProvider } from "./fx/fx";
import { Hero } from "./Hero";
import { TagProjector } from "./TagProjector";
import { World } from "./World";

/**
 * Scène « Néant du dépôt » (GAMEDESIGN.md §5) : îles flottantes en toon sur un
 * vide étoilé, post-traitement léger (bloom sélectif sur les flammes et cristaux,
 * étalonnage, vignette). S'anime en continu tant qu'elle est visible, s'arrête
 * net sinon. Palier « low » : DPR 1.25, pas de SMAA ni de multisampling,
 * nébuleuse simplifiée ; le design reste identique.
 */
export default function GameScene({
  reducedMotion,
  label,
  anchors,
}: {
  reducedMotion: boolean;
  label: string;
  /** Étiquettes DOM (intentions, dégâts) projetées depuis la scène. */
  anchors: AnchorRegistry;
}) {
  const [tier, setTier] = useState<QualityTier>(() => getQualityTier());
  const [dpr, setDpr] = useState(() => dprCap(getQualityTier()));
  const { ref, frameloop } = useVisibleFrameloop();

  return (
    <div ref={ref} className="h-full w-full">
      <Canvas frameloop={frameloop} dpr={[1, dpr]} gl={{ antialias: false, alpha: false, powerPreference: "high-performance" }} aria-label={label} role="img">
        {/* Une baisse ne fait que réduire le DPR (un à-coup de compilation de shaders la déclenche
            au chargement) ; seul un échec durable (flipflops épuisés) fixe le palier « low ». */}
        <PerformanceMonitor
          flipflops={3}
          onDecline={() => setDpr(1)}
          onIncline={() => setDpr(dprCap(tier))}
          onFallback={() => {
            setQualityTier("low");
            setTier("low");
            setDpr(1);
          }}
        />
        {/* Fond opaque obligatoire : sans scene.background, la cible du composer est vidée en
            transparent et sa sortie finale est noire. Le vide étoilé (Void) le recouvre. */}
        <color attach="background" args={["#05070D"]} />
        <FrameloopKick frameloop={frameloop} />
        <SceneDriver reducedMotion={reducedMotion} />
        <Void quality={tier} />
        {/* Ciel froid, sol violet, soleil chaud : les ombres restent colorées. */}
        <hemisphereLight args={["#9FB8FF", "#4A3B5C", 1.05]} />
        <directionalLight position={[-4, 10, 6]} intensity={1.7} color="#FFE9C4" />
        <FxProvider reducedMotion={reducedMotion}>
          <CameraRig reducedMotion={reducedMotion} />
          {/* Le kit (44 Ko) est préchargé dès l'import du module ; rien n'est dessiné avant lui. */}
          <Suspense fallback={null}>
            <World />
            <Entities />
            <Features />
            <Hero reducedMotion={reducedMotion} />
          </Suspense>
          <CombatOverlay />
          <FxDirector />
          <TagProjector registry={anchors} />
        </FxProvider>
        {/* Une clé par palier : le composer est remonté proprement plutôt que modifié en cours de route
            (changer ses enfants ou son multisampling à chaud laissait l'écran noir). */}
        <EffectComposer key={tier} multisampling={tier === "low" ? 0 : 4}>
          {[
            <Bloom key="bloom" mipmapBlur luminanceThreshold={1} luminanceSmoothing={0.2} intensity={0.75} />,
            <HueSaturation key="hue" saturation={0.08} />,
            <BrightnessContrast key="bc" contrast={0.06} />,
            <Vignette key="vignette" offset={0.3} darkness={0.5} />,
            <ToneMapping key="tone" mode={ToneMappingMode.NEUTRAL} />,
            ...(tier === "high" ? [<SMAA key="smaa" />] : []),
          ]}
        </EffectComposer>
      </Canvas>
    </div>
  );
}
