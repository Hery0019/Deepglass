/**
 * A* pathfinding on the tile grid with 8-way movement.
 *
 * The passability predicate is supplied by the caller so the same routine
 * serves monsters (which treat other creatures as obstacles) and tests
 * (which use hand-built maps). Diagonal steps cost the same as cardinal
 * steps, matching Chebyshev distance, so the heuristic is admissible.
 */

import {
  DIRECTIONS_8,
  type Point,
  addPoints,
  chebyshevDistance,
  pointsEqual,
  toIndex,
} from "../grid";

export type PassabilityPredicate = (p: Point) => boolean;

type Node = {
  readonly index: number;
  readonly f: number;
};

/** Minimal binary min-heap keyed on f. */
class MinHeap {
  private readonly items: Node[] = [];

  get size(): number {
    return this.items.length;
  }

  push(node: Node): void {
    this.items.push(node);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      const a = this.items[i];
      const b = this.items[parent];
      if (a === undefined || b === undefined || b.f <= a.f) {
        break;
      }
      this.items[i] = b;
      this.items[parent] = a;
      i = parent;
    }
  }

  pop(): Node | undefined {
    const top = this.items[0];
    const last = this.items.pop();
    if (top === undefined || last === undefined) {
      return top;
    }
    if (this.items.length > 0) {
      this.items[0] = last;
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        const right = left + 1;
        let smallest = i;
        const s = this.items[smallest];
        const l = this.items[left];
        const r = this.items[right];
        if (l !== undefined && s !== undefined && l.f < s.f) {
          smallest = left;
        }
        const s2 = this.items[smallest];
        if (r !== undefined && s2 !== undefined && r.f < s2.f) {
          smallest = right;
        }
        if (smallest === i) {
          break;
        }
        const a = this.items[i];
        const b = this.items[smallest];
        if (a === undefined || b === undefined) {
          break;
        }
        this.items[i] = b;
        this.items[smallest] = a;
        i = smallest;
      }
    }
    return top;
  }
}

export type PathOptions = {
  readonly width: number;
  readonly height: number;
  /** Stop searching after this many node expansions; returns null if exceeded. */
  readonly maxExpansions?: number;
};

/**
 * Find a shortest path from `start` to `goal`. The result excludes `start`
 * and includes `goal`. `goal` itself need not be passable (so a monster can
 * path to the player's tile); every intermediate tile must be.
 * Returns null when no path exists within the expansion budget.
 */
export function findPath(
  start: Point,
  goal: Point,
  isPassable: PassabilityPredicate,
  options: PathOptions,
): Point[] | null {
  if (pointsEqual(start, goal)) {
    return [];
  }
  const { width, height } = options;
  const maxExpansions = options.maxExpansions ?? 2000;
  const startIndex = toIndex(start, width);
  const goalIndex = toIndex(goal, width);

  const gScore = new Map<number, number>([[startIndex, 0]]);
  const cameFrom = new Map<number, number>();
  const closed = new Set<number>();
  const open = new MinHeap();
  open.push({ index: startIndex, f: chebyshevDistance(start, goal) });

  let expansions = 0;
  while (open.size > 0) {
    const current = open.pop();
    if (current === undefined) {
      break;
    }
    if (closed.has(current.index)) {
      continue;
    }
    if (current.index === goalIndex) {
      return reconstruct(cameFrom, goalIndex, width);
    }
    closed.add(current.index);
    expansions++;
    if (expansions > maxExpansions) {
      return null;
    }

    const currentPoint = { x: current.index % width, y: Math.floor(current.index / width) };
    const currentG = gScore.get(current.index) ?? Number.POSITIVE_INFINITY;
    for (const direction of DIRECTIONS_8) {
      const next = addPoints(currentPoint, direction);
      if (next.x < 0 || next.y < 0 || next.x >= width || next.y >= height) {
        continue;
      }
      const nextIndex = toIndex(next, width);
      if (closed.has(nextIndex)) {
        continue;
      }
      if (nextIndex !== goalIndex && !isPassable(next)) {
        continue;
      }
      const tentative = currentG + 1;
      if (tentative < (gScore.get(nextIndex) ?? Number.POSITIVE_INFINITY)) {
        gScore.set(nextIndex, tentative);
        cameFrom.set(nextIndex, current.index);
        open.push({ index: nextIndex, f: tentative + chebyshevDistance(next, goal) });
      }
    }
  }
  return null;
}

function reconstruct(
  cameFrom: ReadonlyMap<number, number>,
  goalIndex: number,
  width: number,
): Point[] {
  const path: Point[] = [];
  let current: number | undefined = goalIndex;
  while (current !== undefined) {
    const previous = cameFrom.get(current);
    if (previous === undefined) {
      break;
    }
    path.push({ x: current % width, y: Math.floor(current / width) });
    current = previous;
  }
  return path.reverse();
}
