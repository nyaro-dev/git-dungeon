// Dernière étape du kit, depuis la racine du repo, après build.py :
//
//   node scripts/blender/dungeon-kit/finish.mjs [dungeon-kit|characters]
//
// meshopt + quantification via glTF-Transform, en gardant chaque nœud (la scène
// retrouve les prototypes par leur nom, P_*) et les couleurs de sommet. Mêmes
// garde-fous que le pipeline du portfolio (scripts/blender/quest-map/finish.mjs).
import { execFileSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const name = process.argv[2] ?? "dungeon-kit";
const raw = join(tmpdir(), "dungeon-kit", `${name}.raw.glb`);
const outDir = join(process.cwd(), "public", "models");
const out = join(outDir, `${name}.glb`);
mkdirSync(outDir, { recursive: true });

execFileSync(
  "pnpm",
  [
    "exec", "gltf-transform", "optimize", raw, out,
    "--compress", "meshopt",
    "--simplify", "false",
    "--flatten", "false",
    "--join", "false",
    "--palette", "false",
    "--instance", "false",
    "--prune-attributes", "false",
  ],
  { stdio: "inherit", shell: process.platform === "win32" },
);

const kb = (p) => `${(statSync(p).size / 1024).toFixed(1)} Ko`;
console.log(`${name} : ${kb(raw)} → ${kb(out)} (${out})`);
