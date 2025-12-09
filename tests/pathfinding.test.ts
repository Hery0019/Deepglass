import { describe, expect, it } from "vitest";
import { chebyshevDistance } from "../src/core/grid";
import { isWalkableAt } from "../src/core/map/dungeon";
import { findPath } from "../src/core/systems/pathfinding";
import { mapFromStrings } from "./helpers";

function pathOn(rows: readonly string[], goal: { x: number; y: number }) {
  const { map, origin } = mapFromStrings(rows);
  return findPath(origin, goal, (p) => isWalkableAt(map, p), {
    width: map.width,
    height: map.height,
  });
}

describe("A* pathfinding", () => {
  it("returns an empty path when already at the goal", () => {
    const { map, origin } = mapFromStrings(["#####", "#.@.#", "#####"]);
    expect(
      findPath(origin, origin, (p) => isWalkableAt(map, p), {
        width: map.width,
        height: map.height,
      }),
    ).toEqual([]);
  });

  it("finds a straight path along a corridor", () => {
    const path = pathOn(["#########", "#@......#", "#########"], { x: 7, y: 1 });
    expect(path).toEqual([
      { x: 2, y: 1 },
      { x: 3, y: 1 },
      { x: 4, y: 1 },
      { x: 5, y: 1 },
      { x: 6, y: 1 },
      { x: 7, y: 1 },
    ]);
  });

  it("uses diagonals so path length equals Chebyshev distance in the open", () => {
    const rows = ["#########", "#@......#", "#.......#", "#.......#", "#.......#", "#########"];
    const path = pathOn(rows, { x: 7, y: 4 });
    expect(path).not.toBeNull();
    expect(path?.length).toBe(chebyshevDistance({ x: 1, y: 1 }, { x: 7, y: 4 }));
  });

  it("routes around an obstacle", () => {
    const rows = ["#########", "#@..#...#", "#...#...#", "#.......#", "#########"];
    const path = pathOn(rows, { x: 7, y: 1 });
    expect(path).not.toBeNull();
    if (path === null) {
      return;
    }
    // Every step is adjacent to the previous one and on a walkable tile.
    let previous = { x: 1, y: 1 };
    const { map } = mapFromStrings(rows);
    for (const step of path) {
      expect(chebyshevDistance(previous, step)).toBe(1);
      expect(isWalkableAt(map, step)).toBe(true);
      previous = step;
    }
    expect(previous).toEqual({ x: 7, y: 1 });
    // The detour must pass through the gap in row 3.
    expect(path.some((p) => p.y === 3)).toBe(true);
  });

  it("returns null when the goal is walled off", () => {
    const path = pathOn(["#########", "#@..#...#", "#...#...#", "#...#...#", "#########"], {
      x: 7,
      y: 1,
    });
    expect(path).toBeNull();
  });

  it("allows the goal tile itself to be impassable", () => {
    const rows = ["#######", "#@....#", "#######"];
    const { map, origin } = mapFromStrings(rows);
    const goal = { x: 5, y: 1 };
    const path = findPath(origin, goal, (p) => isWalkableAt(map, p) && p.x !== 5, {
      width: map.width,
      height: map.height,
    });
    expect(path?.[path.length - 1]).toEqual(goal);
  });

  it("gives up when the expansion budget is exhausted", () => {
    const rows = [
      "##########",
      "#@.......#",
      "#........#",
      "#........#",
      "#.......>#",
      "##########",
    ];
    const path = pathOn(rows, { x: 8, y: 4 });
    expect(path).not.toBeNull();
    const { map, origin } = mapFromStrings(rows);
    const limited = findPath(origin, { x: 8, y: 4 }, (p) => isWalkableAt(map, p), {
      width: map.width,
      height: map.height,
      maxExpansions: 2,
    });
    expect(limited).toBeNull();
  });
});
