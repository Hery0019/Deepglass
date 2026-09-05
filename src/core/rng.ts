/**
 * Seeded pseudo-random number generator (Mulberry32).
 *
 * The RNG state is a single 32-bit unsigned integer, stored in GameState so
 * that serializing the state also serializes the random stream. Every helper
 * is pure: it takes an RngState and returns both a value and the advanced
 * state. Callers must thread the new state forward.
 */

/** Opaque RNG state: a 32-bit unsigned integer. */
export type RngState = number;

/** Normalize an arbitrary number into a valid 32-bit RNG state. */
export function seedRng(seed: number): RngState {
  // Ensure a non-zero, in-range state so every seed yields a usable stream.
  const s = Math.floor(seed) >>> 0;
  return s === 0 ? 0x9e3779b9 : s;
}

/**
 * Advance the generator once (Mulberry32 step).
 * Returns the next state and a uniformly distributed 32-bit unsigned value.
 */
export function nextU32(rng: RngState): { readonly rng: RngState; readonly value: number } {
  const next = (rng + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = (t ^ (t >>> 14)) >>> 0;
  return { rng: next, value };
}

/** Uniform float in [0, 1). */
export function nextFloat(rng: RngState): { readonly rng: RngState; readonly value: number } {
  const r = nextU32(rng);
  return { rng: r.rng, value: r.value / 4294967296 };
}

/** Uniform integer in the inclusive range [min, max]. */
export function nextInt(
  rng: RngState,
  min: number,
  max: number,
): { readonly rng: RngState; readonly value: number } {
  if (max < min) {
    throw new RangeError(`nextInt: max (${String(max)}) is less than min (${String(min)})`);
  }
  const span = max - min + 1;
  const r = nextU32(rng);
  return { rng: r.rng, value: min + (r.value % span) };
}

/** Pick one element of a non-empty array uniformly at random. */
export function pick<T>(
  rng: RngState,
  items: readonly T[],
): { readonly rng: RngState; readonly value: T } {
  if (items.length === 0) {
    throw new RangeError("pick: cannot pick from an empty array");
  }
  const r = nextInt(rng, 0, items.length - 1);
  const value = items[r.value];
  if (value === undefined) {
    throw new RangeError("pick: index out of range");
  }
  return { rng: r.rng, value };
}

/** Return a shuffled copy of the array (Fisher-Yates). The input is not mutated. */
export function shuffle<T>(
  rng: RngState,
  items: readonly T[],
): { readonly rng: RngState; readonly value: readonly T[] } {
  const result = [...items];
  let state = rng;
  for (let i = result.length - 1; i > 0; i--) {
    const r = nextInt(state, 0, i);
    state = r.rng;
    const j = r.value;
    const a = result[i];
    const b = result[j];
    if (a !== undefined && b !== undefined) {
      result[i] = b;
      result[j] = a;
    }
  }
  return { rng: state, value: result };
}

/** Return true with the given probability in [0, 1]. */
export function chance(
  rng: RngState,
  probability: number,
): { readonly rng: RngState; readonly value: boolean } {
  const r = nextFloat(rng);
  return { rng: r.rng, value: r.value < probability };
}

/**
 * Pick from a weighted table. Each entry has a non-negative `weight`.
 * Entries with weight 0 are never chosen.
 */
export function pickWeighted<T extends { readonly weight: number }>(
  rng: RngState,
  items: readonly T[],
): { readonly rng: RngState; readonly value: T } {
  let total = 0;
  for (const item of items) {
    total += item.weight;
  }
  if (total <= 0) {
    throw new RangeError("pickWeighted: total weight must be positive");
  }
  const r = nextFloat(rng);
  let threshold = r.value * total;
  for (const item of items) {
    threshold -= item.weight;
    if (threshold < 0 && item.weight > 0) {
      return { rng: r.rng, value: item };
    }
  }
  // Floating-point edge case: fall back to the last positively weighted item.
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item !== undefined && item.weight > 0) {
      return { rng: r.rng, value: item };
    }
  }
  throw new RangeError("pickWeighted: no item with positive weight");
}
