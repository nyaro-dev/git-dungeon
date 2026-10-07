import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { IngestError } from "@/components/dungeon/IngestError";
import { Game } from "@/components/game/Game";
import { isSha, tryParseRepo } from "@/lib/ingest/repo-name";
import { getDungeon, getHead } from "@/lib/server/dungeon";

export default function DungeonPage({ params, searchParams }: PageProps<"/d/[owner]/[repo]">) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <nav>
        <Link href="/" className="font-display text-lg tracking-wider text-lime hover:text-lime-hover">
          ← Git Dungeon
        </Link>
      </nav>
      <Suspense fallback={<DungeonLoading />}>
        <DungeonLoader params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

function DungeonLoading() {
  return (
    <p role="status" className="qm-hud">
      <span className="qm-paper inline-block rounded-full px-4 py-2 text-sm">
        Le maître du donjon lit l&apos;historique du dépôt…
      </span>
    </p>
  );
}

async function DungeonLoader({ params, searchParams }: PageProps<"/d/[owner]/[repo]">) {
  const { owner, repo } = await params;
  const { sha } = await searchParams;
  const ref = tryParseRepo(`${owner}/${repo}`);
  if (!ref) notFound();

  // Sans sha, on fige HEAD dans l'URL : le lien partagé ouvrira toujours ce donjon-là.
  if (typeof sha !== "string" || !isSha(sha)) {
    let target: string;
    try {
      const head = await getHead(ref);
      target = `/d/${head.fullName}?sha=${head.sha}`;
    } catch (error) {
      return <IngestError error={error} repo={`${owner}/${repo}`} />;
    }
    redirect(target);
  }

  let model;
  try {
    model = await getDungeon(ref, sha);
  } catch (error) {
    return <IngestError error={error} repo={`${owner}/${repo}`} />;
  }

  return (
    <section aria-labelledby="dungeon-title" className="qm-hud flex flex-col gap-4">
      <header className="qm-tome flex flex-col gap-3 rounded-[24px] px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-[11px] tracking-[0.25em] text-[var(--qm-night-3)] uppercase">Quête en cours</p>
          <h1 id="dungeon-title" className="truncate font-display text-3xl text-[var(--qm-night-1)] sm:text-4xl">
            {model.repo.fullName}
          </h1>
          <p className="font-mono text-xs text-[var(--qm-night-3)]">
            @{model.repo.sha.slice(0, 7)}
            {model.repo.language ? ` · ${model.repo.language}` : ""}
          </p>
        </div>
        <dl className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-xs">
          {[
            ["Salles", model.rooms.length],
            ["Monstres", model.monsters.length],
            ["Coffres", model.chests.length],
          ].map(([label, value]) => (
            <div key={label} className="flex items-baseline gap-1.5">
              <dt className="tracking-wider text-[var(--qm-night-3)] uppercase">{label}</dt>
              <dd className="text-lime">{value}</dd>
            </div>
          ))}
          <div className="flex basis-full items-baseline gap-1.5">
            <dt className="tracking-wider text-[var(--qm-night-3)] uppercase">Boss</dt>
            <dd className="truncate text-danger">{model.boss.name}</dd>
          </div>
        </dl>
      </header>
      <Game model={model} />
    </section>
  );
}
