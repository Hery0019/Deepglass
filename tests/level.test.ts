import { describe, expect, it } from "vitest";
import { MONSTERS, MONSTER_LIST } from "../src/core/data/monsters";
import { FINAL_DEPTH, createLevel, spawnTableForDepth } from "../src/core/level";
import { isWalkableAt } from "../src/core/map/dungeon";
import { seedRng } from "../src/core/rng";

describe("level population", () => {
  it("has at least six monster types with distinct behaviours", () => {
    expect(MONSTER_LIST.length).toBeGreaterThanOrEqual(6);
    const behaviours = new Set(MONSTER_LIST.map((m) => m.behaviour));
    expect(behaviours.size).toBeGreaterThanOrEqual(5);
  });

  it("offers at least one random spawn at every depth", () => {
    for (let depth = 1; depth <= FINAL_DEPTH; depth++) {
      expect(spawnTableForDepth(depth).length).toBeGreaterThan(0);
    }
  });

  it("never random-spawns the boss", () => {
    for (let depth = 1; depth <= FINAL_DEPTH; depth++) {
      expect(spawnTableForDepth(depth).some((m) => m.id === MONSTERS.warden.id)).toBe(false);
    }
  });

  it("places monsters on walkable tiles, never on spawn, stairs, or each other", () => {
    for (let seed = 1; seed <= 40; seed++) {
      for (const depth of [1, 4, 8]) {
        const level = createLevel(seedRng(seed), depth);
        const seen = new Set<string>();
        for (const m of level.monsters) {
          const key = `${String(m.position.x)},${String(m.position.y)}`;
          expect(seen.has(key)).toBe(false);
          seen.add(key);
          expect(isWalkableAt(level.map, m.position)).toBe(true);
          expect(m.position).not.toEqual(level.map.spawn);
          expect(m.position).not.toEqual(level.map.stairsDown);
        }
        expect(level.monsters.length).toBeGreaterThan(0);
      }
    }
  });

  it("only spawns monsters whose depth range includes the level depth", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const level = createLevel(seedRng(seed), 1);
      for (const m of level.monsters) {
        const def = MONSTER_LIST.find((d) => d.name === m.name);
        expect(def).toBeDefined();
        expect(def !== undefined && def.minDepth <= 1 && def.maxDepth >= 1).toBe(true);
      }
    }
  });

  it("places exactly one boss on the final level and no stairs down", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const level = createLevel(seedRng(seed), FINAL_DEPTH);
      expect(level.map.stairsDown).toBeUndefined();
      expect(level.monsters.filter((m) => m.isBoss === true)).toHaveLength(1);
    }
    const shallow = createLevel(seedRng(1), 1);
    expect(shallow.monsters.some((m) => m.isBoss === true)).toBe(false);
  });
});
