/**
 * Automatic movement helpers: exploring toward unseen tiles, travelling to
 * a known destination, and the rules for when such a run must stop.
 *
 * Everything here reads the player's knowledge only (explored tiles and
 * visible monsters), so an automatic run never acts on information the
 * player could not see.
 */

import { blockingEntityAt, entitiesAt, getPlayer } from "../entity";
import {
  DIRECTIONS_8,
  type Point,
  addPoints,
  fromIndex,
  inBounds,
  pointsEqual,
  toIndex,
} from "../grid";
import { type DungeonMap, isExploredAt, isPassableAt, isVisibleAt } from "../map/dungeon";
import type { Action, Entity, GameState, TurnResult } from "../types";
import { findPath } from "./pathfinding";
import { hasStatus } from "./status";
import { isKnownTrapAt } from "./traps";

/** Monsters currently inside the player's field of view. */
export function visibleMonsters(state: GameState): Entity[] {
  return state.entities.filter((e) => e.kind === "monster" && isVisibleAt(state.map, e.position));
}

/** The player is standing on the down staircase. */
export function isOnStairs(state: GameState): boolean {
  const stairs = state.map.stairsDown;
  return stairs !== undefined && pointsEqual(getPlayer(state).position, stairs);
}

/** The player has seen the down staircase at some point on this level. */
export function stairsKnown(state: GameState): boolean {
  const stairs = state.map.stairsDown;
  return stairs !== undefined && isExploredAt(state.map, stairs);
}

/** An explored, passable tile with at least one unexplored neighbour. */
export function isFrontier(map: DungeonMap, p: Point): boolean {
  if (!isExploredAt(map, p) || !isPassableAt(map, p)) {
    return false;
  }
  for (const d of DIRECTIONS_8) {
    const n = addPoints(p, d);
    if (inBounds(n, map.width, map.height) && !isExploredAt(map, n)) {
      return true;
    }
  }
  return false;
}

/**
 * Tiles the player may plan a route through: seen, floor or door, free of
 * known traps, and not held by a visible monster.
 */
export function knownPassable(state: GameState): (p: Point) => boolean {
  return (p) => {
    if (!isExploredAt(state.map, p) || !isPassableAt(state.map, p) || isKnownTrapAt(state, p)) {
      return false;
    }
    const blocker = blockingEntityAt(state, p);
    return blocker === undefined || !isVisibleAt(state.map, blocker.position);
  };
}

export type AutoStep = {
  readonly direction: Point;
  readonly target: Point;
};

/**
 * First step toward the nearest frontier tile, by breadth-first search over
 * known tiles. Returns null when nothing reachable is left to explore.
 */
export function exploreStep(state: GameState): AutoStep | null {
  const { map } = state;
  const start = getPlayer(state).position;
  const passable = knownPassable(state);
  const startIndex = toIndex(start, map.width);
  const parent = new Map<number, number>([[startIndex, -1]]);
  const queue: number[] = [startIndex];
  let head = 0;
  while (head < queue.length) {
    const index = queue[head] ?? startIndex;
    head++;
    const p = fromIndex(index, map.width);
    if (index !== startIndex && isFrontier(map, p)) {
      let current = index;
      let previous = parent.get(current) ?? -1;
      while (previous !== startIndex && previous !== -1) {
        current = previous;
        previous = parent.get(current) ?? -1;
      }
      const first = fromIndex(current, map.width);
      return { direction: { x: first.x - start.x, y: first.y - start.y }, target: p };
    }
    for (const d of DIRECTIONS_8) {
      const n = addPoints(p, d);
      if (!inBounds(n, map.width, map.height) || !passable(n)) {
        continue;
      }
      const nIndex = toIndex(n, map.width);
      if (!parent.has(nIndex)) {
        parent.set(nIndex, index);
        queue.push(nIndex);
      }
    }
  }
  return null;
}

/** First step of a route through known tiles to `goal`, or null when no such route exists. */
export function travelStep(state: GameState, goal: Point): AutoStep | null {
  const start = getPlayer(state).position;
  if (pointsEqual(start, goal)) {
    return null;
  }
  // The destination itself must be a known floor tile; a route may end on a monster, a wall may not.
  if (!isExploredAt(state.map, goal) || !isPassableAt(state.map, goal)) {
    return null;
  }
  const path = findPath(start, goal, knownPassable(state), {
    width: state.map.width,
    height: state.map.height,
    maxExpansions: state.map.width * state.map.height,
  });
  const first = path?.[0];
  if (first === undefined) {
    return null;
  }
  return { direction: { x: first.x - start.x, y: first.y - start.y }, target: goal };
}

/** Whether a multi-turn automatic action should keep going after one step of it. */
export function autoContinues(action: Action, before: GameState, result: TurnResult): boolean {
  const { state, events } = result;
  if (state.status !== "playing") {
    return false;
  }
  // Opening a door on the way is part of the walk; anything else is worth stopping for.
  if (events.some((e) => e.type !== "entity-moved" && e.type !== "door-opened")) {
    return false;
  }
  if (visibleMonsters(state).length > 0) {
    return false;
  }
  const player = getPlayer(state);
  const previous = getPlayer(before);
  if ((player.health?.current ?? 0) < (previous.health?.current ?? 0)) {
    return false;
  }
  switch (action.type) {
    case "rest":
      return (
        (player.health?.current ?? 0) < (player.health?.max ?? 0) && !hasStatus(player, "poison")
      );
    case "explore":
    case "travel-to-stairs":
    case "travel":
      // Stop on anything worth a look: an item underfoot, or the destination reached.
      if (entitiesAt(state, player.position).some((e) => e.kind === "item")) {
        return false;
      }
      if (action.type === "explore") {
        return exploreStep(state) !== null;
      }
      if (action.type === "travel") {
        return !pointsEqual(player.position, action.goal);
      }
      return !isOnStairs(state);
    case "move":
    case "wait":
    case "descend":
    case "pick-up":
    case "use-item":
    case "drop-item":
    case "fire":
      return false;
  }
}
