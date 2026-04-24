/**
 * Level construction: generate a map and populate it with monsters and
 * items appropriate to the depth. Spawn tables live in data/.
 */

import { ITEM_LIST, type ItemDef } from "./data/items";
import { BOSS_ID, MONSTERS, MONSTER_LIST, type MonsterDef } from "./data/monsters";
import { TRAP_LIST, type TrapDef } from "./data/traps";
import { type Point, pointKey, rectCenter } from "./grid";
import type { DungeonMap } from "./map/dungeon";
import { generateMap } from "./map/generate";
import { type RngState, nextInt, pickWeighted } from "./rng";
import { trapEntityFromDef } from "./systems/traps";
import type { Entity } from "./types";

export const FINAL_DEPTH = 9;

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

/** Pick a random floor tile inside a room that is not already taken. */
function randomRoomTile(
  rng: RngState,
  map: DungeonMap,
  taken: ReadonlySet<string>,
  excludeRoomIndex: number,
): { readonly rng: RngState; readonly position: Point | null } {
  let state = rng;
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

function farthestRoomCenter(map: DungeonMap): Point | null {
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

export function createLevel(rng: RngState, depth: number, firstItemId = 1): LevelResult {
  const generated = generateMap(rng, { withStairsDown: depth < FINAL_DEPTH });
  const map = generated.map;
  let state = generated.rng;

  const taken = new Set<string>([pointKey(map.spawn)]);
  if (map.stairsDown !== undefined) {
    taken.add(pointKey(map.stairsDown));
  }
  const spawnRoomIndex = map.rooms.findIndex((r) => {
    const c = rectCenter(r);
    return c.x === map.spawn.x && c.y === map.spawn.y;
  });

  const monsters: Omit<Entity, "id">[] = [];

  // The boss guards the room farthest from the entrance on the final level.
  if (depth >= FINAL_DEPTH) {
    const lair = farthestRoomCenter(map);
    if (lair !== null) {
      taken.add(pointKey(lair));
      monsters.push(monsterFromDef(MONSTERS[BOSS_ID], lair));
    }
  }

  const table = spawnTableForDepth(depth);
  if (table.length > 0) {
    const range = monsterCountForDepth(depth);
    const count = nextInt(state, range.min, range.max);
    state = count.rng;
    for (let i = 0; i < count.value; i++) {
      const spot = randomRoomTile(state, map, taken, spawnRoomIndex);
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
      const spot = randomRoomTile(state, map, taken, -1);
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
      const spot = randomRoomTile(state, map, taken, spawnRoomIndex);
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
