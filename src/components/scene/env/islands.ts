import { BufferAttribute, BufferGeometry, Color } from "three";
import type { DungeonModel } from "@/lib/dungeon/types";
import { Rng } from "@/lib/dungeon/rng";

/** Dessus des îles : juste sous les dalles (épaisseur 0.12 dans le kit). */
const TOP = -0.12;

// Strates : de la mousse en surface aux couches anciennes, plus sombres et violettes.
const MOSS = new Color("#3E6B2A");
const MOSS_LIGHT = new Color("#5A8F2E");
const STRATA = ["#6A5646", "#5A4A3E", "#4E3F39", "#433536", "#382C33", "#2E2430"].map((c) => new Color(c));
const TOP_CAP = new Color("#4A4440");

/**
 * Une île flottante par salle (GAMEDESIGN.md §5), fusionnées en une géométrie.
 *
 * Chaque île suit l'emprise de la salle et de son rebord (anneau de murs), avec
 * un contour un peu irrégulier, puis descend en anneaux qui se resserrent vers
 * une pointe. Couleurs de sommet en strates ; attribut `aRoom` pour le brouillard
 * par salle (matériau toon `reveal`). Déterministe : dérivée du seed du donjon.
 */
export function buildIslands(model: DungeonModel): BufferGeometry {
  const rng = Rng.fromSeed(`${model.seed}/islands`);
  const positions: number[] = [];
  const colors: number[] = [];
  const rooms: number[] = [];

  const push = (p: [number, number, number], c: Color, room: number) => {
    positions.push(p[0], p[1], p[2]);
    colors.push(c.r, c.g, c.b);
    rooms.push(room);
  };
  const tri = (a: [number, number, number], b: [number, number, number], c: [number, number, number], col: Color, room: number) => {
    push(a, col, room);
    push(b, col, room);
    push(c, col, room);
  };

  for (const room of model.rooms) {
    const r = room.rect;
    // Emprise : salle + anneau de murs, en coordonnées monde (cases centrées sur les entiers).
    const x0 = r.x - 1.5;
    const x1 = r.x + r.w + 0.5;
    const z0 = r.y - 1.5;
    const z1 = r.y + r.h + 0.5;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;

    // Contour du dessus : ~2 points par case, coins arrondis, petit bruit radial.
    const outline: [number, number][] = [];
    const corner = 0.6;
    const side = (ax: number, az: number, bx: number, bz: number) => {
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.max(2, Math.round(len * 2));
      for (let i = 0; i < n; i++) {
        const t = i / n;
        outline.push([ax + (bx - ax) * t, az + (bz - az) * t]);
      }
    };
    side(x0 + corner, z0, x1 - corner, z0);
    side(x1 - corner, z0, x1, z0 + corner);
    side(x1, z0 + corner, x1, z1 - corner);
    side(x1, z1 - corner, x1 - corner, z1);
    side(x1 - corner, z1, x0 + corner, z1);
    side(x0 + corner, z1, x0, z1 - corner);
    side(x0, z1 - corner, x0, z0 + corner);
    side(x0, z0 + corner, x0 + corner, z0);

    const size = Math.max(x1 - x0, z1 - z0);
    const depth = 1.6 + size * 0.22 + rng.next() * 0.6;
    // Anneaux : profondeur (fraction), resserrement vers le centre, couleur.
    const rings: { y: number; k: number; color: Color }[] = [{ y: TOP, k: 1, color: MOSS_LIGHT }];
    rings.push({ y: TOP - 0.16, k: 1.02, color: MOSS });
    const layers = STRATA.length;
    for (let i = 0; i < layers; i++) {
      const f = (i + 1) / (layers + 1);
      rings.push({ y: TOP - 0.16 - depth * f, k: 0.98 - 0.78 * f ** 1.4, color: STRATA[i] });
    }

    // Bruit radial par point et par anneau (strates irrégulières).
    const ringPoints = rings.map((ring, ri) =>
      outline.map(([px, pz]) => {
        const jitter = ri < 2 ? 0 : (rng.next() - 0.5) * 0.35;
        const k = ring.k + jitter * 0.15;
        return [cx + (px - cx) * k, ring.y + (ri < 2 ? 0 : (rng.next() - 0.5) * 0.12), cz + (pz - cz) * k] as [number, number, number];
      }),
    );

    // Dessus (sous les dalles et les rebords) : éventail depuis le centre.
    const top = ringPoints[0];
    const center: [number, number, number] = [cx, TOP, cz];
    for (let i = 0; i < top.length; i++) {
      tri(center, top[(i + 1) % top.length], top[i], TOP_CAP, room.id);
    }
    // Flancs : quadrilatères entre anneaux successifs, couleur de la strate du dessous.
    for (let ri = 0; ri < ringPoints.length - 1; ri++) {
      const a = ringPoints[ri];
      const b = ringPoints[ri + 1];
      const col = rings[ri + 1].color;
      for (let i = 0; i < a.length; i++) {
        const j = (i + 1) % a.length;
        tri(a[i], a[j], b[j], col, room.id);
        tri(a[i], b[j], b[i], col, room.id);
      }
    }
    // Pointe : vers un point sous le centre, légèrement décalé.
    const last = ringPoints[ringPoints.length - 1];
    const apex: [number, number, number] = [cx + (rng.next() - 0.5) * 0.8, TOP - depth * 1.25 - 0.4, cz + (rng.next() - 0.5) * 0.8];
    for (let i = 0; i < last.length; i++) {
      tri(last[i], last[(i + 1) % last.length], apex, STRATA[STRATA.length - 1], room.id);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("color", new BufferAttribute(new Float32Array(colors), 3));
  geometry.setAttribute("aRoom", new BufferAttribute(new Float32Array(rooms), 1));
  // Non indexée : normales par face, facettes nettes (look taillé).
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
