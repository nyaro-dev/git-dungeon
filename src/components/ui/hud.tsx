import type { CSSProperties, ReactNode } from "react";
import { ACCENT } from "@/lib/theme";

/**
 * Primitives HUD de l'écran /character du portfolio (profile-ui.tsx) : cadre à
 * filet clair, plaque de titre inclinée terminée par « _ », lignes de points
 * entre un libellé et sa valeur. La géométrie vit dans globals.css (.hud-*).
 */

export function HudPanel({
  title,
  rim = ACCENT,
  className = "",
  bodyClassName = "",
  children,
}: {
  title?: string;
  /** Teinte du filet et des décalages de la plaque (rareté, accent…). */
  rim?: string;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`hud-frame relative ${title ? "mt-6" : ""} ${className}`}
      style={{ ["--hud-rim" as string]: rim } as CSSProperties}
    >
      <div className={`hud-fill h-full p-3 ${bodyClassName}`}>
        {title && <HudHead title={title} rim={rim} />}
        {children}
      </div>
    </section>
  );
}

/** Plaque de titre blanche, inclinée, posée au-dessus du panneau. */
export function HudHead({ title, rim = ACCENT, as: Tag = "h2" }: { title: string; rim?: string; as?: "h2" | "h3" }) {
  return (
    <div className="absolute bottom-full left-1 z-10">
      <span
        className="hud-tab relative inline-block px-3.5 py-[5px]"
        style={{ background: "linear-gradient(160deg, #ffffff 0%, #f0f2f8 55%, #d4d8e2 100%)", boxShadow: `4px -4px 0 ${rim}` }}
      >
        <Tag
          className="font-display text-[13px] leading-none tracking-[0.18em] text-[#14151a] uppercase italic"
          style={{ WebkitTextStroke: "0.6px #14151a" }}
        >
          {title}
          <span aria-hidden style={{ color: "#5d7a12", WebkitTextStroke: "0.6px #5d7a12" }}>
            _
          </span>
        </Tag>
      </span>
    </div>
  );
}

/** Ligne de stat : libellé, pointillés, valeur. */
export function StatRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="shrink-0 text-[11px] tracking-[0.12em] text-white/70 uppercase">{label}</span>
      <span aria-hidden className="hud-leader mb-1 flex-1" />
      <span className="shrink-0 font-mono text-[13px] font-bold text-white tabular-nums">{value}</span>
    </div>
  );
}

/** Jauge fine avec légende à droite. */
export function Gauge({ label, value, max, accent = ACCENT }: { label: string; value: number; max: number; accent?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round((value / Math.max(1, max)) * 100)));
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-[10px]">
        <span className="truncate tracking-[0.12em] text-white/70 uppercase">{label}</span>
        <span className="shrink-0 font-mono text-white/55 tabular-nums">
          <span style={{ color: accent }}>{value}</span>/{max}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        className="h-[3px] w-full overflow-hidden bg-white/[0.07]"
      >
        <div className="h-full transition-[width] duration-300 ease-out" style={{ width: `${pct}%`, background: accent }} />
      </div>
    </div>
  );
}

/** Pastilles de difficulté (N/5), comme le fanion des quêtes. */
export function Pips({ value, max = 5, color = ACCENT, label }: { value: number; max?: number; color?: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1" role="img" aria-label={`${label} : ${value} sur ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          aria-hidden
          className="h-2 w-2 rotate-45 border"
          style={{ borderColor: color, background: i < value ? color : "transparent" }}
        />
      ))}
    </span>
  );
}
