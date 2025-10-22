import { describe, expect, it } from "vitest";
import {
  GRID_HEIGHT,
  GRID_WIDTH,
  chebyshevDistance,
  directionToward,
  fromIndex,
  inBounds,
  isAdjacent,
  lineBetween,
  manhattanDistance,
  neighbours4,
  neighbours8,
  point,
  rectCenter,
  rectsIntersect,
  toIndex,
} from "../src/core/grid";

describe("grid primitives", () => {
  it("has the expected default dimensions", () => {
    expect(GRID_WIDTH).toBe(80);
    expect(GRID_HEIGHT).toBe(45);
  });

  it("checks bounds inclusively at the origin and exclusively at the far edge", () => {
    expect(inBounds(point(0, 0))).toBe(true);
    expect(inBounds(point(79, 44))).toBe(true);
    expect(inBounds(point(80, 44))).toBe(false);
    expect(inBounds(point(79, 45))).toBe(false);
    expect(inBounds(point(-1, 0))).toBe(false);
    expect(inBounds(point(0, -1))).toBe(false);
  });

  it("round-trips index conversions", () => {
    for (const p of [point(0, 0), point(79, 0), point(0, 44), point(79, 44), point(13, 7)]) {
      expect(fromIndex(toIndex(p))).toEqual(p);
    }
    expect(toIndex(point(1, 1))).toBe(GRID_WIDTH + 1);
  });

  it("enumerates eight neighbours in the interior and fewer at corners", () => {
    expect(neighbours8(point(10, 10))).toHaveLength(8);
    expect(neighbours8(point(0, 0))).toHaveLength(3);
    expect(neighbours8(point(79, 44))).toHaveLength(3);
    expect(neighbours8(point(0, 10))).toHaveLength(5);
    for (const n of neighbours8(point(0, 0))) {
      expect(inBounds(n)).toBe(true);
    }
  });

  it("enumerates four neighbours in the interior and two at corners", () => {
    expect(neighbours4(point(10, 10))).toHaveLength(4);
    expect(neighbours4(point(0, 0))).toHaveLength(2);
  });

  it("computes Chebyshev and Manhattan distances", () => {
    expect(chebyshevDistance(point(0, 0), point(3, 4))).toBe(4);
    expect(chebyshevDistance(point(5, 5), point(5, 5))).toBe(0);
    expect(chebyshevDistance(point(2, 2), point(-1, 3))).toBe(3);
    expect(manhattanDistance(point(0, 0), point(3, 4))).toBe(7);
  });

  it("treats diagonal tiles as adjacent and the same tile as not adjacent", () => {
    expect(isAdjacent(point(1, 1), point(2, 2))).toBe(true);
    expect(isAdjacent(point(1, 1), point(1, 2))).toBe(true);
    expect(isAdjacent(point(1, 1), point(1, 1))).toBe(false);
    expect(isAdjacent(point(1, 1), point(3, 1))).toBe(false);
  });

  it("gives a unit step toward a target", () => {
    expect(directionToward(point(0, 0), point(5, -3))).toEqual(point(1, -1));
    expect(directionToward(point(4, 4), point(4, 4))).toEqual(point(0, 0));
  });

  it("detects rectangle intersection with padding", () => {
    const a = { x: 0, y: 0, width: 5, height: 5 };
    const b = { x: 5, y: 0, width: 5, height: 5 };
    expect(rectsIntersect(a, b)).toBe(false);
    expect(rectsIntersect(a, b, 1)).toBe(true);
    expect(rectsIntersect(a, { x: 2, y: 2, width: 2, height: 2 })).toBe(true);
    expect(rectCenter({ x: 2, y: 2, width: 4, height: 6 })).toEqual(point(4, 5));
  });

  it("draws Bresenham lines that include both endpoints and step by one", () => {
    const line = lineBetween(point(0, 0), point(5, 2));
    expect(line[0]).toEqual(point(0, 0));
    expect(line[line.length - 1]).toEqual(point(5, 2));
    expect(line).toHaveLength(6);
    for (let i = 1; i < line.length; i++) {
      const prev = line[i - 1];
      const cur = line[i];
      if (prev !== undefined && cur !== undefined) {
        expect(chebyshevDistance(prev, cur)).toBe(1);
      }
    }
    expect(lineBetween(point(3, 3), point(3, 3))).toEqual([point(3, 3)]);
  });
});
