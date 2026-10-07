"use client";

// Doit venir en premier : pointe le runtime vers le WASM auto-hébergé avant useRive.
import "./rive-runtime";
import { Alignment, Fit, Layout, useRive } from "@rive-app/react-canvas";
import { useEffect } from "react";

export default function RiveIconInner({
  artboard,
  animation,
  stillAnimation,
  still,
}: {
  artboard: string;
  /** Timeline à jouer ; sans elle, la state machine « State Machine 1 ». */
  animation?: string;
  /** Timeline dont on fige la première image en mouvement réduit. */
  stillAnimation?: string;
  still: boolean;
}) {
  const { rive, RiveComponent } = useRive({
    src: "/rive/icons.riv",
    artboard,
    ...(animation ? { animations: animation } : { stateMachines: "State Machine 1" }),
    autoplay: !still,
    layout: new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
  });

  // Mouvement réduit : une image fixe, rien ne joue.
  useEffect(() => {
    if (rive && still && stillAnimation) rive.scrub(stillAnimation, 0);
  }, [rive, still, stillAnimation]);

  return <RiveComponent className="h-full w-full" />;
}
