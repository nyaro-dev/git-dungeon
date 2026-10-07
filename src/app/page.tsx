import Link from "next/link";
import type { CSSProperties } from "react";
import { RiveIcon } from "@/components/fx/RiveIcon";
import { RepoForm } from "@/components/home/RepoForm";
import { Pips } from "@/components/ui/hud";
import { EXAMPLE_REPOS } from "@/lib/examples";
import { RARITY_COLOR, RARITY_LABEL } from "@/lib/theme";

export default function Home() {
  return (
    <main className="qm-hud mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-12 px-4 py-16 sm:px-6">
      <header className="flex flex-col gap-5">
        {/* div et non p : le canvas Rive s'enveloppe d'une <div>, interdite dans un <p>. */}
        <div className="flex items-center gap-2 font-mono text-xs tracking-[0.3em] text-lime uppercase">
          <RiveIcon kind="skull" className="h-7 w-7" />
          Git Dungeon
        </div>
        <h1 className="font-display text-5xl leading-[0.95] text-balance sm:text-7xl">
          Ton historique Git est un <span className="text-lime">donjon</span>.
        </h1>
        <p className="max-w-xl text-lg text-pretty text-muted">
          Les dossiers deviennent des salles, les gros fichiers des coffres, les issues ouvertes des monstres. La plus
          vieille garde la sortie : la salle <span className="font-mono text-foreground">HEAD</span>.
        </p>
      </header>

      <RepoForm />

      <section aria-labelledby="quests" className="flex flex-col gap-4">
        <div className="qm-rule text-subtle" style={{ ["--qm-rule-line" as string]: "rgba(255,255,255,0.18)" } as CSSProperties}>
          <h2 id="quests" className="font-display text-sm tracking-[0.25em] text-muted uppercase">
            Quêtes conseillées
          </h2>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2">
          {EXAMPLE_REPOS.map(({ fullName, hint, rarity, difficulty }, i) => (
            <li key={fullName}>
              <Link
                href={`/d/${fullName}`}
                className="qm-paper group relative flex flex-col gap-2 rounded-[6px] px-4 pt-3 pb-4 transition-transform duration-300 ease-[cubic-bezier(.34,1.56,.64,1)] hover:-translate-y-1 motion-reduce:transition-none"
                style={{ rotate: `${i % 2 ? 0.6 : -1.2}deg` }}
              >
                {/* Fanion de rareté, découpé comme celui des fiches de quête. */}
                <span
                  className="absolute top-0 right-4 px-2 pt-1 pb-3 text-[10px] font-semibold tracking-wider text-[#1d1e23] uppercase"
                  style={{ background: RARITY_COLOR[rarity], clipPath: "polygon(0 0, 100% 0, 100% 100%, 50% 78%, 0 100%)" }}
                >
                  {RARITY_LABEL[rarity]}
                </span>
                <span className="qm-title pr-20 text-xl leading-tight">{fullName.split("/")[1]}</span>
                <span className="font-mono text-xs text-[var(--qm-ink-3)]">{fullName}</span>
                <span className="text-sm text-[var(--qm-ink-2)]">{hint}</span>
                <span className="flex items-center gap-2 text-[11px] tracking-wider text-[var(--qm-ink-3)] uppercase">
                  Difficulté <Pips value={difficulty} color="var(--qm-olive)" label="Difficulté" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
