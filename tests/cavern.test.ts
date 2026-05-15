import { describe, expect, it } from "vitest";
import { FINAL_DEPTH, createLevel, rollCavern } from "../src/core/level";
import { farthestFloor, generateCavern } from "../src/core/map/cavern";
import { floodFill, isFullyConnected, isWalkableAt, tileAt } from "../src/core/map/dungeon";
import { seedRng } from "../src/core/rng";
import { toIndex } from "../src/core/grid";

describe("cavern generation", () => {
  it("produces one connected cave with a reachable staircase far from the entrance", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const { map } = generateCavern(seedRng(seed));
      expect(map.rooms).toHaveLength(0);
      expect(tileAt(map, map.spawn)).toBe("floor");
      expect(isFullyConnected(map, map.spawn)).toBe(true);
      expect(map.stairsDown).toBeDefined();
      if (map.stairsDown !== undefined) {
        expect(tileAt(map, map.stairsDown)).toBe("stairs-down");
        expect(floodFill(map, map.spawn).has(toIndex(map.stairsDown, map.width))).toBe(true);
        expect(map.stairsDown).toEqual(farthestFloor({ ...map, tiles: map.tiles }, map.spawn));
      }
      let floor = 0;
      for (const tile of map.tiles) {
        if (tile !== "wall") {
          floor++;
        }
      }
      expect(floor).toBeGreaterThan(0.3 * map.width * map.height);
      expect(map.tiles.includes("door-closed")).toBe(false);
    }
  });

  it("keeps the border solid and is deterministic", () => {
    const a = generateCavern(seedRng(9));
    const b = generateCavern(seedRng(9));
    expect(a.map).toEqual(b.map);
    for (let x = 0; x < a.map.width; x++) {
      expect(tileAt(a.map, { x, y: 0 })).toBe("wall");
      expect(tileAt(a.map, { x, y: a.map.height - 1 })).toBe("wall");
    }
  });

  it("never makes the first or last level a cavern, and sometimes the others", () => {
    expect(rollCavern(seedRng(1), 1).cavern).toBe(false);
    expect(rollCavern(seedRng(1), FINAL_DEPTH).cavern).toBe(false);
    let caverns = 0;
    for (let seed = 1; seed <= 100; seed++) {
      if (rollCavern(seedRng(seed), 4).cavern) {
        caverns++;
      }
    }
    expect(caverns).toBeGreaterThan(15);
    expect(caverns).toBeLessThan(60);
  });

  it("populates cavern levels away from the entrance and on floor tiles", () => {
    let caverns = 0;
    for (let seed = 1; seed <= 60 && caverns < 10; seed++) {
      const level = createLevel(seedRng(seed), 4);
      if (level.map.rooms.length > 0) {
        continue;
      }
      caverns++;
      expect(level.monsters.length).toBeGreaterThan(0);
      expect(level.items.length).toBeGreaterThan(0);
      for (const e of [...level.monsters, ...level.items, ...level.traps]) {
        expect(isWalkableAt(level.map, e.position)).toBe(true);
        expect(e.position).not.toEqual(level.map.spawn);
      }
      for (const m of level.monsters) {
        expect(
          Math.max(
            Math.abs(m.position.x - level.map.spawn.x),
            Math.abs(m.position.y - level.map.spawn.y),
          ),
        ).toBeGreaterThanOrEqual(8);
      }
    }
    expect(caverns).toBeGreaterThan(0);
  });
});
