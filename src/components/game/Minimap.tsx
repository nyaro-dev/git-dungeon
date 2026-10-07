"use client";

import { useMemo } from "react";
import { featuresFor } from "@/lib/game/features";
import { ACCENT, PARCHMENT } from "@/lib/theme";
import { useGame } from "./GameContext";

/**
 * Mini-carte (GAMEDESIGN.md §3) : seulement ce qui est découvert. Salles
 * visitées, ponts qui en partent, secrets trouvés ; antichambre en rouge, HEAD
 * en olive, le héros en lime. Décorative : la position est donnée en texte par le HUD.
 */
export function Minimap() {
  const world = useGame((s) => s.world);
  const visited = useGame((s) => s.state.visitedRooms);
  const found = useGame((s) => s.state.foundSecrets);
  const hero = useGame((s) => s.state.hero.pos);
  const { model } = world;

  const corridors = useMemo(() => {
    const secretsHidden = new Set(featuresFor(model).secrets.filter((x) => !found.includes(x.roomId)).map((x) => x.roomId));
    return model.corridors.filter((c) => (visited.includes(c.from) || visited.includes(c.to)) && !secretsHidden.has(c.to));
  }, [model, visited, found]);

  const pad = 2;
  return (
    <svg
      aria-hidden
      viewBox={`${-pad} ${-pad} ${model.width + pad * 2} ${model.height + pad * 2}`}
      className="h-28 w-28 rounded-[10px] border border-white/15 bg-black/55 backdrop-blur-sm sm:h-36 sm:w-36"
    >
      {corridors.map((c) => (
        <polyline
          key={`${c.from}-${c.to}`}
          points={[c.doors[0], ...c.cells, c.doors[1]].map((p) => `${p.x + 0.5},${p.y + 0.5}`).join(" ")}
          fill="none"
          stroke="#A0703F"
          strokeWidth={0.9}
          strokeLinejoin="round"
        />
      ))}
      {model.rooms
        .filter((r) => visited.includes(r.id))
        .map((r) => (
          <rect
            key={r.id}
            x={r.rect.x}
            y={r.rect.y}
            width={r.rect.w}
            height={r.rect.h}
            rx={0.8}
            fill={r.kind === "antechamber" ? "#E8384F" : r.kind === "head" ? PARCHMENT.olive : r.name.startsWith(".") ? "#9B6BD4" : "#8C8A7A"}
            opacity={0.9}
          />
        ))}
      <circle cx={hero.x + 0.5} cy={hero.y + 0.5} r={2.2} fill={ACCENT} stroke="#0a0a0f" strokeWidth={0.8} />
    </svg>
  );
}
