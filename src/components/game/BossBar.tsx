"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useRef, useState } from "react";
import { useReducedMotion } from "@/lib/hooks";
import { useGame } from "./GameContext";

const BOSS = "#E8384F";
const YEAR_MS = 365.25 * 24 * 3600 * 1000;

/**
 * Barre du boss (en haut, au centre) pendant son combat : titre de l'issue,
 * ancienneté, phase, PV. Entrée en scène façon carton de titre (GSAP), qui
 * rejoue au passage en phase 2.
 */
export function BossBar() {
  const reduced = useReducedMotion();
  const model = useGame((s) => s.world.model);
  const combat = useGame((s) => s.state.combat);
  const boss = useGame((s) => s.state.monsters.find((m) => m.archetype === "boss")!);
  const scope = useRef<HTMLDivElement>(null);
  const inFight = combat !== null && boss.alive && boss.roomId === combat.roomId;
  const phase = boss.phase ?? 1;

  useGSAP(
    () => {
      if (!inFight || reduced) return;
      const tl = gsap.timeline();
      tl.from(".boss-card", { y: -30, scale: 1.25, autoAlpha: 0, duration: 0.55, ease: "back.out(1.6)" });
      tl.from(".boss-fill", { scaleX: 0, transformOrigin: "left center", duration: 0.7, ease: "power2.out" }, "-=0.2");
    },
    { dependencies: [inFight, phase], scope },
  );

  if (!inFight) return null;
  const issue = model.boss.issue;
  const pct = Math.max(0, Math.round((boss.hp / boss.maxHp) * 100));

  return (
    <div ref={scope} className="pointer-events-none absolute inset-x-0 top-2 flex justify-center px-3">
      <div className="boss-card hud-frame w-full max-w-md" style={{ ["--hud-rim" as string]: BOSS }}>
        <div className="hud-fill flex flex-col gap-1.5 px-3 py-2">
          <div className="flex items-baseline justify-between gap-3">
            <p className="truncate font-display text-base text-white">{model.boss.name}</p>
            <p className="shrink-0 font-mono text-[11px] text-white/60">
              Phase {phase} · {phase === 1 ? "Triage" : "Discussion"}
            </p>
          </div>
          <div className="h-2.5 w-full overflow-hidden border border-black/60 bg-[#3a2e5c]">
            <div className="boss-fill h-full transition-[width] duration-300" style={{ width: `${pct}%`, background: BOSS }} />
          </div>
          <p className="font-mono text-[10px] text-white/50">
            {issue ? (
              <>
                #{issue.number} · <IssueAge createdAt={issue.createdAt} /> · {issue.comments} commentaires
              </>
            ) : (
              "Legacy Code"
            )}
            {" · "}
            <span className="tabular-nums">
              {boss.hp}/{boss.maxHp} PV
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * « ouverte il y a N ans ». Composant à part : il n'est rendu qu'en plein combat,
 * jamais au prérendu (Cache Components refuse Date.now() dans le shell statique).
 * Instant figé au montage : une ancienneté en années n'a pas à se rafraîchir.
 */
function IssueAge({ createdAt }: { createdAt: string }) {
  const [now] = useState(() => Date.now());
  const years = Math.max(0, Math.floor((now - Date.parse(createdAt)) / YEAR_MS));
  return <>ouverte il y a {years === 0 ? "moins d'un an" : `${years} an${years > 1 ? "s" : ""}`}</>;
}
