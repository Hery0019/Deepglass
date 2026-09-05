/**
 * Field of view: recursive shadowcasting over the eight octants.
 *
 * `computeFov` is map-agnostic; it takes an opacity predicate so it can be
 * tested against tiny hand-built grids. `updateVisibility` applies the
 * result to a DungeonMap, producing a new map whose `visible` array is
 * replaced and whose `explored` array is extended.
 */

import { type Point, inBounds, lineBetween, toIndex } from "../grid";
import { type DungeonMap, isOpaqueAt } from "../map/dungeon";

/** Default sight radius for the player. */
export const PLAYER_SIGHT_RADIUS = 8;

/** Octant transforms (xx, xy, yx, yy) for mapping the first octant onto all eight. */
const OCTANTS: readonly (readonly [number, number, number, number])[] = [
  [1, 0, 0, 1],
  [0, 1, 1, 0],
  [0, -1, 1, 0],
  [-1, 0, 0, 1],
  [-1, 0, 0, -1],
  [0, -1, -1, 0],
  [0, 1, -1, 0],
  [1, 0, 0, -1],
];

export type OpacityPredicate = (p: Point) => boolean;

/**
 * Compute the set of visible tile indices from `origin` within `radius`.
 * Out-of-bounds tiles are treated as opaque and never marked visible.
 */
export function computeFov(
  isOpaque: OpacityPredicate,
  origin: Point,
  radius: number,
  width: number,
  height: number,
): Set<number> {
  const visible = new Set<number>();
  if (!inBounds(origin, width, height)) {
    return visible;
  }
  visible.add(toIndex(origin, width));
  const radiusSquared = radius * radius;

  const opaqueOrOutside = (p: Point): boolean => !inBounds(p, width, height) || isOpaque(p);

  function castLight(
    row: number,
    startSlopeInitial: number,
    endSlope: number,
    xx: number,
    xy: number,
    yx: number,
    yy: number,
  ): void {
    let startSlope = startSlopeInitial;
    if (startSlope < endSlope) {
      return;
    }
    let nextStartSlope = startSlope;
    let blocked = false;
    for (let distance = row; distance <= radius && !blocked; distance++) {
      const dy = -distance;
      for (let dx = -distance; dx <= 0; dx++) {
        const current: Point = {
          x: origin.x + dx * xx + dy * xy,
          y: origin.y + dx * yx + dy * yy,
        };
        const leftSlope = (dx - 0.5) / (dy + 0.5);
        const rightSlope = (dx + 0.5) / (dy - 0.5);

        if (startSlope < rightSlope) {
          continue;
        }
        if (endSlope > leftSlope) {
          break;
        }

        const withinRadius = dx * dx + dy * dy <= radiusSquared;
        if (withinRadius && inBounds(current, width, height)) {
          visible.add(toIndex(current, width));
        }

        if (blocked) {
          if (opaqueOrOutside(current)) {
            nextStartSlope = rightSlope;
            continue;
          }
          blocked = false;
          startSlope = nextStartSlope;
        } else if (opaqueOrOutside(current) && distance < radius) {
          blocked = true;
          castLight(distance + 1, startSlope, leftSlope, xx, xy, yx, yy);
          nextStartSlope = rightSlope;
        }
      }
    }
  }

  for (const [xx, xy, yx, yy] of OCTANTS) {
    castLight(1, 1, 0, xx, xy, yx, yy);
  }
  return visible;
}

/** Recompute `visible` from `origin` and merge into `explored`. Returns a new map. */
export function updateVisibility(map: DungeonMap, origin: Point, radius: number): DungeonMap {
  const seen = computeFov((p) => isOpaqueAt(map, p), origin, radius, map.width, map.height);
  const visible = new Array<boolean>(map.width * map.height).fill(false);
  const explored = [...map.explored];
  for (const index of seen) {
    visible[index] = true;
    explored[index] = true;
  }
  return { ...map, visible, explored };
}

/**
 * Straight-line visibility between two tiles: every intermediate tile on the
 * Bresenham line must be transparent. Endpoints may be opaque. Used by
 * monsters, which do not need a full shadowcast.
 */
export function hasLineOfSight(map: DungeonMap, from: Point, to: Point): boolean {
  const line = lineBetween(from, to);
  for (let i = 1; i < line.length - 1; i++) {
    const p = line[i];
    if (p !== undefined && isOpaqueAt(map, p)) {
      return false;
    }
  }
  return true;
}
