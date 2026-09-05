import { describe, expect, it } from "vitest";
import {
  chance,
  nextFloat,
  nextInt,
  nextU32,
  pick,
  pickWeighted,
  seedRng,
  shuffle,
} from "../src/core/rng";

function sequence(seed: number, count: number): number[] {
  let rng = seedRng(seed);
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const r = nextU32(rng);
    rng = r.rng;
    out.push(r.value);
  }
  return out;
}

describe("seeded RNG", () => {
  it("produces the same sequence for the same seed", () => {
    expect(sequence(12345, 50)).toEqual(sequence(12345, 50));
  });

  it("produces different sequences for different seeds", () => {
    expect(sequence(1, 50)).not.toEqual(sequence(2, 50));
    expect(sequence(12345, 50)).not.toEqual(sequence(12346, 50));
  });

  it("is pure: calling with the same state twice gives the same value", () => {
    const rng = seedRng(99);
    expect(nextU32(rng)).toEqual(nextU32(rng));
  });

  it("normalizes a zero seed to a usable non-zero state", () => {
    expect(seedRng(0)).not.toBe(0);
    expect(sequence(0, 10)).toHaveLength(10);
  });

  it("nextFloat stays within [0, 1)", () => {
    let rng = seedRng(7);
    for (let i = 0; i < 1000; i++) {
      const r = nextFloat(rng);
      rng = r.rng;
      expect(r.value).toBeGreaterThanOrEqual(0);
      expect(r.value).toBeLessThan(1);
    }
  });

  it("nextInt covers the whole inclusive range and nothing outside it", () => {
    let rng = seedRng(42);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const r = nextInt(rng, 3, 7);
      rng = r.rng;
      expect(r.value).toBeGreaterThanOrEqual(3);
      expect(r.value).toBeLessThanOrEqual(7);
      seen.add(r.value);
    }
    expect([...seen].sort()).toEqual([3, 4, 5, 6, 7]);
  });

  it("nextInt with min === max always returns that value", () => {
    const r = nextInt(seedRng(1), 5, 5);
    expect(r.value).toBe(5);
  });

  it("nextInt throws when max < min", () => {
    expect(() => nextInt(seedRng(1), 5, 4)).toThrow(RangeError);
  });

  it("pick returns an element of the array and throws on empty input", () => {
    const items = ["a", "b", "c"];
    let rng = seedRng(3);
    for (let i = 0; i < 100; i++) {
      const r = pick(rng, items);
      rng = r.rng;
      expect(items).toContain(r.value);
    }
    expect(() => pick(seedRng(1), [])).toThrow(RangeError);
  });

  it("shuffle is a permutation and does not mutate its input", () => {
    const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const copy = [...original];
    const r = shuffle(seedRng(5), original);
    expect(original).toEqual(copy);
    expect([...r.value].sort((a, b) => a - b)).toEqual(original);
    expect(r.value).not.toEqual(original);
  });

  it("chance respects probability extremes", () => {
    let rng = seedRng(8);
    for (let i = 0; i < 100; i++) {
      const never = chance(rng, 0);
      expect(never.value).toBe(false);
      const always = chance(rng, 1);
      expect(always.value).toBe(true);
      rng = always.rng;
    }
  });

  it("chance is roughly calibrated", () => {
    let rng = seedRng(11);
    let hits = 0;
    const trials = 10000;
    for (let i = 0; i < trials; i++) {
      const r = chance(rng, 0.25);
      rng = r.rng;
      if (r.value) {
        hits++;
      }
    }
    expect(hits / trials).toBeGreaterThan(0.22);
    expect(hits / trials).toBeLessThan(0.28);
  });

  it("pickWeighted never picks zero-weight entries and favours heavier ones", () => {
    const table = [
      { id: "never", weight: 0 },
      { id: "rare", weight: 1 },
      { id: "common", weight: 9 },
    ];
    let rng = seedRng(21);
    const counts = new Map<string, number>();
    for (let i = 0; i < 5000; i++) {
      const r = pickWeighted(rng, table);
      rng = r.rng;
      counts.set(r.value.id, (counts.get(r.value.id) ?? 0) + 1);
    }
    expect(counts.get("never")).toBeUndefined();
    expect(counts.get("common") ?? 0).toBeGreaterThan(counts.get("rare") ?? 0);
    expect(() => pickWeighted(seedRng(1), [{ weight: 0 }])).toThrow(RangeError);
  });
});
