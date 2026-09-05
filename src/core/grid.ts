/**
 * Grid primitives: coordinates, bounds, neighbours, distance.
 *
 * The map is a fixed 80 x 45 grid. Tiles are addressed by (x, y) with the
 * origin at the top-left. Helpers here are pure and do not depend on map
 * contents.
 */

export const GRID_WIDTH = 80;
export const GRID_HEIGHT = 45;

/** An integer grid coordinate. */
export type Point = {
  readonly x: number;
  readonly y: number;
};

/** Rectangle described by its top-left corner and size (inclusive of x..x+width-1). */
export type Rect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export function point(x: number, y: number): Point {
  return { x, y };
}

export function pointsEqual(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}

export function addPoints(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

/** Convert a point to a row-major array index. */
export function toIndex(p: Point, width: number = GRID_WIDTH): number {
  return p.y * width + p.x;
}

/** Convert a row-major array index back into a point. */
export function fromIndex(index: number, width: number = GRID_WIDTH): Point {
  return { x: index % width, y: Math.floor(index / width) };
}

/** Stable string key for use in Maps and Sets. */
export function pointKey(p: Point): string {
  return `${String(p.x)},${String(p.y)}`;
}

export function inBounds(
  p: Point,
  width: number = GRID_WIDTH,
  height: number = GRID_HEIGHT,
): boolean {
  return p.x >= 0 && p.y >= 0 && p.x < width && p.y < height;
}

/** The eight compass directions, clockwise from north. */
export const DIRECTIONS_8: readonly Point[] = [
  { x: 0, y: -1 },
  { x: 1, y: -1 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: 0 },
  { x: -1, y: -1 },
];

/** The four cardinal directions, clockwise from north. */
export const DIRECTIONS_4: readonly Point[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

/** In-bounds eight-connected neighbours of a point. */
export function neighbours8(
  p: Point,
  width: number = GRID_WIDTH,
  height: number = GRID_HEIGHT,
): Point[] {
  const result: Point[] = [];
  for (const d of DIRECTIONS_8) {
    const n = addPoints(p, d);
    if (inBounds(n, width, height)) {
      result.push(n);
    }
  }
  return result;
}

/** In-bounds four-connected neighbours of a point. */
export function neighbours4(
  p: Point,
  width: number = GRID_WIDTH,
  height: number = GRID_HEIGHT,
): Point[] {
  const result: Point[] = [];
  for (const d of DIRECTIONS_4) {
    const n = addPoints(p, d);
    if (inBounds(n, width, height)) {
      result.push(n);
    }
  }
  return result;
}

/** Chebyshev (king-move) distance: the number of 8-way steps between two points. */
export function chebyshevDistance(a: Point, b: Point): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/** Manhattan distance: the number of 4-way steps between two points. */
export function manhattanDistance(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** Two points are adjacent if they differ and are within one king-move of each other. */
export function isAdjacent(a: Point, b: Point): boolean {
  return !pointsEqual(a, b) && chebyshevDistance(a, b) <= 1;
}

/** Sign of each component of (b - a): a unit step from a toward b. */
export function directionToward(a: Point, b: Point): Point {
  return { x: Math.sign(b.x - a.x), y: Math.sign(b.y - a.y) };
}

export function rectContains(r: Rect, p: Point): boolean {
  return p.x >= r.x && p.y >= r.y && p.x < r.x + r.width && p.y < r.y + r.height;
}

/** True if two rectangles overlap, treating `padding` extra tiles around each as occupied. */
export function rectsIntersect(a: Rect, b: Rect, padding = 0): boolean {
  return (
    a.x - padding < b.x + b.width &&
    a.x + a.width + padding > b.x &&
    a.y - padding < b.y + b.height &&
    a.y + a.height + padding > b.y
  );
}

export function rectCenter(r: Rect): Point {
  return { x: r.x + Math.floor(r.width / 2), y: r.y + Math.floor(r.height / 2) };
}

/**
 * Integer points along a straight line from a to b inclusive (Bresenham).
 * Used for line of sight and projectile paths.
 */
export function lineBetween(a: Point, b: Point): Point[] {
  const points: Point[] = [];
  let x0 = a.x;
  let y0 = a.y;
  const x1 = b.x;
  const y1 = b.y;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    points.push({ x: x0, y: y0 });
    if (x0 === x1 && y0 === y1) {
      break;
    }
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
  return points;
}
