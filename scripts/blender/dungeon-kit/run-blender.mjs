// Lance un script du kit dans Blender en ligne de commande, de façon portable.
//
//   node scripts/blender/dungeon-kit/run-blender.mjs build.py          → dungeon-kit.raw.glb
//   node scripts/blender/dungeon-kit/run-blender.mjs characters.py     → characters.raw.glb
//   node scripts/blender/dungeon-kit/run-blender.mjs preview.py [characters.py]
//
// Blender : variable BLENDER_BIN, sinon l'emplacement Windows par défaut, sinon `blender` du PATH.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const script = process.argv[2] ?? "build.py";
// Script de construction : lui-même, ou celui que l'aperçu doit rendre.
const source = script === "preview.py" ? (process.argv[3] ?? "build.py") : script;
const name = source === "characters.py" ? "characters" : "dungeon-kit";
const buildDir = join(tmpdir(), "dungeon-kit");
mkdirSync(buildDir, { recursive: true });

const candidates = [
  process.env.BLENDER_BIN,
  "C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe",
  "/Applications/Blender.app/Contents/MacOS/Blender",
].filter(Boolean);
const blender = candidates.find((p) => existsSync(p)) ?? "blender";

const args = ["-b", "--factory-startup", "-P", join(here, script), "--", join(buildDir, `${name}.raw.glb`)];
if (script === "preview.py") args.push(join(buildDir, `${name}.preview.png`), source);
execFileSync(blender, args, { stdio: "inherit" });
