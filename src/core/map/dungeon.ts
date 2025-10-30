/**
 * The dungeon map: a fixed-size grid of tiles plus per-tile visibility
 * memory. All arrays are row-major and indexed with toIndex().
 */

import { type Point, type Rect, inBounds, toIndex } from "../grid";
import { type TileType, isOpaque, isWalkable } from "./tiles";

export type DungeonMap = {
  readonly width: number;
  readonly height: number;
  readonly tiles: readonly TileType[];
  /** Tiles the player has seen at least once (drawn dimmed when not visible). */
  readonly explored: readonly boolean[];
  /** Tiles currently in the player's field of view. */
  readonly visible: readonly boolean[];
  readonly rooms: readonly Rect[];
  /** Where the player arrives on this level. */
  readonly spawn: Point;
  /** Location of the down staircase, absent on the final level. */
  readonly stairsDown?: Point;
};

export function tileAt(map: DungeonMap, p: Point): TileType {
  if (!inBounds(p, map.width, map.height)) {
    return "wall";
  }
  return map.tiles[toIndex(p, map.width)] ?? "wall";
}

export function isWalkableAt(map: DungeonMap, p: Point): boolean {
  return inBounds(p, map.width, map.height) && isWalkable(tileAt(map, p));
}

export function isOpaqueAt(map: DungeonMap, p: Point): boolean {
  return !inBounds(p, map.width, map.height) || isOpaque(tileAt(map, p));
}

export function isVisibleAt(map: DungeonMap, p: Point): boolean {
  return inBounds(p, map.width, map.height) && (map.visible[toIndex(p, map.width)] ?? false);
}

export function isExploredAt(map: DungeonMap, p: Point): boolean {
  return inBounds(p, map.width, map.height) && (map.explored[toIndex(p, map.width)] ?? false);
}

/**
 * Flood fill over walkable tiles from a start point.
 * Returns the set of reachable indices (8-way movement).
 */
export function floodFill(map: DungeonMap, start: Point): Set<number> {
  const reached = new Set<number>();
  if (!isWalkableAt(map, start)) {
    return reached;
  }
  const stack: Point[] = [start];
  reached.add(toIndex(start, map.width));
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) {
      break;
    }
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) {
          continue;
        }
        const next = { x: current.x + dx, y: current.y + dy };
        if (!isWalkableAt(map, next)) {
          continue;
        }
        const index = toIndex(next, map.width);
        if (!reached.has(index)) {
          reached.add(index);
          stack.push(next);
        }
      }
    }
  }
  return reached;
}

/** Every walkable tile is reachable from `start`. */
export function isFullyConnected(map: DungeonMap, start: Point): boolean {
  const reached = floodFill(map, start);
  let walkableCount = 0;
  for (const tile of map.tiles) {
    if (isWalkable(tile)) {
      walkableCount++;
    }
  }
  return reached.size === walkableCount;
}
