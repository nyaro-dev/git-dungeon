import Link from "next/link";
import { RiveIcon } from "@/components/fx/RiveIcon";
import { EXAMPLE_REPOS } from "@/lib/examples";
import { GitHubError } from "@/lib/ingest/github";

const TIME = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });

/** Échec d'ingestion, dans le vocabulaire des quêtes, avec des dépôts de repli. */
export function IngestError({ error, repo }: { error: unknown; repo: string }) {
  const kind = error instanceof GitHubError ? error.kind : "upstream";
  if (!(error instanceof GitHubError)) console.error("[d/[owner]/[repo]] erreur inattendue", error);

  const { title, detail } = (() => {
    switch (kind) {
      case "invalid":
      case "not_found":
        return { title: "Quête introuvable", detail: `Le dépôt ${repo} n'existe pas, est privé, ou ce commit n'existe pas.` };
      case "rate_limited": {
        const resetAt = error instanceof GitHubError && error.resetAt ? TIME.format(new Date(error.resetAt)) : null;
        return {
          title: "Quête scellée",
          detail: `La limite d'appels à GitHub est atteinte.${resetAt ? ` Les portes rouvrent à ${resetAt}.` : " Réessaie dans quelques minutes."}`,
        };
      }
      case "timeout":
        return { title: "Le donjon est trop profond", detail: "GitHub a mis trop de temps à répondre. Réessaie dans un instant." };
      default:
        return { title: "Un sortilège a échoué", detail: "GitHub a renvoyé une erreur inattendue. Réessaie dans un instant." };
    }
  })();

  return (
    <section role="alert" className="qm-hud qm-tome flex flex-col gap-5 rounded-[24px] p-6 sm:p-8">
      <div className="flex items-center gap-3">
        <RiveIcon kind="skull" className="h-12 w-12" />
        <h1 className="font-display text-3xl text-[var(--qm-night-1)]">{title}</h1>
      </div>
      <p>{detail}</p>
      <div className="flex flex-col gap-2">
        <p className="text-[11px] tracking-[0.25em] text-[var(--qm-night-3)] uppercase">Autres quêtes</p>
        <ul className="flex flex-wrap gap-3">
          {EXAMPLE_REPOS.map(({ fullName }) => (
            <li key={fullName}>
              <Link href={`/d/${fullName}`} className="pi-btn min-h-10 px-4 font-mono text-sm">
                {fullName}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
