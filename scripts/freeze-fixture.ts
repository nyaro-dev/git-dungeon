/**
 * Fige un vrai repo en fixture JSON pour les tests du générateur.
 *
 *   pnpm fixture <owner/repo> <nom> [sha]
 *
 * Lit GITHUB_TOKEN depuis l'environnement (ou .env.local). Sans token, GitHub
 * limite à 60 requêtes/h : de quoi figer un seul repo.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateDungeon } from "@/lib/dungeon/generate";
import { validateDungeon } from "@/lib/dungeon/validate";
import { GitHubError, fetchSnapshot, parseRepo } from "@/lib/ingest/github";

async function main() {
  const [input, name, sha] = process.argv.slice(2);
  if (!input || !name || !/^[a-z0-9-]+$/.test(name)) {
    console.error("Usage : pnpm fixture <owner/repo> <nom-en-kebab-case> [sha]");
    process.exit(1);
  }
  const { owner, repo } = parseRepo(input);
  const token = process.env.GITHUB_TOKEN || undefined;
  if (!token) console.warn("⚠ GITHUB_TOKEN absent : 60 requêtes/h maximum.");

  const started = performance.now();
  const snapshot = await fetchSnapshot(owner, repo, { token, sha, timeoutMs: 30_000 });
  const elapsed = Math.round(performance.now() - started);

  const model = generateDungeon(snapshot);
  const errors = validateDungeon(model);
  const out = resolve("tests/fixtures", `${name}.json`);
  writeFileSync(out, JSON.stringify(snapshot, null, 2) + "\n");

  console.log(`✓ ${snapshot.fullName}@${snapshot.sha.slice(0, 7)} → ${out} (${elapsed} ms)`);
  console.log(
    `  ${snapshot.tree.length} fichiers${snapshot.truncated ? " (tronqué)" : ""} · ${snapshot.issues.length} issues · ` +
      `${snapshot.commits.length} commits (${snapshot.commits.filter((c) => c.files).length} détaillés) · ` +
      `${snapshot.contributors.length} contributeurs`,
  );
  console.log(`  donjon : ${model.rooms.length} salles · ${model.monsters.length} monstres · ${model.chests.length} coffres · grille ${model.width}×${model.height}`);
  if (errors.length > 0) {
    console.error("✗ donjon invalide :", errors);
    process.exit(2);
  }
}

main().catch((error) => {
  if (error instanceof GitHubError) {
    console.error(`✗ ${error.kind} : ${error.message}${error.resetAt ? ` (reset à ${error.resetAt})` : ""}`);
  } else {
    console.error(error);
  }
  process.exit(1);
});
