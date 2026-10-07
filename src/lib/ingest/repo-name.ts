/**
 * Validation des noms de dépôt, partagée client/serveur (aucune dépendance réseau).
 * Règles GitHub : propriétaire alphanumérique avec tirets internes, ≤ 39 caractères ;
 * dépôt en `[A-Za-z0-9_.-]`, ≤ 100 caractères.
 */
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO = /^[A-Za-z0-9_.-]{1,100}$/;

export type RepoRef = { owner: string; repo: string };

/** Accepte `owner/repo` ou une URL github.com ; null si invalide. */
export function tryParseRepo(input: string): RepoRef | null {
  let path = input.trim();
  const url = path.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/(.+)$/i);
  if (url) path = url[1];
  const [owner, rawRepo] = path.split(/[/?#]/).filter(Boolean);
  const repo = rawRepo?.replace(/\.git$/i, "");
  // `.` et `..` passent la regex mais seraient normalisés comme segments de chemin dans l'URL.
  if (!owner || !repo || !OWNER.test(owner) || !REPO.test(repo) || repo === "." || repo === "..") return null;
  return { owner, repo };
}

/** Clé de cache insensible à la casse (GitHub l'est aussi). */
export function repoKey({ owner, repo }: RepoRef): string {
  return `${owner}/${repo}`.toLowerCase();
}

/** sha complet ou abrégé (7 à 40 caractères hexadécimaux). */
export function isSha(value: string): boolean {
  return /^[0-9a-f]{7,40}$/i.test(value);
}
