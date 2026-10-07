"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useRef } from "react";
import { RiveIcon, type RiveIconKind } from "@/components/fx/RiveIcon";
import { Gauge, HudPanel, StatRow } from "@/components/ui/hud";
import type { DungeonModel } from "@/lib/dungeon/types";
import { ABILITIES } from "@/lib/game/abilities";
import { ARCHETYPES } from "@/lib/game/monsters";
import { featuresFor } from "@/lib/game/features";
import { HERO_PA, HERO_PM, completion, heroAbilities } from "@/lib/game/rules";
import type { Loot } from "@/lib/game/loot";
import type { AbilityId, GameEvent, GameState, MonsterState } from "@/lib/game/types";
import { useReducedMotion } from "@/lib/hooks";
import { ACCENT, CONTRAST, issueColor } from "@/lib/theme";
import { BossBar } from "./BossBar";
import { Minimap } from "./Minimap";
import { useGame, useGameStore } from "./GameContext";

gsap.registerPlugin(useGSAP);

type Notice = { text: string; icon: RiveIconKind | null; tone?: "danger" | "good" };

const DENIED: Record<Extract<GameEvent, { type: "denied" }>["reason"], string> = {
  "no-pa": "Pas assez de PA.",
  "no-pm": "Plus de PM ce tour-ci.",
  tackled: "Taclé : il faut plus de PM pour quitter le contact.",
  "out-of-range": "Hors de portée.",
  "no-line-of-sight": "Pas de ligne de vue.",
  occupied: "Case occupée.",
  "arena-sealed": "L'arène est scellée pendant le combat.",
  "once-per-turn": "Une fois par tour.",
  "once-per-combat": "Une fois par combat.",
  "not-your-turn": "Pas maintenant.",
  "invalid-target": "Cible invalide.",
  "choose-loot": "Choisis d'abord quoi faire du nouveau sort.",
};

const LOOT_TEXT = (loot: Loot): string => {
  switch (loot.kind) {
    case "spell":
      return `Nouveau sort : ${ABILITIES[loot.spell].name}`;
    case "atk":
      return `+${loot.amount} ATK`;
    case "def":
      return `+${loot.amount} DEF`;
    case "hp":
      return `+${loot.amount} PV max`;
  }
};

const monsterName = (m: MonsterState | undefined) => (m ? (m.issue !== null ? `${ARCHETYPES[m.archetype].name} #${m.issue}` : ARCHETYPES[m.archetype].name) : "Un monstre");

/** Texte d'un événement, dans le ton du jeu ; null s'il n'y a rien à annoncer. */
function describe(event: GameEvent | null, model: DungeonModel, state: GameState): Notice | null {
  if (!event) return null;
  const monster = (id: number) => state.monsters.find((m) => m.id === id);
  switch (event.type) {
    case "sealed":
      return { text: `Quête scellée : vaincs « ${model.boss.name} » pour ouvrir HEAD.`, icon: "skull" };
    case "entered-room": {
      const room = model.rooms[event.roomId];
      if (room.kind === "head" || !event.firstVisit) return null;
      return { text: `Salle découverte : ${room.name}`, icon: "star" };
    }
    case "won":
      return { text: `HEAD atteinte en ${state.turn} tours.`, icon: "starBurst", tone: "good" };
    case "combat-start":
      return { text: "Combat ! L'arène se scelle.", icon: "skull", tone: "danger" };
    case "combat-won":
      return { text: "Salle nettoyée.", icon: "star", tone: "good" };
    case "killed":
      return event.unit.kind === "monster" && event.issue !== null
        ? { text: `Issue #${event.issue} closed ✓`, icon: "star", tone: "good" }
        : null;
    case "hero-dead":
      return { text: "Merge conflict… la run est perdue.", icon: "skull", tone: "danger" };
    case "spawned":
      return { text: "Le bug se reproduit !", icon: "skull", tone: "danger" };
    case "chest-opened": {
      const file = model.chests[event.chest].file;
      if (event.outcome === "duplicate") return { text: `${file} : sort déjà connu, converti en soin.`, icon: "star", tone: "good" };
      if (event.outcome === "pending") return { text: `${file} : ${LOOT_TEXT(event.loot)}. Où le ranger ?`, icon: "starBurst", tone: "good" };
      return { text: `${file} : ${LOOT_TEXT(event.loot)}`, icon: "starBurst", tone: "good" };
    }
    case "equipped":
      return {
        text: `${ABILITIES[event.spell].name} équipé${event.replaced ? ` à la place de ${ABILITIES[event.replaced].name}` : ""}.`,
        icon: "star",
        tone: "good",
      };
    case "loot-discarded":
      return { text: `Tu laisses ${ABILITIES[event.spell].name} au fond du coffre.`, icon: null };
    case "secret-found":
      return { text: `Salle secrète : ${model.rooms[event.roomId].name} !`, icon: "starBurst", tone: "good" };
    case "locked": {
      const f = featuresFor(model);
      const where = f.keyChest !== null ? model.rooms[model.chests[f.keyChest].roomId].name : "le donjon";
      return { text: `Verrouillé. La Clé HEAD dort dans le plus gros coffre (${where}).`, icon: "skull" };
    }
    case "key-found":
      return { text: "Tu trouves la Clé HEAD ! L'antichambre s'ouvre.", icon: "starBurst", tone: "good" };
    case "fountain":
      return { text: `Fontaine du commit « fix » : +${event.amount} PV.`, icon: "star", tone: "good" };
    case "teleported":
      return { text: "Le portail « revert » te ramène en arrière.", icon: "star" };
    case "cache-opened":
      return {
        text:
          event.outcome === "duplicate"
            ? "Cache « feat » : sort déjà connu, converti en soin."
            : `Cache « feat » : ${ABILITIES[event.spell].name}${event.outcome === "pending" ? ". Où le ranger ?" : " !"}`,
        icon: "starBurst",
        tone: "good",
      };
    case "boss-intro":
      return { text: `${model.boss.name} se dresse devant HEAD.`, icon: "skull", tone: "danger" };
    case "boss-phase":
      return { text: "Phase 2 : la discussion s'envenime. Gare aux commentaires !", icon: "skull", tone: "danger" };
    case "stunned":
      return { text: `${monsterName(monster(event.monster))} se cogne contre un pilier LGTM : étourdi !`, icon: "star", tone: "good" };
    case "intent-cancelled":
      return { text: `${monsterName(monster(event.monster))} perd le fil.`, icon: "star" };
    case "denied":
      return { text: DENIED[event.reason], icon: null, tone: "danger" };
    case "bump": {
      const e = event.entity;
      if (e.kind === "boss") return { text: `${model.boss.name} garde la porte de HEAD.`, icon: "skull" };
      if (e.kind === "chest") return { text: `Un coffre : ${model.chests[e.id].file}`, icon: "star" };
      if (e.kind === "npc") return { text: `${model.npcs[e.id].login} te salue.`, icon: null };
      if (e.kind === "hall-portal") return { text: "Le portail dort : emprunte d'abord un portail « revert ».", icon: null };
      if (e.kind === "feature") return null;
      return { text: `${monsterName(monster(e.id))} te barre la route.`, icon: "skull" };
    }
    default:
      return null;
  }
}

/** HUD en DOM accessible, par-dessus la scène (le canvas reste décoratif pour l'accessibilité). */
export function Hud() {
  const store = useGameStore();
  const reduced = useReducedMotion();
  const model = useGame((s) => s.world.model);
  const roomAt = useGame((s) => s.world.roomAt);
  const width = useGame((s) => s.world.width);
  const state = useGame((s) => s.state);
  const lastNotice = useGame((s) => s.lastNotice);
  const { status, hero, combat } = state;
  const started = state.turn > 0 || lastNotice !== null;

  const roomId = roomAt[hero.pos.y * width + hero.pos.x];
  const location = roomId === -1 ? "Pont" : model.rooms[roomId].name;
  const notice = describe(lastNotice, model, state);
  const world = useGame((s) => s.world);
  const progress = completion(world, state);

  const scope = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      if (reduced || !notice) return;
      gsap.from(".hud-notice", { y: 14, autoAlpha: 0, duration: 0.4, ease: "power3.out" });
    },
    // `lastNotice` est un nouvel objet à chaque événement : même un message identique rejoue l'entrée.
    { dependencies: [lastNotice], scope },
  );
  useGSAP(
    () => {
      if (reduced || (status !== "won" && status !== "dead")) return;
      gsap.from(".hud-end", { x: -48, scale: 0.98, autoAlpha: 0, duration: 0.45, ease: "power3.out" });
      gsap.from(".hud-end .qm-stagger", { y: 14, autoAlpha: 0, duration: 0.4, stagger: 0.05, delay: 0.15, ease: "power3.out" });
    },
    { dependencies: [status], scope },
  );
  useGSAP(
    () => {
      if (reduced || status !== "combat") return;
      gsap.from(".hud-combat", { y: 24, autoAlpha: 0, duration: 0.35, ease: "back.out(1.4)" });
    },
    { dependencies: [status === "combat"], scope },
  );

  const arena = combat ? state.monsters.filter((m) => m.alive && m.roomId === combat.roomId).sort((a, b) => (a.issue ?? Infinity) - (b.issue ?? Infinity) || a.id - b.id) : [];

  return (
    <div ref={scope} className="qm-hud pointer-events-none absolute inset-0">
      {/* Héros et position */}
      <div className="absolute top-2 left-3 w-56 sm:w-64">
        <HudPanel title={status === "combat" ? `Tour ${combat?.round}` : "Position"}>
          <div role="status" className="flex flex-col gap-2">
            <p className="truncate font-display text-lg leading-tight text-white">{location}</p>
            <Gauge label="PV" value={hero.hp} max={hero.maxHp} accent={hero.hp <= hero.maxHp * 0.3 ? "#E8384F" : ACCENT} />
            {combat ? (
              <div className="flex items-center justify-between gap-3 text-[11px] tracking-[0.12em] text-white/70 uppercase">
                <Points label="PA" value={combat.pa} max={HERO_PA} color={ACCENT} />
                <Points label="PM" value={combat.pm} max={HERO_PM} color={CONTRAST} />
              </div>
            ) : (
              <>
                <StatRow label="Tour" value={state.turn} />
                <Gauge label={`Complétion ${progress.percent} %`} value={progress.done} max={progress.total} />
                <div className="flex items-center justify-between gap-2 text-[11px] text-white/60">
                  <span>
                    ATK <span className="font-mono text-white">{hero.atk}</span> · DEF <span className="font-mono text-white">{hero.def}</span>
                  </span>
                  {state.hasKey && <span className="font-mono text-lime">⚿ Clé HEAD</span>}
                </div>
              </>
            )}
          </div>
        </HudPanel>
      </div>

      <BossBar />

      {/* Frise d'initiative */}
      {combat && arena.length > 0 && (
        <ol aria-label="Ordre du tour des ennemis" className="absolute top-24 right-3 flex w-44 flex-col gap-1.5 sm:top-2 sm:w-52">
          {arena.map((m) => (
            <li key={m.id} className="hud-frame">
              <div className="hud-fill flex items-center gap-2 px-2 py-1.5">
                <span aria-hidden className="h-3 w-3 shrink-0 rotate-45 border border-black/60" style={{ background: m.issue !== null ? issueColor(m.issue) : "#a1a1aa" }} />
                <span className="min-w-0 flex-1 truncate text-xs text-white">{monsterName(m)}</span>
                <span className="font-mono text-[11px] text-white/70 tabular-nums">
                  {m.hp}/{m.maxHp}
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}

      {/* Mini-carte (exploration) */}
      {status === "exploring" && (
        <div className="absolute right-3 bottom-3">
          <Minimap />
        </div>
      )}

      {/* Barre de combat */}
      {status === "combat" && <CombatBar abilities={heroAbilities(state)} state={state} />}

      {/* Choix de butin : deux emplacements pleins */}
      {state.pendingSpell && <LootChoice spell={state.pendingSpell} slots={hero.spells} />}

      {/* Fin de partie */}
      {(status === "won" || status === "dead") && (
        <div className="hud-end noise-panel pointer-events-auto absolute inset-x-3 top-1/2 mx-auto flex max-w-sm -translate-y-1/2 flex-col items-center gap-3 p-6 text-center backdrop-blur-sm" style={status === "dead" ? { ["--rarity" as string]: "#E8384F" } : undefined}>
          <RiveIcon kind={status === "won" ? "starBurst" : "skull"} className="qm-stagger h-16 w-16" />
          <h2 className="qm-stagger font-display text-3xl text-white">{status === "won" ? "Quête terminée" : "Merge conflict"}</h2>
          <p className="qm-stagger text-sm text-muted">
            {status === "won" ? (
              <>
                HEAD atteinte en <span className="font-mono text-lime">{state.turn}</span> tours,{" "}
                <span className="font-mono text-lime">{progress.percent} %</span> de complétion
                {progress.percent === 100 ? " (Working tree clean ✓)" : ""},{" "}
                <span className="font-mono text-lime">{state.monsters.filter((m) => !m.alive).length}</span> issues fermées.
              </>
            ) : (
              <>Tes PV sont tombés à zéro. Même donjon, même seed : tu connais le terrain maintenant.</>
            )}
          </p>
          <button type="button" onClick={() => store.getState().reset()} className="qm-stagger pi-btn pi-btn--main cta-noise relative">
            <span className="relative z-0">{status === "won" ? "Rejouer" : "Relancer la run"}</span>
          </button>
        </div>
      )}

      {/* Messages */}
      <div className={`absolute inset-x-0 flex flex-col items-center gap-2 p-3 ${status === "combat" ? "bottom-24" : "bottom-0"}`}>
        <p aria-live="polite" className="sr-only">
          {notice?.text}
        </p>
        {notice && (
          <div
            aria-hidden
            className={`hud-notice qm-paper flex max-w-xl items-center gap-2 rounded-[14px] py-2 pr-4 pl-2 text-sm ${notice.tone === "danger" ? "ring-2 ring-[#E8384F]/60" : ""}`}
          >
            {notice.icon ? <RiveIcon kind={notice.icon} className="h-8 w-8 shrink-0" /> : <span className="w-2" />}
            <span>{notice.text}</span>
          </div>
        )}
        {!started && status === "exploring" && (
          <p className="qm-paper rounded-full px-4 py-1.5 text-xs">
            <span className="hidden sm:inline">Flèches, ZQSD ou WASD pour se déplacer · clic pour y aller · molette pour zoomer</span>
            <span className="sm:hidden">Touche une case pour y aller · pince pour zoomer</span>
          </p>
        )}
      </div>
    </div>
  );
}

/** Points d'action ou de mouvement en losanges (pleins = disponibles). */
function Points({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <span className="flex items-center gap-1.5" role="img" aria-label={`${label} : ${value} sur ${max}`}>
      {label}
      <span className="flex gap-1">
        {Array.from({ length: max }, (_, i) => (
          <span key={i} aria-hidden className="h-2.5 w-2.5 rotate-45 border" style={{ borderColor: color, background: i < value ? color : "transparent" }} />
        ))}
      </span>
    </span>
  );
}

/** Capacités (touches 1–4) et fin de tour (Espace). */
function CombatBar({ abilities, state }: { abilities: AbilityId[]; state: GameState }) {
  const store = useGameStore();
  const aiming = useGame((s) => s.aiming);
  const busy = useGame((s) => s.busy);
  const combat = state.combat!;
  return (
    <div className="hud-combat pointer-events-auto absolute inset-x-0 bottom-3 flex flex-wrap items-end justify-center gap-2 px-3">
      {abilities.map((id, i) => {
        const a = ABILITIES[id];
        const used =
          (a.perTurn !== undefined && combat.usedThisTurn.includes(id)) || (a.perCombat !== undefined && combat.usedThisCombat.includes(id));
        const disabled = busy || used || combat.pa < a.cost;
        const active = aiming === id;
        return (
          <button
            key={id}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => (a.target === "self" ? store.getState().cast(id, state.hero.pos) : store.getState().aim(id))}
            title={a.description}
            className={`hud-frame w-28 text-left transition-transform duration-150 ease-out disabled:opacity-45 sm:w-32 ${active ? "-translate-y-1.5" : "hover:-translate-y-0.5"}`}
            style={active ? { background: ACCENT } : undefined}
          >
            <span className="hud-fill flex h-full flex-col gap-0.5 px-2 py-1.5">
              <span className="flex items-baseline justify-between gap-1">
                <span className="truncate font-display text-[13px] text-white">{a.name}</span>
                <kbd className="font-mono text-[10px] text-white/50">{i + 1}</kbd>
              </span>
              <span className="font-mono text-[10px] text-white/60">
                <span className="text-lime">{a.cost} PA</span>
                {a.range[1] > 0 ? ` · ${a.range[0]}–${a.range[1]}${a.line ? " en ligne" : ""}` : " · soi"}
                {used ? " · utilisé" : ""}
              </span>
            </span>
          </button>
        );
      })}
      <button type="button" disabled={busy} onClick={() => store.getState().endTurn()} className="pi-btn pi-btn--main cta-noise relative min-h-12">
        <span className="relative z-0">
          {busy ? (
            "Les ennemis jouent…"
          ) : (
            <>
              Fin du tour <kbd className="ml-1 font-mono text-xs opacity-60">Espace</kbd>
            </>
          )}
        </span>
      </button>
    </div>
  );
}

/** Fenêtre de choix quand un sort est trouvé et que les deux emplacements sont pleins. */
function LootChoice({ spell, slots }: { spell: NonNullable<GameState["pendingSpell"]>; slots: GameState["hero"]["spells"] }) {
  const store = useGameStore();
  const found = ABILITIES[spell];
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="loot-title"
      className="noise-panel pointer-events-auto absolute inset-x-3 top-1/2 mx-auto flex max-w-md -translate-y-1/2 flex-col gap-4 p-5 backdrop-blur-sm"
      style={{ ["--rarity" as string]: ACCENT }}
    >
      <div className="flex items-center gap-3">
        <RiveIcon kind="starBurst" className="h-12 w-12 shrink-0" />
        <div>
          <h2 id="loot-title" className="font-display text-2xl text-white">
            {found.name}
          </h2>
          <p className="text-sm text-muted">{found.description}</p>
        </div>
      </div>
      <p className="text-xs tracking-[0.15em] text-white/60 uppercase">Remplacer</p>
      <div className="grid grid-cols-2 gap-2">
        {slots.map((s, i) =>
          s ? (
            <button key={s} type="button" onClick={() => store.getState().equip(i as 0 | 1)} className="hud-frame text-left">
              <span className="hud-fill flex flex-col px-3 py-2">
                <span className="font-display text-sm text-white">{ABILITIES[s].name}</span>
                <span className="text-[11px] text-white/60">{ABILITIES[s].description}</span>
              </span>
            </button>
          ) : null,
        )}
      </div>
      <button type="button" onClick={() => store.getState().equip(null)} className="pi-btn min-h-10 self-center px-4 text-sm">
        Laisser {found.name}
      </button>
    </div>
  );
}
