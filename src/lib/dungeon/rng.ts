/**
 * PRNG déterministe : hash cyrb128 → générateur sfc32.
 *
 * Seules des opérations entières 32 bits sont utilisées, donc la suite tirée est
 * identique sur tous les moteurs JS. C'est la seule source d'aléa autorisée dans
 * `lib/dungeon` et `lib/game` : jamais `Math.random`.
 */

export type RngState = readonly [number, number, number, number];

/** Hash 128 bits d'une chaîne (cyrb128), sous forme de 4 entiers non signés. */
export function hash128(input: string): RngState {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < input.length; i++) {
    const k = input.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  /**
   * @param key identifiant stable du flux, base de `fork` : un sous-flux ne
   *   dépend que de la clé et de son nom, jamais du nombre de tirages déjà faits.
   */
  private constructor(
    private readonly key: string,
    state: RngState,
  ) {
    [this.a, this.b, this.c, this.d] = state;
  }

  static fromSeed(seed: string): Rng {
    const rng = new Rng(seed, hash128(seed));
    // Les premières sorties de sfc32 sont peu mélangées : on les jette.
    for (let i = 0; i < 15; i++) rng.nextUint32();
    return rng;
  }

  /** Reprend un flux sauvegardé (rejouer une partie à partir de son état). */
  static fromState(state: RngState): Rng {
    return new Rng(`state:${state.join(",")}`, state);
  }

  /** Sous-flux nommé et indépendant : ajouter des tirages ici ne décale pas les autres. */
  fork(name: string): Rng {
    return Rng.fromSeed(`${this.key}/${name}`);
  }

  state(): RngState {
    return [this.a >>> 0, this.b >>> 0, this.c >>> 0, this.d >>> 0];
  }

  nextUint32(): number {
    this.a |= 0;
    this.b |= 0;
    this.c |= 0;
    this.d |= 0;
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** Flottant dans [0, 1). */
  next(): number {
    return this.nextUint32() / 4294967296;
  }

  /** Entier uniforme dans [min, max], bornes incluses. */
  int(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new RangeError(`Rng.int: bornes invalides [${min}, ${max}]`);
    }
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError("Rng.pick: liste vide");
    return items[this.int(0, items.length - 1)];
  }

  /** Tirage pondéré ; les poids nuls ou négatifs ne sont jamais choisis. */
  weightedIndex(weights: readonly number[]): number {
    let total = 0;
    for (const w of weights) if (w > 0) total += w;
    if (total <= 0) throw new RangeError("Rng.weightedIndex: aucun poids positif");
    let roll = this.next() * total;
    for (let i = 0; i < weights.length; i++) {
      if (weights[i] <= 0) continue;
      roll -= weights[i];
      if (roll < 0) return i;
    }
    // Arrondi flottant : on retombe sur le dernier poids positif.
    for (let i = weights.length - 1; i >= 0; i--) if (weights[i] > 0) return i;
    throw new Error("unreachable");
  }

  /** Copie mélangée (Fisher–Yates) ; l'entrée n'est pas modifiée. */
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
}

/** Comparaison de chaînes indépendante de la locale (jamais `localeCompare`). */
export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
