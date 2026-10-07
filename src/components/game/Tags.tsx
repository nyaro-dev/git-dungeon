"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Point } from "@/lib/dungeon/types";
import { ARCHETYPES } from "@/lib/game/monsters";
import { previewCast } from "@/lib/game/rules";
import type { Intent, MonsterState } from "@/lib/game/types";
import { ACCENT, issueColor } from "@/lib/theme";
import { useAnchor } from "./anchors";
import { useGame, useGameStore } from "./GameContext";

/**
 * Étiquettes de la scène, en DOM (projetées par TagProjector) : intention et PV
 * au-dessus des monstres en combat, aperçu exact des dégâts pendant la visée,
 * chiffres de dégâts qui rebondissent. Décoratives (aria-hidden) : le HUD porte
 * l'information accessible (frise, messages).
 */
export function Tags() {
  const state = useGame((s) => s.state);
  const world = useGame((s) => s.world);
  const aiming = useGame((s) => s.aiming);
  const hover = useGame((s) => s.hover);
  const combat = state.status === "combat" ? state.combat : null;

  const preview = useMemo(() => {
    if (!combat || !aiming || !hover) return [];
    return previewCast(world, state, aiming, hover).flatMap((e) =>
      e.type === "damage" ? [{ at: e.at, amount: e.amount, hero: e.unit.kind === "hero" }] : [],
    );
  }, [combat, aiming, hover, world, state]);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {combat &&
        state.monsters
          .filter((m) => m.alive && m.roomId === combat.roomId)
          .map((m) => <MonsterTag key={m.id} monster={m} />)}
      {preview.map((p, i) => (
        <PreviewTag key={`${i}:${p.at.x},${p.at.y}`} id={`preview-${i}`} at={p.at} amount={p.amount} hero={p.hero} />
      ))}
      <DamagePopups />
    </div>
  );
}

const INTENT_ICON: Record<Intent["kind"], string> = {
  strike: "⚔",
  shoot: "➶",
  charge: "➤",
  reproduce: "✳",
  sweep: "⚔⚔",
  summon: "☄",
  comments: "💬",
};

function MonsterTag({ monster }: { monster: MonsterState }) {
  const height = monster.archetype === "boss" ? 1.75 : 1.05;
  const ref = useAnchor(`monster-${monster.id}`, monster.pos.x, height, monster.pos.y);
  const color = monster.issue !== null ? issueColor(monster.issue) : "#a1a1aa";
  const pct = Math.round((monster.hp / monster.maxHp) * 100);
  return (
    <div ref={ref} className="gd-anchor gd-tag absolute top-0 left-0" style={{ ["--tag" as string]: color }} title={ARCHETYPES[monster.archetype].blurb}>
      {monster.intent && (
        <span className={`gd-intent gd-intent--${monster.intent.kind}`}>
          {INTENT_ICON[monster.intent.kind]}
          {"damage" in monster.intent ? <b>{monster.intent.damage}</b> : null}
        </span>
      )}
      <span className="gd-hp">
        <span style={{ width: `${pct}%` }} />
      </span>
    </div>
  );
}

function PreviewTag({ id, at, amount, hero }: { id: string; at: Point; amount: number; hero: boolean }) {
  const ref = useAnchor(id, at.x, 1.35, at.y);
  return (
    <span ref={ref} className={`gd-anchor gd-preview absolute top-0 left-0 ${hero ? "gd-preview--hero" : ""}`}>
      −{amount}
    </span>
  );
}

type Popup = { id: number; at: Point; text: string; color: string; size: number; lane: number };
const LIFETIME_MS = 950;

/** Chiffres de dégâts et de soin (CSS .gd-pop). La taille suit les dégâts. */
function DamagePopups() {
  const store = useGameStore();
  const [popups, setPopups] = useState<Popup[]>([]);
  const nextId = useRef(0);

  useEffect(
    () =>
      store.subscribe((s, prev) => {
        if (s.seq === prev.seq) return;
        const fresh: Popup[] = [];
        const push = (p: Omit<Popup, "id" | "lane">) => fresh.push({ ...p, id: nextId.current++, lane: fresh.length % 3 });
        for (const e of s.state.events) {
          if (e.type === "damage") {
            const bonk = e.source === "wall" || e.source === "collision";
            push({
              at: e.at,
              text: bonk ? `BONK ${e.amount}` : `${e.amount}`,
              color: e.unit.kind === "hero" ? "#E8384F" : bonk ? "#FF7A1A" : "#ffffff",
              size: Math.min(40, 18 + e.amount * 2.2),
            });
          } else if (e.type === "heal") {
            push({ at: e.at, text: `+${e.amount}`, color: ACCENT, size: 22 });
          } else if (e.type === "killed" && e.unit.kind === "monster" && e.issue !== null) {
            push({ at: e.at, text: `#${e.issue} closed ✓`, color: ACCENT, size: 16 });
          }
        }
        if (fresh.length === 0) return;
        setPopups((list) => [...list, ...fresh]);
        const ids = new Set(fresh.map((p) => p.id));
        window.setTimeout(() => setPopups((list) => list.filter((p) => !ids.has(p.id))), LIFETIME_MS + 300);
      }),
    [store],
  );

  return (
    <>
      {popups.map((p) => (
        <PopupTag key={p.id} popup={p} />
      ))}
    </>
  );
}

function PopupTag({ popup: p }: { popup: Popup }) {
  const ref = useAnchor(`pop-${p.id}`, p.at.x, 1.1 + p.lane * 0.18, p.at.y);
  return (
    <span ref={ref} className="gd-anchor absolute top-0 left-0">
      <span className="gd-pop" style={{ ["--pop-color" as string]: p.color, ["--pop-size" as string]: `${p.size}px` }}>
        {p.text}
      </span>
    </span>
  );
}
