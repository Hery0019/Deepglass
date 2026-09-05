import { describe, expect, it } from "vitest";
import { GRID_HEIGHT, GRID_WIDTH, toIndex } from "../src/core/grid";
import { floodFill, isFullyConnected, tileAt } from "../src/core/map/dungeon";
import { generateMap } from "../src/core/map/generate";
import { seedRng } from "../src/core/rng";

describe("dungeon generation", () => {
  it(
    "generates 500 connected maps with exactly one reachable down staircase",
    { timeout: 60_000 },
    () => {
      for (let seed = 1; seed <= 500; seed++) {
        const { map } = generateMap(seedRng(seed));

        expect(map.width).toBe(GRID_WIDTH);
        expect(map.height).toBe(GRID_HEIGHT);
        expect(map.tiles).toHaveLength(GRID_WIDTH * GRID_HEIGHT);

        // Spawn is on a walkable tile and the whole level hangs together.
        expect(tileAt(map, map.spawn)).toBe("floor");
        expect(isFullyConnected(map, map.spawn)).toBe(true);

        // Exactly one down staircase exists and it is reachable from spawn.
        const stairIndices: number[] = [];
        map.tiles.forEach((tile, index) => {
          if (tile === "stairs-down") {
            stairIndices.push(index);
          }
        });
        expect(stairIndices).toHaveLength(1);
        expect(map.stairsDown).toBeDefined();
        if (map.stairsDown !== undefined) {
          expect(toIndex(map.stairsDown, map.width)).toBe(stairIndices[0]);
          expect(floodFill(map, map.spawn).has(toIndex(map.stairsDown, map.width))).toBe(true);
        }
      }
    },
  );

  it("is deterministic for a given seed", () => {
    const a = generateMap(seedRng(4242));
    const b = generateMap(seedRng(4242));
    expect(a.map).toEqual(b.map);
    expect(a.rng).toBe(b.rng);
  });

  it("produces different layouts for different seeds", () => {
    const a = generateMap(seedRng(1));
    const b = generateMap(seedRng(2));
    expect(a.map.tiles).not.toEqual(b.map.tiles);
  });

  it("keeps the outer border solid so nothing can walk off the grid", () => {
    const { map } = generateMap(seedRng(77));
    for (let x = 0; x < map.width; x++) {
      expect(tileAt(map, { x, y: 0 })).toBe("wall");
      expect(tileAt(map, { x, y: map.height - 1 })).toBe("wall");
    }
    for (let y = 0; y < map.height; y++) {
      expect(tileAt(map, { x: 0, y })).toBe("wall");
      expect(tileAt(map, { x: map.width - 1, y })).toBe("wall");
    }
  });

  it("omits the staircase on the final level", () => {
    const { map } = generateMap(seedRng(9), { withStairsDown: false });
    expect(map.stairsDown).toBeUndefined();
    expect(map.tiles.filter((t) => t === "stairs-down")).toHaveLength(0);
    expect(isFullyConnected(map, map.spawn)).toBe(true);
  });

  it("treats out-of-bounds queries as wall", () => {
    const { map } = generateMap(seedRng(3));
    expect(tileAt(map, { x: -1, y: 5 })).toBe("wall");
    expect(tileAt(map, { x: map.width, y: 5 })).toBe("wall");
  });
});
