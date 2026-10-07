import type { NextRequest } from "next/server";
import { errorResponse } from "@/lib/ingest/http";
import { parseRepo } from "@/lib/ingest/github";
import { isSha } from "@/lib/ingest/repo-name";
import { getDungeon, getHead } from "@/lib/server/dungeon";

export const maxDuration = 15;

/**
 * GET /api/dungeon?repo=owner/repo[&sha=…] → { model }
 *
 * Avec sha, la réponse est immuable et cachée au CDN ; sans sha, on résout HEAD
 * et la réponse n'est cachée qu'une minute.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  try {
    const ref = parseRepo(params.get("repo") ?? "");
    const pinned = params.get("sha");
    if (pinned !== null && !isSha(pinned)) {
      return Response.json({ error: "invalid", message: "sha invalide", resetAt: null }, { status: 400 });
    }
    const sha = pinned ?? (await getHead(ref)).sha;
    const model = await getDungeon(ref, sha);
    return Response.json(
      { model },
      {
        headers: {
          "Cache-Control": pinned
            ? "public, max-age=3600, s-maxage=31536000, immutable"
            : "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
        },
      },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
