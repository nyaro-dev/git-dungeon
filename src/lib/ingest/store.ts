import type { RepoHead } from "./github";
import type { RepoSnapshot } from "./snapshot";

/**
 * Cache de l'ingestion. Un snapshot est immuable pour un sha donné : il se garde
 * indéfiniment. La résolution « branche → sha » expire, pour voir les nouveaux push.
 *
 * Implémentation en mémoire pour l'instant (par instance serverless) ; la version
 * Supabase (WE 4) n'aura qu'à implémenter cette interface.
 */
export interface SnapshotStore {
  getHead(repoKey: string): Promise<RepoHead | null>;
  putHead(repoKey: string, head: RepoHead, ttlMs: number): Promise<void>;
  /** `snapshotKey` = `${repoKey}@${sha complet}`. */
  getSnapshot(snapshotKey: string): Promise<RepoSnapshot | null>;
  putSnapshot(snapshotKey: string, snapshot: RepoSnapshot): Promise<void>;
}

/** LRU en mémoire, bornée en nombre d'entrées. */
export class MemoryStore implements SnapshotStore {
  private heads = new Map<string, { head: RepoHead; expiresAt: number }>();
  private snapshots = new Map<string, RepoSnapshot>();

  constructor(
    private readonly maxSnapshots = 50,
    private readonly now: () => number = Date.now,
  ) {}

  async getHead(repoKey: string) {
    const entry = this.heads.get(repoKey);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.heads.delete(repoKey);
      return null;
    }
    return entry.head;
  }

  async putHead(repoKey: string, head: RepoHead, ttlMs: number) {
    this.heads.set(repoKey, { head, expiresAt: this.now() + ttlMs });
  }

  async getSnapshot(snapshotKey: string) {
    const snapshot = this.snapshots.get(snapshotKey);
    if (!snapshot) return null;
    // Rafraîchit la position LRU : une Map itère dans l'ordre d'insertion.
    this.snapshots.delete(snapshotKey);
    this.snapshots.set(snapshotKey, snapshot);
    return snapshot;
  }

  async putSnapshot(snapshotKey: string, snapshot: RepoSnapshot) {
    this.snapshots.delete(snapshotKey);
    this.snapshots.set(snapshotKey, snapshot);
    while (this.snapshots.size > this.maxSnapshots) {
      this.snapshots.delete(this.snapshots.keys().next().value!);
    }
  }
}
