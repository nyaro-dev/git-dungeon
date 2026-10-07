import { GitHubError, type GitHubErrorKind } from "./github";

const STATUS: Record<GitHubErrorKind, number> = {
  invalid: 400,
  not_found: 404,
  rate_limited: 429,
  timeout: 504,
  upstream: 502,
};

export type ApiError = { error: GitHubErrorKind; message: string; resetAt: string | null };

/** Erreur d'ingestion → réponse JSON. Toute erreur inconnue devient un 502 sans détail. */
export function errorResponse(error: unknown, now: () => number = Date.now): Response {
  if (!(error instanceof GitHubError)) {
    console.error("[api/dungeon] erreur inattendue", error);
    const body: ApiError = { error: "upstream", message: "Erreur interne", resetAt: null };
    return Response.json(body, { status: 502 });
  }
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (error.kind === "rate_limited" && error.resetAt) {
    const seconds = Math.max(1, Math.ceil((Date.parse(error.resetAt) - now()) / 1000));
    headers.set("Retry-After", String(seconds));
  }
  const body: ApiError = { error: error.kind, message: error.message, resetAt: error.resetAt };
  return Response.json(body, { status: STATUS[error.kind], headers });
}
