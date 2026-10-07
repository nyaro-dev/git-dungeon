import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DungeonMap } from "@/components/debug/DungeonMap";
import { Game } from "@/components/game/Game";
import { generateDungeon } from "@/lib/dungeon/generate";
import { validateDungeon } from "@/lib/dungeon/validate";
import { RepoSnapshotSchema, type RepoSnapshot } from "@/lib/ingest/snapshot";
import hand from "../../../tests/fixtures/hand.json";

export const metadata: Metadata = { title: "Debug — Git Dungeon", robots: { index: false } };

const handFixture = RepoSnapshotSchema.parse(hand);

function syntheticMonorepo(): RepoSnapshot {
  const tree: RepoSnapshot["tree"] = [];
  for (let i = 0; i < 2000; i++) {
    tree.push({ path: `packages/p${i % 90}/src/m${i % 7}/f${i}.ts`, size: (i * 7919) % 50000, type: "blob" });
  }
  return {
    ...handFixture,
    fullName: "synthetic/monorepo",
    tree,
    issues: Array.from({ length: 100 }, (_, i) => ({
      number: i + 1,
      title: `Issue ${i + 1}`,
      comments: i % 20,
      createdAt: `2024-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`,
      labels: i % 3 === 0 ? ["bug"] : [],
    })),
  };
}

/** Vrais repos figés par `pnpm fixture` (lus depuis le disque : la page n'existe qu'en dev). */
function realFixtures(): { label: string; snapshot: RepoSnapshot }[] {
  const dir = join(process.cwd(), "tests", "fixtures");
  return readdirSync(dir)
    .filter((file) => file.endsWith(".json") && file !== "hand.json")
    .sort()
    .map((file) => ({
      label: `Vrai repo — ${file.replace(/\.json$/, "")}`,
      snapshot: RepoSnapshotSchema.parse(JSON.parse(readFileSync(join(dir, file), "utf8"))),
    }));
}

const CASES: { label: string; snapshot: RepoSnapshot }[] = [
  { label: "Fixture faite main", snapshot: handFixture },
  { label: "Même repo, autre sha", snapshot: { ...handFixture, sha: "f".repeat(40) } },
  { label: "Repo calme (sans issue)", snapshot: { ...handFixture, issues: [] } },
  { label: "Repo vide", snapshot: { ...handFixture, fullName: "acme/empty", tree: [], issues: [] } },
  { label: "Monorepo synthétique (2 000 fichiers)", snapshot: syntheticMonorepo() },
];

/** Vue 2D des donjons générés, pour juger les cas limites à l'œil. Dev uniquement. */
export default function DebugPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="flex flex-col gap-10 bg-zinc-950 p-4 text-zinc-100 sm:p-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Git Dungeon — vue debug</h1>
        <p className="text-sm text-zinc-400">
          <span className="text-green-400">●</span> héros · <span className="text-red-500">●</span> boss ·{" "}
          <span className="text-orange-500">●</span> monstre · <span className="text-blue-500">●</span> PNJ ·{" "}
          <span className="text-yellow-500">■</span> coffre · <span className="text-violet-600">■</span> porte scellée.
          Survol = détails.
        </p>
      </header>
      <section aria-labelledby="playground" className="flex flex-col gap-3">
        <h2 id="playground" className="text-lg font-medium">
          Aire de jeu — fixture faite main
        </h2>
        <Game model={generateDungeon(handFixture)} />
      </section>
      {[...realFixtures(), ...CASES].map(({ label, snapshot }) => {
        const model = generateDungeon(snapshot);
        const errors = validateDungeon(model);
        return (
          <section key={label} className="flex flex-col gap-3">
            <h2 className="text-lg font-medium">
              {label} <span className="text-sm text-zinc-500">{model.repo.fullName}</span>
            </h2>
            <p className="text-sm text-zinc-400">
              {model.rooms.length} salles · {model.monsters.length} monstres · {model.chests.length} coffres ·{" "}
              {model.npcs.length} PNJ · grille {model.width}×{model.height} · boss : {model.boss.name}
            </p>
            {errors.length > 0 && (
              <ul className="list-disc pl-5 text-sm text-red-400">
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
            <div className="overflow-auto">
              <DungeonMap model={model} />
            </div>
          </section>
        );
      })}
    </main>
  );
}
