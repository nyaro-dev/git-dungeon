import { tryParseRepo, type RepoRef } from "./repo-name";
import { RepoSnapshotSchema, type RepoSnapshot } from "./snapshot";

const API = "https://api.github.com";

export const MAX_FILES = 2000;
export const MAX_ISSUES = 100;
export const MAX_COMMITS = 100;
export const MAX_CONTRIBUTORS = 10;
/** Commits détaillés (fichiers touchés) : 1 requête chacun. */
export const COMMIT_DETAILS = 25;
const DETAIL_BATCH = 5;
const MESSAGE_MAX = 500;
export const INGEST_TIMEOUT_MS = 8000;
/** sha utilisé pour un repo sans aucun commit. */
export const EMPTY_SHA = "0000000";

export type GitHubErrorKind = "invalid" | "not_found" | "rate_limited" | "timeout" | "upstream";

export class GitHubError extends Error {
  constructor(
    readonly kind: GitHubErrorKind,
    message: string,
    /** Pour `rate_limited` : heure ISO de remise à zéro du quota, si GitHub l'indique. */
    readonly resetAt: string | null = null,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

/** Comme `tryParseRepo`, mais lève une `GitHubError("invalid")`. */
export function parseRepo(input: string): RepoRef {
  const ref = tryParseRepo(input);
  if (!ref) throw new GitHubError("invalid", `Dépôt invalide : « ${input} » (attendu : owner/repo)`);
  return ref;
}

// --- Réponses brutes de l'API (seulement les champs utilisés) -------------

type RawRepo = {
  full_name: string;
  private: boolean;
  default_branch: string;
  stargazers_count: number;
  created_at: string;
  pushed_at: string | null;
};
type RawTree = { truncated: boolean; tree: { path: string; type: string; size?: number }[] };
type RawIssue = {
  number: number;
  title: string;
  comments: number;
  created_at: string;
  labels: (string | { name?: string | null })[];
  pull_request?: unknown;
};
type RawCommit = {
  sha: string;
  commit: {
    message: string;
    author: { name?: string; date?: string } | null;
    committer: { date?: string } | null;
  };
  author: { login?: string } | null;
  files?: { filename: string }[];
};
type RawContributor = { login?: string; avatar_url?: string; contributions: number };

export type RawRepoData = {
  repo: RawRepo;
  /** null : repo vide (aucun commit). */
  sha: string | null;
  tree: RawTree;
  issues: RawIssue[];
  commits: RawCommit[];
  /** Fichiers touchés, par sha, pour les commits détaillés. */
  details: Map<string, string[]>;
  /** null : GitHub a refusé la liste (historique trop gros) → repli sur les auteurs de commits. */
  contributors: RawContributor[] | null;
  languages: Record<string, number>;
};

// --- Normalisation (pure) ---------------------------------------------------

const depth = (path: string) => path.split("/").length;
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Données brutes → `RepoSnapshot` validé. Pure : testable sans réseau. */
export function normalizeSnapshot(raw: RawRepoData): RepoSnapshot {
  const blobs = raw.tree.tree
    .filter((entry) => entry.type === "blob")
    .map((entry) => ({ path: entry.path, size: entry.size ?? 0, type: "blob" as const }))
    // Si on doit couper, on garde la structure haute du repo : faible profondeur d'abord.
    .sort((a, b) => depth(a.path) - depth(b.path) || cmp(a.path, b.path));

  const issues = raw.issues
    .filter((issue) => issue.pull_request === undefined)
    .map((issue) => ({
      number: issue.number,
      title: issue.title,
      comments: issue.comments,
      createdAt: issue.created_at,
      labels: issue.labels
        .map((label) => (typeof label === "string" ? label : (label.name ?? "")))
        .filter((label) => label !== ""),
    }))
    .sort((a, b) => cmp(a.createdAt, b.createdAt) || a.number - b.number)
    .slice(0, MAX_ISSUES);

  const commits = raw.commits.slice(0, MAX_COMMITS).map((c) => {
    const files = raw.details.get(c.sha);
    return {
      sha: c.sha,
      message: c.commit.message.slice(0, MESSAGE_MAX),
      date: c.commit.author?.date ?? c.commit.committer?.date ?? "",
      author: c.author?.login ?? c.commit.author?.name ?? "unknown",
      ...(files ? { files } : {}),
    };
  });

  let contributors: RepoSnapshot["contributors"];
  if (raw.contributors) {
    contributors = raw.contributors
      .filter((c): c is RawContributor & { login: string } => typeof c.login === "string")
      .map((c) => ({ login: c.login, avatarUrl: c.avatar_url ?? "", contributions: c.contributions }));
  } else {
    // Repli : on compte les commits récents par auteur GitHub identifié.
    const counts = new Map<string, number>();
    for (const c of raw.commits) {
      const login = c.author?.login;
      if (login) counts.set(login, (counts.get(login) ?? 0) + 1);
    }
    contributors = [...counts]
      .sort(([a, x], [b, y]) => y - x || cmp(a, b))
      .map(([login, contributions]) => ({ login, avatarUrl: `https://github.com/${login}.png`, contributions }));
  }

  const parsed = RepoSnapshotSchema.safeParse({
    fullName: raw.repo.full_name,
    sha: raw.sha ?? EMPTY_SHA,
    defaultBranch: raw.repo.default_branch,
    stars: raw.repo.stargazers_count,
    createdAt: raw.repo.created_at,
    pushedAt: raw.repo.pushed_at ?? raw.repo.created_at,
    tree: blobs.slice(0, MAX_FILES),
    issues,
    commits,
    contributors: contributors.slice(0, MAX_CONTRIBUTORS),
    languages: raw.languages,
    truncated: raw.tree.truncated || blobs.length > MAX_FILES,
  });
  if (!parsed.success) {
    throw new GitHubError("upstream", `Réponse GitHub inattendue : ${parsed.error.issues[0]?.message}`);
  }
  return parsed.data;
}

// --- Client HTTP ------------------------------------------------------------

export type IngestOptions = {
  /** Token serveur ; sans lui, GitHub limite à 60 requêtes/h par IP. */
  token?: string;
  /** sha (complet ou abrégé) à figer ; par défaut, HEAD de la branche par défaut. */
  sha?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
};

type Client = <T>(path: string, allow?: number[]) => Promise<{ status: number; data: T | null }>;

function createClient(options: IngestOptions, signal: AbortSignal): Client {
  const doFetch = options.fetch ?? globalThis.fetch;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "git-dungeon",
  };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  return async (path, allow = []) => {
    const res = await doFetch(`${API}${path}`, { headers, signal });
    if (res.ok) return { status: res.status, data: res.status === 204 ? null : await res.json() };
    if (allow.includes(res.status)) return { status: res.status, data: null };
    if (res.status === 404) throw new GitHubError("not_found", "Dépôt introuvable ou privé");
    const remaining = res.headers.get("x-ratelimit-remaining");
    if (res.status === 429 || (res.status === 403 && (remaining === "0" || res.headers.has("retry-after")))) {
      const reset = res.headers.get("x-ratelimit-reset");
      const retryAfter = res.headers.get("retry-after");
      const resetAt = reset
        ? new Date(Number(reset) * 1000).toISOString()
        : retryAfter
          ? new Date(Date.now() + Number(retryAfter) * 1000).toISOString()
          : null;
      throw new GitHubError("rate_limited", "Limite d'API GitHub atteinte", resetAt);
    }
    throw new GitHubError("upstream", `GitHub a répondu ${res.status} sur ${path.split("?")[0]}`);
  };
}

/** Exécute `run` avec un client authentifié, sous timeout global, en normalisant les erreurs. */
async function withGitHub<T>(options: IngestOptions, run: (gh: Client) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? INGEST_TIMEOUT_MS);
  try {
    return await run(createClient(options, controller.signal));
  } catch (error) {
    if (controller.signal.aborted) {
      throw new GitHubError("timeout", "GitHub n'a pas répondu à temps");
    }
    if (error instanceof GitHubError) throw error;
    throw new GitHubError("upstream", `Erreur réseau vers GitHub : ${(error as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

const repoPath = (owner: string, repo: string) => `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

async function fetchMeta(gh: Client, base: string): Promise<RawRepo> {
  const { data: meta } = await gh<RawRepo>(base);
  if (!meta || meta.private) throw new GitHubError("not_found", "Dépôt introuvable ou privé");
  return meta;
}

export type RepoHead = { fullName: string; defaultBranch: string; sha: string };

/** HEAD de la branche par défaut, en 2 requêtes : de quoi rediriger vers une URL figée par sha. */
export function resolveHead(owner: string, repo: string, options: IngestOptions = {}): Promise<RepoHead> {
  return withGitHub(options, async (gh) => {
    const base = repoPath(owner, repo);
    const meta = await fetchMeta(gh, base);
    const listed = await gh<RawCommit[]>(`${base}/commits?per_page=1&sha=${encodeURIComponent(meta.default_branch)}`, [409]);
    return { fullName: meta.full_name, defaultBranch: meta.default_branch, sha: listed.data?.[0]?.sha ?? EMPTY_SHA };
  });
}

/**
 * Récupère un repo public et le normalise en `RepoSnapshot`.
 * ~6 requêtes + 1 par commit détaillé (25 max), sous un timeout global.
 */
export function fetchSnapshot(owner: string, repo: string, options: IngestOptions = {}): Promise<RepoSnapshot> {
  return withGitHub(options, async (gh) => {
    const base = repoPath(owner, repo);
    const meta = await fetchMeta(gh, base);

    // EMPTY_SHA désigne un repo vide : on relit la branche par défaut (409 attendu).
    const pinned = options.sha && options.sha !== EMPTY_SHA ? options.sha : undefined;
    const ref = pinned ?? meta.default_branch;
    // 409 : repo vide. 422 : sha inconnu.
    const listed = await gh<RawCommit[]>(`${base}/commits?per_page=${MAX_COMMITS}&sha=${encodeURIComponent(ref)}`, [409, 422]);
    if (listed.status === 422) throw new GitHubError("not_found", `Commit introuvable : ${ref}`);
    const commits = listed.data ?? [];
    const sha = commits[0]?.sha ?? null;
    if (pinned && sha === null) throw new GitHubError("not_found", `Commit introuvable : ${ref}`);

    const empty: RawTree = { truncated: false, tree: [] };
    const [tree, issues, contributors, languages] = await Promise.all([
      sha ? gh<RawTree>(`${base}/git/trees/${sha}?recursive=1`).then((r) => r.data ?? empty) : empty,
      gh<RawIssue[]>(`${base}/issues?state=open&sort=created&direction=asc&per_page=${MAX_ISSUES}`).then((r) => r.data ?? []),
      // 403 « history or contributor list is too large » : on se rabattra sur les auteurs de commits.
      gh<RawContributor[]>(`${base}/contributors?per_page=${MAX_CONTRIBUTORS}`, [403]).then((r) =>
        r.status === 403 ? null : (r.data ?? []),
      ),
      gh<Record<string, number>>(`${base}/languages`).then((r) => r.data ?? {}),
    ]);

    const details = new Map<string, string[]>();
    const toDetail = commits.slice(0, COMMIT_DETAILS);
    for (let i = 0; i < toDetail.length; i += DETAIL_BATCH) {
      const batch = await Promise.all(
        toDetail.slice(i, i + DETAIL_BATCH).map((c) => gh<RawCommit>(`${base}/commits/${c.sha}`).then((r) => r.data)),
      );
      for (const commit of batch) {
        if (commit) details.set(commit.sha, (commit.files ?? []).map((f) => f.filename));
      }
    }

    return normalizeSnapshot({ repo: meta, sha, tree, issues, commits, details, contributors, languages });
  });
}
