/**
 * Procedural dungeon generation: rooms connected by L-shaped corridors.
 *
 * Generation is deterministic given the RNG state. After carving, a flood
 * fill verifies that every walkable tile is reachable from the spawn point;
 * if not, the level is discarded and regenerated with the advanced RNG.
 */

import {
  GRID_HEIGHT,
  GRID_WIDTH,
  type Point,
  type Rect,
  rectCenter,
  rectsIntersect,
} from "../grid";
import { type RngState, chance, nextInt } from "../rng";
import { type DungeonMap, isFullyConnected } from "./dungeon";
import type { TileType } from "./tiles";

export type GenerateOptions = {
  readonly width?: number;
  readonly height?: number;
  readonly maxRooms?: number;
  readonly minRoomSize?: number;
  readonly maxRoomSize?: number;
  /** The final level has no down staircase. */
  readonly withStairsDown?: boolean;
  readonly maxAttempts?: number;
};

export type GenerateResult = {
  readonly map: DungeonMap;
  readonly rng: RngState;
};

const DEFAULTS = {
  width: GRID_WIDTH,
  height: GRID_HEIGHT,
  maxRooms: 14,
  minRoomSize: 4,
  maxRoomSize: 11,
  withStairsDown: true,
  maxAttempts: 50,
} as const;

type MutableGrid = {
  readonly width: number;
  readonly height: number;
  readonly tiles: TileType[];
};

function carveRoom(grid: MutableGrid, room: Rect): void {
  for (let y = room.y; y < room.y + room.height; y++) {
    for (let x = room.x; x < room.x + room.width; x++) {
      grid.tiles[y * grid.width + x] = "floor";
    }
  }
}

function carveHorizontal(grid: MutableGrid, x0: number, x1: number, y: number): void {
  const from = Math.min(x0, x1);
  const to = Math.max(x0, x1);
  for (let x = from; x <= to; x++) {
    grid.tiles[y * grid.width + x] = "floor";
  }
}

function carveVertical(grid: MutableGrid, y0: number, y1: number, x: number): void {
  const from = Math.min(y0, y1);
  const to = Math.max(y0, y1);
  for (let y = from; y <= to; y++) {
    grid.tiles[y * grid.width + x] = "floor";
  }
}

/** Connect two points with an L-shaped corridor; the RNG chooses which leg goes first. */
function carveCorridor(grid: MutableGrid, rng: RngState, a: Point, b: Point): RngState {
  const r = chance(rng, 0.5);
  if (r.value) {
    carveHorizontal(grid, a.x, b.x, a.y);
    carveVertical(grid, a.y, b.y, b.x);
  } else {
    carveVertical(grid, a.y, b.y, a.x);
    carveHorizontal(grid, a.x, b.x, b.y);
  }
  return r.rng;
}

/** The room farthest (Chebyshev) from a reference room; used to place the stairs. */
function farthestRoom(rooms: readonly Rect[], from: Rect): Rect {
  const origin = rectCenter(from);
  let best = from;
  let bestDistance = -1;
  for (const room of rooms) {
    const c = rectCenter(room);
    const d = Math.max(Math.abs(c.x - origin.x), Math.abs(c.y - origin.y));
    if (d > bestDistance) {
      bestDistance = d;
      best = room;
    }
  }
  return best;
}

function attemptGenerate(rng: RngState, options: Required<GenerateOptions>): GenerateResult | null {
  const { width, height } = options;
  const grid: MutableGrid = {
    width,
    height,
    tiles: new Array<TileType>(width * height).fill("wall"),
  };
  const rooms: Rect[] = [];
  let state = rng;

  // Place rooms. Each candidate is rejected if it touches an existing room
  // (with one tile of padding so walls stay between rooms).
  const placementTries = options.maxRooms * 6;
  for (let i = 0; i < placementTries && rooms.length < options.maxRooms; i++) {
    const w = nextInt(state, options.minRoomSize, options.maxRoomSize);
    const h = nextInt(
      w.rng,
      options.minRoomSize,
      Math.max(options.minRoomSize, options.maxRoomSize - 3),
    );
    const x = nextInt(h.rng, 1, width - w.value - 2);
    const y = nextInt(x.rng, 1, height - h.value - 2);
    state = y.rng;
    const candidate: Rect = { x: x.value, y: y.value, width: w.value, height: h.value };
    if (rooms.some((existing) => rectsIntersect(existing, candidate, 1))) {
      continue;
    }
    carveRoom(grid, candidate);
    rooms.push(candidate);
  }

  if (rooms.length < 2) {
    return null;
  }

  // Connect each room to the previous one. Because every room is linked to
  // its predecessor, the chain is connected by construction; the flood fill
  // below guards against corridor carving edge cases regardless.
  for (let i = 1; i < rooms.length; i++) {
    const previous = rooms[i - 1];
    const current = rooms[i];
    if (previous === undefined || current === undefined) {
      continue;
    }
    state = carveCorridor(grid, state, rectCenter(previous), rectCenter(current));
  }

  // A few extra corridors add loops so the level is not a single chain.
  const extraCorridors = Math.floor(rooms.length / 4);
  for (let i = 0; i < extraCorridors; i++) {
    const a = nextInt(state, 0, rooms.length - 1);
    const b = nextInt(a.rng, 0, rooms.length - 1);
    state = b.rng;
    const roomA = rooms[a.value];
    const roomB = rooms[b.value];
    if (roomA === undefined || roomB === undefined || a.value === b.value) {
      continue;
    }
    state = carveCorridor(grid, state, rectCenter(roomA), rectCenter(roomB));
  }

  const firstRoom = rooms[0];
  if (firstRoom === undefined) {
    return null;
  }
  const spawn = rectCenter(firstRoom);

  let stairsDown: Point | undefined;
  if (options.withStairsDown) {
    const stairsRoom = farthestRoom(rooms, firstRoom);
    stairsDown = rectCenter(stairsRoom);
    if (stairsDown.x === spawn.x && stairsDown.y === spawn.y) {
      return null;
    }
    grid.tiles[stairsDown.y * width + stairsDown.x] = "stairs-down";
  }

  const map: DungeonMap = {
    width,
    height,
    tiles: grid.tiles,
    explored: new Array<boolean>(width * height).fill(false),
    visible: new Array<boolean>(width * height).fill(false),
    rooms,
    spawn,
    ...(stairsDown !== undefined ? { stairsDown } : {}),
  };

  if (!isFullyConnected(map, spawn)) {
    return null;
  }
  return { map, rng: state };
}

/**
 * Generate a connected dungeon level. Throws only if `maxAttempts`
 * consecutive attempts fail, which indicates a configuration problem
 * (for example a grid too small for the requested rooms).
 */
export function generateMap(rng: RngState, options: GenerateOptions = {}): GenerateResult {
  const resolved: Required<GenerateOptions> = { ...DEFAULTS, ...options };
  let state = rng;
  for (let attempt = 0; attempt < resolved.maxAttempts; attempt++) {
    const result = attemptGenerate(state, resolved);
    if (result !== null) {
      return result;
    }
    // Advance the stream so the next attempt differs.
    state = nextInt(state, 0, 1).rng;
  }
  throw new Error(
    `generateMap: failed to produce a connected level after ${String(resolved.maxAttempts)} attempts`,
  );
}
