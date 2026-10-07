import { describe, expect, it } from "vitest";
import { EMPTY_SHA } from "@/lib/ingest/github";
import { HEAD_TTL_MS, createIngestService } from "@/lib/ingest/service";
import { MemoryStore } from "@/lib/ingest/store";

const FULL = "a".repeat(40);

/** GitHub minimal : un repo `acme/forge` à un commit, et un compteur d'appels. */
function fakeGitHub() {
  let calls = 0;
  const fetch = (async (input: string | URL | Request) => {
    calls++;
    const url = new URL(String(input));
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    // Laisse le temps à des appels concurrents de se chevaucher.
    await new Promise((r) => setTimeout(r, 5));
    // Comme le vrai GitHub, les chemins de dépôt sont insensibles à la casse.
    switch (url.pathname.toLowerCase()) {
      case "/repos/acme/forge":
        return json({ full_name: "acme/forge", private: false, default_branch: "main", stargazers_count: 1, created_at: "2020-01-01T00:00:00Z", pushed_at: null });
      case "/repos/acme/forge/commits":
        return json([{ sha: FULL, commit: { message: "init", author: { date: "2020-01-01T00:00:00Z" }, committer: null }, author: null }]);
      case `/repos/acme/forge/commits/${FULL}`:
        return json({ sha: FULL, commit: { message: "init", author: null, committer: null }, author: null, files: [] });
      case `/repos/acme/forge/git/trees/${FULL}`:
        return json({ truncated: false, tree: [{ path: "a.ts", type: "blob", size: 1 }] });
      case "/repos/acme/forge/issues":
      case "/repos/acme/forge/contributors":
        return json([]);
      case "/repos/acme/forge/languages":
        return json({});
    }
    return new Response("", { status: 404 });
  }) as typeof globalThis.fetch;
  return { fetch, count: () => calls };
}

const ref = { owner: "Acme", repo: "Forge" };

describe("createIngestService", () => {
  it("met le snapshot en cache, sous le sha complet et sous l'abrégé", async () => {
    const gh = fakeGitHub();
    const store = new MemoryStore();
    const service = createIngestService({ store, github: { fetch: gh.fetch } });

    const first = await service.snapshot(ref, "AAAAAAA");
    const afterFirst = gh.count();
    expect(first.sha).toBe(FULL);
    // Même sha abrégé (casse différente), puis sha complet : aucun nouvel appel.
    await service.snapshot({ owner: "acme", repo: "forge" }, "aaaaaaa");
    await service.snapshot(ref, FULL);
    expect(gh.count()).toBe(afterFirst);
    expect(await store.getSnapshot(`acme/forge@${FULL}`)).toBe(first);
  });

  it("déduplique les ingestions concurrentes", async () => {
    const gh = fakeGitHub();
    const service = createIngestService({ store: new MemoryStore(), github: { fetch: gh.fetch } });
    const results = await Promise.all(Array.from({ length: 10 }, () => service.snapshot(ref, FULL)));
    expect(new Set(results).size).toBe(1);
    // Une seule ingestion : meta + liste + arbre + issues + contributeurs + langages + 1 détail.
    expect(gh.count()).toBe(7);
  });

  it("garde HEAD en cache pendant HEAD_TTL_MS seulement", async () => {
    const gh = fakeGitHub();
    let now = 0;
    const service = createIngestService({ store: new MemoryStore(50, () => now), github: { fetch: gh.fetch } });

    expect(await service.head(ref)).toEqual({ fullName: "acme/forge", defaultBranch: "main", sha: FULL });
    expect(gh.count()).toBe(2);
    now = HEAD_TTL_MS - 1;
    await service.head(ref);
    expect(gh.count()).toBe(2);
    now = HEAD_TTL_MS;
    await service.head(ref);
    expect(gh.count()).toBe(4);
  });

  it("ne met pas les erreurs en cache", async () => {
    let fail = true;
    const gh = fakeGitHub();
    const flaky = ((input: string | URL | Request, init?: RequestInit) =>
      fail ? Promise.resolve(new Response("", { status: 500 })) : gh.fetch(input, init)) as typeof globalThis.fetch;
    const service = createIngestService({ store: new MemoryStore(), github: { fetch: flaky } });

    await expect(service.head(ref)).rejects.toMatchObject({ kind: "upstream" });
    fail = false;
    await expect(service.head(ref)).resolves.toMatchObject({ sha: FULL });
  });

  it("MemoryStore évince le snapshot le moins récemment utilisé", async () => {
    const store = new MemoryStore(2);
    const snap = (sha: string) => ({ sha }) as never;
    await store.putSnapshot("a", snap("1"));
    await store.putSnapshot("b", snap("2"));
    await store.getSnapshot("a"); // « a » redevient récent
    await store.putSnapshot("c", snap("3"));
    expect(await store.getSnapshot("b")).toBeNull();
    expect(await store.getSnapshot("a")).not.toBeNull();
    expect(await store.getSnapshot("c")).not.toBeNull();
  });

  it("repo vide : HEAD = EMPTY_SHA", async () => {
    const empty = (async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname.toLowerCase() === "/repos/acme/forge") {
        return new Response(JSON.stringify({ full_name: "acme/forge", private: false, default_branch: "main", stargazers_count: 0, created_at: "2020-01-01T00:00:00Z", pushed_at: null }));
      }
      return new Response(JSON.stringify({ message: "Git Repository is empty." }), { status: 409 });
    }) as typeof globalThis.fetch;
    const service = createIngestService({ store: new MemoryStore(), github: { fetch: empty } });
    expect((await service.head(ref)).sha).toBe(EMPTY_SHA);
  });
});
