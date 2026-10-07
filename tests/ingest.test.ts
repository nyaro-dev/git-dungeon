import { describe, expect, it } from "vitest";
import { generateDungeon } from "@/lib/dungeon/generate";
import { validateDungeon } from "@/lib/dungeon/validate";
import { COMMIT_DETAILS, EMPTY_SHA, GitHubError, MAX_FILES, fetchSnapshot, parseRepo } from "@/lib/ingest/github";

const SHA = (n: number) => n.toString(16).padStart(40, "0");

type Route = { status?: number; body?: unknown; headers?: Record<string, string> };

/** Faux GitHub : associe un chemin d'API (sans query) à une réponse, et journalise les appels. */
function fakeGitHub(routes: Record<string, Route | ((url: URL) => Route)>) {
  const calls: { url: URL; headers: Record<string, string> }[] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    const route = routes[url.pathname];
    const r = typeof route === "function" ? route(url) : route;
    if (!r) return new Response("Not Found", { status: 404 });
    const status = r.status ?? 200;
    const body = status === 204 ? null : JSON.stringify(r.body ?? {});
    return new Response(body, { status, headers: r.headers });
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

const commit = (n: number, login: string | null, files?: string[]) => ({
  sha: SHA(n),
  commit: { message: `commit ${n}\n\nbody`, author: { name: login ?? "Anon", date: `2026-09-${String(30 - (n % 28)).padStart(2, "0")}T00:00:00Z` }, committer: null },
  author: login ? { login } : null,
  ...(files ? { files: files.map((filename) => ({ filename })) } : {}),
});

function healthyRepo(overrides: Record<string, Route | ((url: URL) => Route)> = {}) {
  const commits = Array.from({ length: 40 }, (_, i) => commit(i + 1, i % 3 ? "ana" : "bo"));
  const routes: Record<string, Route | ((url: URL) => Route)> = {
    "/repos/acme/forge": {
      body: { full_name: "Acme/Forge", private: false, default_branch: "main", stargazers_count: 42, created_at: "2020-01-01T00:00:00Z", pushed_at: "2026-09-30T00:00:00Z" },
    },
    "/repos/acme/forge/commits": { body: commits },
    [`/repos/acme/forge/git/trees/${SHA(1)}`]: {
      body: {
        truncated: false,
        tree: [
          { path: "src", type: "tree" },
          { path: "src/index.ts", type: "blob", size: 120 },
          { path: "README.md", type: "blob", size: 900 },
          { path: "vendor/lib", type: "commit" },
        ],
      },
    },
    "/repos/acme/forge/issues": {
      body: [
        { number: 9, title: "Newer", comments: 1, created_at: "2025-01-01T00:00:00Z", labels: [{ name: "bug" }] },
        { number: 3, title: "A PR", comments: 0, created_at: "2019-01-01T00:00:00Z", labels: [], pull_request: {} },
        { number: 4, title: "Oldest", comments: 7, created_at: "2021-01-01T00:00:00Z", labels: ["enhancement", { name: null }] },
      ],
    },
    "/repos/acme/forge/contributors": {
      body: [
        { login: "ana", avatar_url: "https://avatars.example/ana", contributions: 30 },
        { contributions: 5 }, // contributeur anonyme : ignoré
      ],
    },
    "/repos/acme/forge/languages": { body: { TypeScript: 1000, CSS: 10 } },
  };
  for (let i = 1; i <= 40; i++) {
    routes[`/repos/acme/forge/commits/${SHA(i)}`] = { body: commit(i, "ana", [`src/file${i}.ts`]) };
  }
  return { ...routes, ...overrides };
}

describe("parseRepo", () => {
  it.each([
    ["vercel/next.js", { owner: "vercel", repo: "next.js" }],
    ["  pmndrs/zustand ", { owner: "pmndrs", repo: "zustand" }],
    ["https://github.com/pmndrs/zustand", { owner: "pmndrs", repo: "zustand" }],
    ["github.com/pmndrs/zustand.git", { owner: "pmndrs", repo: "zustand" }],
    ["https://www.github.com/a/b/tree/main/src?x=1", { owner: "a", repo: "b" }],
  ])("%s", (input, expected) => {
    expect(parseRepo(input)).toEqual(expected);
  });

  it.each(["", "vercel", "a/..", "https://gitlab.com/a/b", "a b/c", "../etc/passwd", "-bad/repo", "a_b/repo"])("refuse %j", (input) => {
    expect(() => parseRepo(input)).toThrow(GitHubError);
  });
});

describe("fetchSnapshot", () => {
  it("assemble un snapshot normalisé", async () => {
    const gh = fakeGitHub(healthyRepo());
    const snap = await fetchSnapshot("acme", "forge", { fetch: gh.fetch, token: "t0k" });

    // Nom canonique renvoyé par GitHub : c'est lui qui entre dans le seed.
    expect(snap.fullName).toBe("Acme/Forge");
    expect(snap.sha).toBe(SHA(1));
    // Seuls les blobs restent (ni dossiers ni sous-modules), faible profondeur d'abord.
    expect(snap.tree.map((t) => t.path)).toEqual(["README.md", "src/index.ts"]);
    // PR exclue, plus vieille issue en tête, labels aplatis.
    expect(snap.issues.map((i) => [i.number, i.labels])).toEqual([
      [4, ["enhancement"]],
      [9, ["bug"]],
    ]);
    // Seuls les 25 plus récents sont détaillés.
    expect(snap.commits).toHaveLength(40);
    expect(snap.commits.filter((c) => c.files).length).toBe(COMMIT_DETAILS);
    expect(snap.commits[0].files).toEqual(["src/file1.ts"]);
    expect(snap.commits[30].files).toBeUndefined();
    expect(snap.contributors).toEqual([{ login: "ana", avatarUrl: "https://avatars.example/ana", contributions: 30 }]);

    // 6 requêtes de base + 25 détails, toutes authentifiées.
    expect(gh.calls).toHaveLength(6 + COMMIT_DETAILS);
    expect(gh.calls.every((c) => c.headers.Authorization === "Bearer t0k")).toBe(true);
    const issuesCall = gh.calls.find((c) => c.url.pathname.endsWith("/issues"))!;
    expect(Object.fromEntries(issuesCall.url.searchParams)).toMatchObject({ state: "open", sort: "created", direction: "asc" });

    expect(validateDungeon(generateDungeon(snap))).toEqual([]);
  });

  it("fige un sha donné", async () => {
    const gh = fakeGitHub(healthyRepo());
    await fetchSnapshot("acme", "forge", { fetch: gh.fetch, sha: "abc1234" });
    const list = gh.calls.find((c) => c.url.pathname === "/repos/acme/forge/commits")!;
    expect(list.url.searchParams.get("sha")).toBe("abc1234");
  });

  it("garde 2 000 fichiers au plus, les moins profonds, et signale la troncature", async () => {
    const tree = [
      ...Array.from({ length: 2500 }, (_, i) => ({ path: `deep/a/b/f${i}.ts`, type: "blob", size: 1 })),
      { path: "top.md", type: "blob", size: 1 },
    ];
    const gh = fakeGitHub(healthyRepo({ [`/repos/acme/forge/git/trees/${SHA(1)}`]: { body: { truncated: false, tree } } }));
    const snap = await fetchSnapshot("acme", "forge", { fetch: gh.fetch });
    expect(snap.tree).toHaveLength(MAX_FILES);
    expect(snap.tree[0].path).toBe("top.md");
    expect(snap.truncated).toBe(true);
  });

  it("repo vide (409) : snapshot vide mais jouable", async () => {
    const gh = fakeGitHub(healthyRepo({ "/repos/acme/forge/commits": { status: 409, body: { message: "Git Repository is empty." } } }));
    const snap = await fetchSnapshot("acme", "forge", { fetch: gh.fetch });
    expect(snap).toMatchObject({ sha: EMPTY_SHA, tree: [], commits: [] });
    expect(validateDungeon(generateDungeon(snap))).toEqual([]);
  });

  it("liste des contributeurs refusée (403) : repli sur les auteurs des commits", async () => {
    const gh = fakeGitHub(healthyRepo({ "/repos/acme/forge/contributors": { status: 403, body: { message: "too large" } } }));
    const snap = await fetchSnapshot("acme", "forge", { fetch: gh.fetch });
    expect(snap.contributors.map((c) => c.login)).toEqual(["ana", "bo"]);
    expect(snap.contributors[0].avatarUrl).toBe("https://github.com/ana.png");
  });

  it("repo privé ou absent → not_found", async () => {
    const priv = fakeGitHub(healthyRepo({ "/repos/acme/forge": { body: { full_name: "acme/forge", private: true } } }));
    await expect(fetchSnapshot("acme", "forge", { fetch: priv.fetch })).rejects.toMatchObject({ kind: "not_found" });
    const missing = fakeGitHub({});
    await expect(fetchSnapshot("acme", "nope", { fetch: missing.fetch })).rejects.toMatchObject({ kind: "not_found" });
  });

  it("sha inconnu → not_found", async () => {
    const gh = fakeGitHub(healthyRepo({ "/repos/acme/forge/commits": { status: 422, body: {} } }));
    await expect(fetchSnapshot("acme", "forge", { fetch: gh.fetch, sha: "deadbee" })).rejects.toMatchObject({ kind: "not_found" });
  });

  it("limite d'API → rate_limited avec l'heure de remise à zéro", async () => {
    const gh = fakeGitHub(
      healthyRepo({
        "/repos/acme/forge/languages": {
          status: 403,
          body: { message: "API rate limit exceeded" },
          headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1800000000" },
        },
      }),
    );
    const error = await fetchSnapshot("acme", "forge", { fetch: gh.fetch }).catch((e) => e);
    expect(error).toBeInstanceOf(GitHubError);
    expect(error).toMatchObject({ kind: "rate_limited", resetAt: "2027-01-15T08:00:00.000Z" });
  });

  it("autre erreur GitHub → upstream", async () => {
    const gh = fakeGitHub(healthyRepo({ "/repos/acme/forge/languages": { status: 500, body: {} } }));
    await expect(fetchSnapshot("acme", "forge", { fetch: gh.fetch })).rejects.toMatchObject({ kind: "upstream" });
  });

  it("GitHub trop lent → timeout", async () => {
    const hanging = ((_: unknown, init?: RequestInit) =>
      new Promise((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      })) as typeof globalThis.fetch;
    await expect(fetchSnapshot("acme", "forge", { fetch: hanging, timeoutMs: 20 })).rejects.toMatchObject({ kind: "timeout" });
  });
});
