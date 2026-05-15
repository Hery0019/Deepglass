/**
 * Cavern generation: a cellular automaton smooths random noise into open,
 * irregular caves. Side caves are joined to the main one by tunnels. Caverns have
 * no rooms and no doors; the spawn sits at the western end and the stairs
 * at the point farthest from it by walking distance.
 */

import { GRID_HEIGHT, GRID_WIDTH, type Point, fromIndex, toIndex } from "../grid";
import { type RngState, chance } from "../rng";
import { type DungeonMap, floodFill } from "./dungeon";
import type { GenerateResult } from "./generate";
import type { TileType } from "./tiles";

export type CavernOptions = {
  readonly width?: number;
  readonly height?: number;
  readonly withStairsDown?: boolean;
  /** Probability that a cell starts open. */
  readonly openChance?: number;
  /** Smoothing passes. */
  readonly iterations?: number;
  /** Minimum share of the grid the kept cave must cover. */
  readonly minFill?: number;
  /** Side caves smaller than this are filled in instead of tunnelled to. */
  readonly minCaveSize?: number;
  readonly maxAttempts?: number;
};

const DEFAULTS = {
  width: GRID_WIDTH,
  height: GRID_HEIGHT,
  withStairsDown: true,
  openChance: 0.45,
  iterations: 5,
  minFill: 0.35,
  minCaveSize: 12,
  maxAttempts: 50,
} as const;

function wallsAround(
  tiles: readonly TileType[],
  width: number,
  height: number,
  x: number,
  y: number,
): number {
  let count = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) {
        continue;
      }
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height || tiles[ny * width + nx] === "wall") {
        count++;
      }
    }
  }
  return count;
}

/** Walking distances from `start` over floor tiles; unreachable tiles are absent. */
export function walkingDistances(map: DungeonMap, start: Point): Map<number, number> {
  const distances = new Map<number, number>([[toIndex(start, map.width), 0]]);
  const queue: number[] = [toIndex(start, map.width)];
  let head = 0;
  while (head < queue.length) {
    const index = queue[head] ?? 0;
    head++;
    const p = fromIndex(index, map.width);
    const d = distances.get(index) ?? 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const n = { x: p.x + dx, y: p.y + dy };
        if (n.x < 0 || n.y < 0 || n.x >= map.width || n.y >= map.height) {
          continue;
        }
        const nIndex = toIndex(n, map.width);
        if (distances.has(nIndex) || map.tiles[nIndex] === "wall") {
          continue;
        }
        distances.set(nIndex, d + 1);
        queue.push(nIndex);
      }
    }
  }
  return distances;
}

/** The reachable floor tile farthest from `start` by walking distance. */
export function farthestFloor(map: DungeonMap, start: Point): Point {
  let best = start;
  let bestDistance = -1;
  for (const [index, distance] of walkingDistances(map, start)) {
    if (distance > bestDistance) {
      bestDistance = distance;
      best = fromIndex(index, map.width);
    }
  }
  return best;
}

/** Connected floor regions, largest first. */
function findComponents(tiles: readonly TileType[], width: number, height: number): Set<number>[] {
  const draft: DungeonMap = {
    width,
    height,
    tiles,
    explored: [],
    visible: [],
    rooms: [],
    spawn: { x: 0, y: 0 },
  };
  const seen = new Set<number>();
  const components: Set<number>[] = [];
  tiles.forEach((tile, index) => {
    if (tile !== "floor" || seen.has(index)) {
      return;
    }
    const component = floodFill(draft, fromIndex(index, width));
    for (const i of component) {
      seen.add(i);
    }
    components.push(component);
  });
  return components.sort((a, b) => b.size - a.size);
}

/** Carve an L-shaped passage between the closest pair of tiles of two regions. */
function tunnel(
  tiles: TileType[],
  width: number,
  from: ReadonlySet<number>,
  to: ReadonlySet<number>,
): void {
  let best: [Point, Point] | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  // Sample the smaller region fully and the larger one every few tiles; exactness is not needed.
  const stride = Math.max(1, Math.floor(from.size / 400));
  let i = 0;
  for (const a of from) {
    if (i++ % stride !== 0) {
      continue;
    }
    const pa = fromIndex(a, width);
    for (const b of to) {
      const pb = fromIndex(b, width);
      const d = Math.abs(pa.x - pb.x) + Math.abs(pa.y - pb.y);
      if (d < bestDistance) {
        bestDistance = d;
        best = [pa, pb];
      }
    }
  }
  if (best === null) {
    return;
  }
  const [a, b] = best;
  const stepX = Math.sign(b.x - a.x);
  const stepY = Math.sign(b.y - a.y);
  let x = a.x;
  let y = a.y;
  while (x !== b.x) {
    x += stepX;
    tiles[y * width + x] = "floor";
  }
  while (y !== b.y) {
    y += stepY;
    tiles[y * width + x] = "floor";
  }
}

function attempt(rng: RngState, options: Required<CavernOptions>): GenerateResult | null {
  const { width, height } = options;
  let state = rng;
  let tiles: TileType[] = new Array<TileType>(width * height).fill("wall");
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const roll = chance(state, options.openChance);
      state = roll.rng;
      tiles[y * width + x] = roll.value ? "floor" : "wall";
    }
  }
  for (let i = 0; i < options.iterations; i++) {
    const next = [...tiles];
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        next[y * width + x] = wallsAround(tiles, width, height, x, y) >= 5 ? "wall" : "floor";
      }
    }
    tiles = next;
  }

  // Join every sizeable cave to the largest one with a tunnel, then drop the crumbs.
  const components = findComponents(tiles, width, height);
  const main = components[0];
  if (main === undefined) {
    return null;
  }
  for (const component of components.slice(1)) {
    if (component.size >= options.minCaveSize) {
      tunnel(tiles, width, main, component);
      for (const i of component) {
        main.add(i);
      }
    }
  }
  const kept = findComponents(tiles, width, height)[0] ?? new Set<number>();
  if (kept.size < options.minFill * width * height) {
    return null;
  }
  tiles = tiles.map((tile, index) => (kept.has(index) ? tile : "wall"));
  const largest = kept;

  // Spawn at the westernmost floor tile nearest the vertical middle.
  let spawn: Point | null = null;
  for (const index of largest) {
    const p = fromIndex(index, width);
    if (
      spawn === null ||
      p.x < spawn.x ||
      (p.x === spawn.x && Math.abs(p.y - height / 2) < Math.abs(spawn.y - height / 2))
    ) {
      spawn = p;
    }
  }
  if (spawn === null) {
    return null;
  }

  const map: DungeonMap = {
    width,
    height,
    tiles,
    explored: new Array<boolean>(width * height).fill(false),
    visible: new Array<boolean>(width * height).fill(false),
    rooms: [],
    spawn,
  };
  if (!options.withStairsDown) {
    return { map, rng: state };
  }
  const stairsDown = farthestFloor(map, spawn);
  if (stairsDown.x === spawn.x && stairsDown.y === spawn.y) {
    return null;
  }
  const withStairs = [...tiles];
  withStairs[toIndex(stairsDown, width)] = "stairs-down";
  return { map: { ...map, tiles: withStairs, stairsDown }, rng: state };
}

/** Generate a cavern level. Throws only if every attempt fails, which indicates bad options. */
export function generateCavern(rng: RngState, options: CavernOptions = {}): GenerateResult {
  const resolved: Required<CavernOptions> = { ...DEFAULTS, ...options };
  let state = rng;
  for (let i = 0; i < resolved.maxAttempts; i++) {
    const result = attempt(state, resolved);
    if (result !== null) {
      return result;
    }
    // Advance the RNG so the next attempt differs.
    state = chance(state, 0.5).rng;
  }
  throw new Error(
    `generateCavern: no usable cavern after ${String(resolved.maxAttempts)} attempts`,
  );
}
