import { describe, expect, it } from "vitest";
import { GitHubError } from "@/lib/ingest/github";
import { errorResponse } from "@/lib/ingest/http";

describe("errorResponse", () => {
  it.each([
    ["invalid", 400],
    ["not_found", 404],
    ["rate_limited", 429],
    ["timeout", 504],
    ["upstream", 502],
  ] as const)("%s → %i", async (kind, status) => {
    const res = errorResponse(new GitHubError(kind, "msg"));
    expect(res.status).toBe(status);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ error: kind, message: "msg", resetAt: null });
  });

  it("ajoute Retry-After pour une limite d'API", () => {
    const now = Date.parse("2026-10-07T12:00:00Z");
    const res = errorResponse(new GitHubError("rate_limited", "x", "2026-10-07T12:01:30Z"), () => now);
    expect(res.headers.get("Retry-After")).toBe("90");
  });

  it("ne divulgue pas le détail d'une erreur inconnue", async () => {
    const original = console.error;
    console.error = () => {};
    try {
      const res = errorResponse(new Error("SUPABASE_SECRET_KEY=…"));
      expect(res.status).toBe(502);
      expect(JSON.stringify(await res.json())).not.toContain("SECRET");
    } finally {
      console.error = original;
    }
  });
});
