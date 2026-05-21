/**
 * Level construction: generate a map and populate it with monsters and
 * items appropriate to the depth. Spawn tables live in data/.
 */

import { ITEM_LIST, type ItemDef } from "./data/items";
import { BOSS_ID, MONSTERS, MONSTER_LIST, type MonsterDef } from "./data/monsters";
import { TRAP_LIST, type TrapDef } from "./data/traps";
import {
  DIRECTIONS_8,
  type Point,
  addPoints,
  chebyshevDistance,
  fromIndex,
  pointKey,
  rectCenter,
} from "./grid";
import { farthestFloor, generateCavern } from "./map/cavern";
import { type DungeonMap, isWalkableAt } from "./map/dungeon";
import { generateMap } from "./map/generate";
import { type RngState, chance, nextInt, pickWeighted } from "./rng";
import { trapEntityFromDef } from "./systems/traps";
import type { Entity } from "./types";

export const FINAL_DEPTH = 9;

/** Chance that a level between the first and the last is a cavern rather than rooms. */
export const CAVERN_CHANCE = 0.35;

export type LevelResult = {
  readonly map: DungeonMap;
  readonly monsters: readonly Omit<Entity, "id">[];
  readonly items: readonly Omit<Entity, "id">[];
  readonly traps: readonly Omit<Entity, "id">[];
  readonly rng: RngState;
  /** Item id counter after placement. */
  readonly nextItemId: number;
};

/**
 * Extra health and damage a monster gains for appearing deeper than the
 * shallowest level it can spawn on. Keeps early monsters relevant later.
 */
export function depthScaling(
  def: MonsterDef,
  depth: number,
): { readonly health: number; readonly damage: number } {
  const extra = Math.max(0, depth - def.minDepth);
  return { health: extra, damage: Math.floor(extra / 3) };
}

export function monsterFromDef(
  def: MonsterDef,
  position: Point,
  depth = def.minDepth,
): Omit<Entity, "id"> {
  const scaling = depthScaling(def, depth);
  const health = def.health + scaling.health;
  return {
    kind: "monster",
    name: def.name,
    glyph: def.glyph,
    color: def.color,
    position,
    blocksMovement: true,
    health: { current: health, max: health },
    attack: {
      min: def.attackMin + scaling.damage,
      max: def.attackMax + scaling.damage,
      accuracy: def.accuracy,
    },
    defence: def.defence,
    ai: { behaviour: def.behaviour },
    sightRadius: def.sightRadius,
    xpValue: def.xpValue,
    ...(def.ranged !== undefined ? { rangedAttack: def.ranged } : {}),
    ...(def.fleeThreshold !== undefined ? { fleeThreshold: def.fleeThreshold } : {}),
    ...(def.preferredRange !== undefined ? { preferredRange: def.preferredRange } : {}),
    ...(def.erraticChance !== undefined ? { erraticChance: def.erraticChance } : {}),
    ...(def.onHit !== undefined ? { onHit: def.onHit } : {}),
    ...(def.drop !== undefined ? { drop: def.drop } : {}),
    ...(def.id === BOSS_ID ? { isBoss: true } : {}),
  };
}

export function itemEntityFromDef(
  def: ItemDef,
  itemId: number,
  position: Point,
): Omit<Entity, "id"> {
  return {
    kind: "item",
    name: def.name,
    glyph: def.glyph,
    color: def.color,
    position,
    blocksMovement: false,
    item: { id: itemId, defId: def.id },
  };
}

/** Monsters eligible for random spawning at a depth, as a weighted table. */
export function spawnTableForDepth(depth: number): readonly MonsterDef[] {
  return MONSTER_LIST.filter((m) => m.weight > 0 && depth >= m.minDepth && depth <= m.maxDepth);
}

/** Items eligible for random placement at a depth, as a weighted table. */
export function itemTableForDepth(depth: number): readonly ItemDef[] {
  return ITEM_LIST.filter((i) => i.weight > 0 && depth >= i.minDepth && depth <= i.maxDepth);
}

/** Number of monsters to place on a level, growing with depth. */
export function monsterCountForDepth(depth: number): {
  readonly min: number;
  readonly max: number;
} {
  return { min: 3 + Math.floor(depth / 2), max: 5 + depth };
}

/** Traps eligible at a depth, as a weighted table. */
export function trapTableForDepth(depth: number): readonly TrapDef[] {
  return TRAP_LIST.filter((t) => t.weight > 0 && depth >= t.minDepth);
}

/** Number of traps to place on a level, growing with depth. */
export function trapCountForDepth(depth: number): { readonly min: number; readonly max: number } {
  return { min: Math.floor(depth / 2), max: 1 + Math.floor(depth / 2) };
}

/** Number of items to place on a level. */
export function itemCountForDepth(depth: number): { readonly min: number; readonly max: number } {
  return { min: 4, max: 6 + Math.floor(depth / 2) };
}

/** How far from the entrance things are placed on a cavern level, which has no rooms to exclude. */
const CAVERN_ENTRANCE_CLEARANCE = 8;

/**
 * Pick a random free floor tile: inside a room on a room level, anywhere
 * on a cavern. `avoidEntrance` keeps monsters out of the entrance room, or
 * on caverns a few tiles away from the entrance.
 */
function randomRoomTile(
  rng: RngState,
  map: DungeonMap,
  taken: ReadonlySet<string>,
  avoidEntrance: boolean,
): { readonly rng: RngState; readonly position: Point | null } {
  let state = rng;
  const excludeRoomIndex = avoidEntrance ? spawnRoomIndex(map) : -1;
  if (map.rooms.length === 0) {
    for (let attempt = 0; attempt < 60; attempt++) {
      const roll = nextInt(state, 0, map.tiles.length - 1);
      state = roll.rng;
      const position = fromIndex(roll.value, map.width);
      if (map.tiles[roll.value] !== "floor" || taken.has(pointKey(position))) {
        continue;
      }
      if (avoidEntrance && chebyshevDistance(position, map.spawn) < CAVERN_ENTRANCE_CLEARANCE) {
        continue;
      }
      return { rng: state, position };
    }
    return { rng: state, position: null };
  }
  for (let attempt = 0; attempt < 30; attempt++) {
    const roomPick = nextInt(state, 0, map.rooms.length - 1);
    state = roomPick.rng;
    if (roomPick.value === excludeRoomIndex) {
      continue;
    }
    const room = map.rooms[roomPick.value];
    if (room === undefined) {
      continue;
    }
    const xPick = nextInt(state, room.x, room.x + room.width - 1);
    const yPick = nextInt(xPick.rng, room.y, room.y + room.height - 1);
    state = yPick.rng;
    const position = { x: xPick.value, y: yPick.value };
    const index = position.y * map.width + position.x;
    if (map.tiles[index] !== "floor" || taken.has(pointKey(position))) {
      continue;
    }
    return { rng: state, position };
  }
  return { rng: state, position: null };
}

/** Index of the room the player arrives in, or -1 on a cavern. */
function spawnRoomIndex(map: DungeonMap): number {
  return map.rooms.findIndex((r) => {
    const c = rectCenter(r);
    return c.x === map.spawn.x && c.y === map.spawn.y;
  });
}

/** Where the boss waits: the farthest room's centre, or the farthest cave tile. */
function farthestRoomCenter(map: DungeonMap): Point | null {
  if (map.rooms.length === 0) {
    return farthestFloor(map, map.spawn);
  }
  let best: Point | null = null;
  let bestDistance = -1;
  for (const room of map.rooms) {
    const c = rectCenter(room);
    const d = Math.max(Math.abs(c.x - map.spawn.x), Math.abs(c.y - map.spawn.y));
    if (d > bestDistance) {
      bestDistance = d;
      best = c;
    }
  }
  return best;
}

/** Whether the level at `depth` is a cavern. The first and last levels are always rooms. */
export function rollCavern(
  rng: RngState,
  depth: number,
): { readonly rng: RngState; readonly cavern: boolean } {
  if (depth <= 1 || depth >= FINAL_DEPTH) {
    return { rng, cavern: false };
  }
  const roll = chance(rng, CAVERN_CHANCE);
  return { rng: roll.rng, cavern: roll.value };
}

export function createLevel(rng: RngState, depth: number, firstItemId = 1): LevelResult {
  const style = rollCavern(rng, depth);
  const withStairsDown = depth < FINAL_DEPTH;
  const generated = style.cavern
    ? generateCavern(style.rng, { withStairsDown })
    : generateMap(style.rng, { withStairsDown });
  const map = generated.map;
  let state = generated.rng;

  const taken = new Set<string>([pointKey(map.spawn)]);
  if (map.stairsDown !== undefined) {
    taken.add(pointKey(map.stairsDown));
  }
  const monsters: Omit<Entity, "id">[] = [];

  // The boss guards the room farthest from the entrance on the final level.
  if (depth >= FINAL_DEPTH) {
    const lair = farthestRoomCenter(map);
    if (lair !== null) {
      taken.add(pointKey(lair));
      monsters.push(monsterFromDef(MONSTERS[BOSS_ID], lair));
    }
  }

  // Guardians stand beside the stairs.
  const stairs = map.stairsDown;
  if (stairs !== undefined) {
    for (const def of MONSTER_LIST) {
      if (def.guardsStairs !== true || depth < def.minDepth || depth > def.maxDepth) {
        continue;
      }
      const post = DIRECTIONS_8.map((d) => addPoints(stairs, d)).find(
        (p) => isWalkableAt(map, p) && !taken.has(pointKey(p)),
      );
      if (post !== undefined) {
        taken.add(pointKey(post));
        monsters.push(monsterFromDef(def, post, depth));
      }
    }
  }

  const table = spawnTableForDepth(depth);
  if (table.length > 0) {
    const range = monsterCountForDepth(depth);
    const count = nextInt(state, range.min, range.max);
    state = count.rng;
    for (let i = 0; i < count.value; i++) {
      const spot = randomRoomTile(state, map, taken, true);
      state = spot.rng;
      if (spot.position === null) {
        continue;
      }
      const def = pickWeighted(state, table);
      state = def.rng;
      taken.add(pointKey(spot.position));
      monsters.push(monsterFromDef(def.value, spot.position, depth));
    }
  }

  // Items may share a room with monsters but never a tile with anything else.
  const items: Omit<Entity, "id">[] = [];
  let nextItemId = firstItemId;
  const itemTable = itemTableForDepth(depth);
  if (itemTable.length > 0) {
    const range = itemCountForDepth(depth);
    const count = nextInt(state, range.min, range.max);
    state = count.rng;
    for (let i = 0; i < count.value; i++) {
      const spot = randomRoomTile(state, map, taken, false);
      state = spot.rng;
      if (spot.position === null) {
        continue;
      }
      const def = pickWeighted(state, itemTable);
      state = def.rng;
      taken.add(pointKey(spot.position));
      items.push(itemEntityFromDef(def.value, nextItemId, spot.position));
      nextItemId++;
    }
  }

  // Traps never share a tile with anything and never sit in the entrance room.
  const traps: Omit<Entity, "id">[] = [];
  const trapTable = trapTableForDepth(depth);
  if (trapTable.length > 0) {
    const range = trapCountForDepth(depth);
    const count = nextInt(state, range.min, range.max);
    state = count.rng;
    for (let i = 0; i < count.value; i++) {
      const spot = randomRoomTile(state, map, taken, true);
      state = spot.rng;
      if (spot.position === null) {
        continue;
      }
      const def = pickWeighted(state, trapTable);
      state = def.rng;
      taken.add(pointKey(spot.position));
      traps.push(trapEntityFromDef(def.value, spot.position));
    }
  }

  return { map, monsters, items, traps, rng: state, nextItemId };
}
