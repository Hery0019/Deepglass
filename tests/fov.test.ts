import { describe, expect, it } from "vitest";
import { isOpaqueAt, isExploredAt, isVisibleAt } from "../src/core/map/dungeon";
import { toIndex } from "../src/core/grid";
import { computeFov, updateVisibility } from "../src/core/systems/fov";
import { mapFromStrings, visibilityToStrings } from "./helpers";

function fovStrings(rows: readonly string[], radius = 8): string[] {
  const { map, origin } = mapFromStrings(rows);
  const visible = computeFov((p) => isOpaqueAt(map, p), origin, radius, map.width, map.height);
  return visibilityToStrings(map, visible);
}

describe("field of view (recursive shadowcasting)", () => {
  it("sees the whole of a straight corridor and its walls", () => {
    expect(fovStrings(["###########", "#....@....#", "###########"])).toEqual([
      "###########",
      "#.........#",
      "###########",
    ]);
  });

  it("sees every tile of a small open room, including the corner walls", () => {
    const room = [
      "#############",
      "#...........#",
      "#...........#",
      "#...........#",
      "#...........#",
      "#.....@.....#",
      "#...........#",
      "#...........#",
      "#...........#",
      "#...........#",
      "#############",
    ];
    expect(fovStrings(room)).toEqual(room.map((row) => row.replace("@", ".")));
  });

  it("casts a widening shadow behind a pillar", () => {
    const rows = [
      "#########",
      "#.......#",
      "#.......#",
      "#...#...#",
      "#...#...#",
      "#...@...#",
      "#.......#",
      "#########",
    ];
    expect(fovStrings(rows)).toEqual([
      "#       #",
      "#.     .#",
      "#..   ..#",
      "#... ...#",
      "#...#...#",
      "#.......#",
      "#.......#",
      "#########",
    ]);
  });

  it("does not see through an interior wall except via its gap", () => {
    const rows = [
      "############",
      "#.....#....#",
      "#.....#....#",
      "#..@..#....#",
      "#.....#....#",
      "#.....###..#",
      "#..........#",
      "############",
    ];
    expect(fovStrings(rows)).toEqual([
      "#######     ",
      "#.....#     ",
      "#.....#     ",
      "#.....#     ",
      "#.....#     ",
      "#.....#     ",
      "#.......    ",
      "#########   ",
    ]);
  });

  it("respects the sight radius in an open room", () => {
    const rows = [
      "###############",
      "#.............#",
      "#.............#",
      "#.............#",
      "#.............#",
      "#.............#",
      "#.............#",
      "#......@......#",
      "#.............#",
      "#.............#",
      "#.............#",
      "#.............#",
      "#.............#",
      "#.............#",
      "###############",
    ];
    const { map, origin } = mapFromStrings(rows);
    const visible = computeFov((p) => isOpaqueAt(map, p), origin, 3, map.width, map.height);
    // Within radius 3 (Euclidean) tiles are visible; further tiles are not.
    expect(visible.has(toIndex({ x: 7, y: 4 }, map.width))).toBe(true);
    expect(visible.has(toIndex({ x: 9, y: 5 }, map.width))).toBe(true);
    expect(visible.has(toIndex({ x: 7, y: 3 }, map.width))).toBe(false);
    expect(visible.has(toIndex({ x: 10, y: 4 }, map.width))).toBe(false);
    expect(visible.has(toIndex({ x: 1, y: 1 }, map.width))).toBe(false);
    expect(visible.has(toIndex(origin, map.width))).toBe(true);
  });

  it("is symmetric for two points in an open room", () => {
    const rows = [
      "###########",
      "#.........#",
      "#.........#",
      "#....#....#",
      "#.........#",
      "#.........#",
      "###########",
    ];
    const { map } = mapFromStrings(rows);
    const a = { x: 2, y: 1 };
    const b = { x: 8, y: 5 };
    const fromA = computeFov((p) => isOpaqueAt(map, p), a, 12, map.width, map.height);
    const fromB = computeFov((p) => isOpaqueAt(map, p), b, 12, map.width, map.height);
    expect(fromA.has(toIndex(b, map.width))).toBe(fromB.has(toIndex(a, map.width)));
  });

  it("marks visible tiles explored and keeps them explored after moving away", () => {
    const rows = ["###########", "#.@.......#", "###########"];
    const { map, origin } = mapFromStrings(rows);
    const first = updateVisibility(map, origin, 2);
    expect(isVisibleAt(first, { x: 4, y: 1 })).toBe(true);
    expect(isVisibleAt(first, { x: 8, y: 1 })).toBe(false);
    expect(isExploredAt(first, { x: 4, y: 1 })).toBe(true);

    const second = updateVisibility(first, { x: 8, y: 1 }, 2);
    expect(isVisibleAt(second, { x: 4, y: 1 })).toBe(false);
    expect(isExploredAt(second, { x: 4, y: 1 })).toBe(true);
    expect(isVisibleAt(second, { x: 8, y: 1 })).toBe(true);
    // The input map is untouched.
    expect(map.visible.every((v) => !v)).toBe(true);
  });

  it("returns an empty set for an out-of-bounds origin", () => {
    const { map } = mapFromStrings(["###", "#.#", "###"]);
    expect(
      computeFov((p) => isOpaqueAt(map, p), { x: -1, y: 0 }, 5, map.width, map.height).size,
    ).toBe(0);
  });
});
