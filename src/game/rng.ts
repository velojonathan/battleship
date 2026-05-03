// Mulberry32 PRNG — 32-bit, deterministic given a seed.
// See https://en.wikipedia.org/wiki/Mulberry32. Tiny, fast, good distribution
// for game-level randomness. Not cryptographic.
export function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed(): number {
  // Entry-point only. Reducer never calls this.
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

export function pickInt(rng: () => number, max: number): number {
  return Math.floor(rng() * max);
}

export function pickOne<T>(rng: () => number, arr: readonly T[]): T {
  if (arr.length === 0) throw new Error('Cannot pick from empty array');
  const idx = Math.floor(rng() * arr.length);
  return arr[idx] as T;
}

export function shuffle<T>(rng: () => number, arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = a[i] as T;
    a[i] = a[j] as T;
    a[j] = tmp;
  }
  return a;
}
