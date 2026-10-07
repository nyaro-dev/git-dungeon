import { readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ACCENT, ACCENT_HOVER, BG, CONTRAST, TEXT, issueColor, ISSUE_COLORS } from "@/lib/theme";

const root = join(__dirname, "..");
const css = readFileSync(join(root, "src/app/globals.css"), "utf8").toLowerCase();
const cssVar = (name: string) => css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`))?.[1];

describe("DA : une seule source de vérité", () => {
  it("les variables CSS reflètent src/lib/theme.ts", () => {
    expect(cssVar("lime")).toBe(ACCENT.toLowerCase());
    expect(cssVar("lime-hover")).toBe(ACCENT_HOVER.toLowerCase());
    expect(cssVar("contrast")).toBe(CONTRAST.toLowerCase());
    expect(cssVar("bg-primary")).toBe(BG.primary);
    expect(cssVar("bg-secondary")).toBe(BG.secondary);
    expect(cssVar("bg-card")).toBe(BG.card);
    expect(cssVar("text-primary")).toBe(TEXT.primary);
    expect(cssVar("text-secondary")).toBe(TEXT.secondary);
    expect(cssVar("text-muted")).toBe(TEXT.muted);
  });

  it("aucune couleur d'accent codée en dur dans les composants", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(tsx?|css)$/.test(name) && !path.endsWith("theme.ts") && !path.endsWith("globals.css")) {
          if (/#c3fb03|#cffc35/i.test(readFileSync(path, "utf8"))) offenders.push(path);
        }
      }
    };
    walk(join(root, "src"));
    expect(offenders).toEqual([]);
  });

  it("issueColor boucle sur la palette, numéros négatifs compris", () => {
    expect(issueColor(0)).toBe(ISSUE_COLORS[0]);
    expect(issueColor(13)).toBe(ISSUE_COLORS[3]);
    expect(issueColor(-1)).toBe(ISSUE_COLORS[9]);
  });

  it("le WASM Rive auto-hébergé correspond au runtime installé", () => {
    const pkg = createRequire(join(root, "node_modules/@rive-app/react-canvas/package.json")).resolve(
      "@rive-app/canvas/package.json",
    );
    const installed = readFileSync(join(pkg, "..", "rive.wasm"));
    const hosted = readFileSync(join(root, "public/rive/rive.wasm"));
    expect(hosted.equals(installed)).toBe(true);
  });
});
