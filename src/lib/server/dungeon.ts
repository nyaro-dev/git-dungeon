import "server-only";
import { connection } from "next/server";
import { generateDungeon } from "@/lib/dungeon/generate";
import type { DungeonModel } from "@/lib/dungeon/types";
import type { RepoHead } from "@/lib/ingest/github";
import type { RepoRef } from "@/lib/ingest/repo-name";
import { createIngestService } from "@/lib/ingest/service";
import { MemoryStore } from "@/lib/ingest/store";

/**
 * Point d'entrée serveur unique (pages et route d'API). Le token reste ici :
 * ce module ne doit jamais être importé côté client.
 */
const service = createIngestService({
  store: new MemoryStore(),
  github: { token: process.env.GITHUB_TOKEN || undefined },
});

// `connection()` : ces lectures n'ont lieu qu'à une vraie requête, jamais au prérendu ni
// lors d'un préchargement de lien (une ingestion coûte jusqu'à 31 appels GitHub).

export async function getHead(ref: RepoRef): Promise<RepoHead> {
  await connection();
  return service.head(ref);
}

export async function getDungeon(ref: RepoRef, sha: string): Promise<DungeonModel> {
  await connection();
  return generateDungeon(await service.snapshot(ref, sha));
}
