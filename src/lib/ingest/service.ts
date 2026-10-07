import { fetchSnapshot, resolveHead, type IngestOptions, type RepoHead } from "./github";
import { repoKey, type RepoRef } from "./repo-name";
import type { RepoSnapshot } from "./snapshot";
import type { SnapshotStore } from "./store";

/** Durée de validité de la résolution « branche par défaut → sha ». */
export const HEAD_TTL_MS = 60 * 60 * 1000;

export type IngestDeps = {
  store: SnapshotStore;
  github?: Pick<IngestOptions, "token" | "fetch" | "timeoutMs">;
};

/**
 * Orchestration cache + GitHub. Les appels concurrents sur la même clé partagent
 * une seule ingestion en vol : dix joueurs qui ouvrent le même lien ne coûtent
 * qu'une série de requêtes GitHub.
 */
export function createIngestService(deps: IngestDeps) {
  const inFlight = new Map<string, Promise<unknown>>();
  const once = <T>(key: string, run: () => Promise<T>): Promise<T> => {
    const pending = inFlight.get(key) as Promise<T> | undefined;
    if (pending) return pending;
    const promise = run().finally(() => inFlight.delete(key));
    inFlight.set(key, promise);
    return promise;
  };

  async function head(ref: RepoRef): Promise<RepoHead> {
    const key = repoKey(ref);
    const cached = await deps.store.getHead(key);
    if (cached) return cached;
    return once(`head:${key}`, async () => {
      const fresh = await resolveHead(ref.owner, ref.repo, deps.github);
      await deps.store.putHead(key, fresh, HEAD_TTL_MS);
      return fresh;
    });
  }

  /** Snapshot figé à `sha` (complet ou abrégé). */
  async function snapshot(ref: RepoRef, sha: string): Promise<RepoSnapshot> {
    const lookupKey = `${repoKey(ref)}@${sha.toLowerCase()}`;
    const cached = await deps.store.getSnapshot(lookupKey);
    if (cached) return cached;
    return once(`snapshot:${lookupKey}`, async () => {
      const fresh = await fetchSnapshot(ref.owner, ref.repo, { ...deps.github, sha });
      // Rangé sous le sha complet (et sous l'abrégé demandé, s'il diffère).
      const fullKey = `${repoKey(ref)}@${fresh.sha}`;
      await deps.store.putSnapshot(fullKey, fresh);
      if (fullKey !== lookupKey) await deps.store.putSnapshot(lookupKey, fresh);
      return fresh;
    });
  }

  return { head, snapshot };
}

export type IngestService = ReturnType<typeof createIngestService>;
