// WASM Rive auto-hébergé (repris du portfolio, src/components/agent/rive-runtime.ts).
// Sans lui, @rive-app/canvas va chercher son runtime sur unpkg/jsdelivr : une
// origine tierce sur le chemin critique de chaque canvas Rive.
//
// public/rive/rive.wasm est une copie de node_modules/@rive-app/canvas/rive.wasm
// et DOIT correspondre à la version installée (2.44.0, tirée par
// @rive-app/react-canvas 4.36.0). tests/theme.test.ts échoue sinon : recopier
// le fichier à chaque mise à jour de Rive.
import { RuntimeLoader } from "@rive-app/react-canvas";

export const RIVE_WASM_URL = "/rive/rive.wasm";

RuntimeLoader.setWasmUrl(RIVE_WASM_URL);
