/**
 * Level construction: generate a map and populate it with monsters
 * appropriate to the depth. Spawn tables live in data/monsters.ts.
 */

import { type Point, pointKey, rectCenter } from "./grid";
import { generateMap } from "./map/generate";
import { BOSS_ID, MONSTERS, MONSTER_LIST, type MonsterDef } from "./data/monsters";
import { type RngState, nextInt, pickWeighted } from "./rng";
import type { DungeonMap, Entity } from "./index";

export const FINAL_DEPTH = 9;

export type LevelResult = {
  readonly map: DungeonMap;
  readonly monsters: readonly Omit<Entity, "id">[];
  readonly rng: RngState;
};

export function monsterFromDef(def: MonsterDef, position: Point): Omit<Entity, "id"> {
  return {
    kind: "monster",
    name: def.name,
    glyph: def.glyph,
    color: def.color,
    position,
    blocksMovement: true,
    health: { current: def.health, max: def.health },
    attack: { min: def.attackMin, max: def.attackMax, accuracy: def.accuracy },
    defence: def.defence,
    ai: { behaviour: def.behaviour },
    sightRadius: def.sightRadius,
    xpValue: def.xpValue,
    ...(def.ranged !== undefined ? { rangedAttack: def.ranged } : {}),
    ...(def.fleeThreshold !== undefined ? { fleeThreshold: def.fleeThreshold } : {}),
    ...(def.preferredRange !== undefined ? { preferredRange: def.preferredRange } : {}),
    ...(def.erraticChance !== undefined ? { erraticChance: def.erraticChance } : {}),
    ...(def.id === BOSS_ID ? { isBoss: true } : {}),
  };
}

/** Monsters eligible for random spawning at a depth, as a weighted table. */
export function spawnTableForDepth(depth: number): readonly MonsterDef[] {
  return MONSTER_LIST.filter((m) => m.weight > 0 && depth >= m.minDepth && depth <= m.maxDepth);
}

/** Number of monsters to place on a level, growing with depth. */
export function monsterCountForDepth(depth: number): {
  readonly min: number;
  readonly max: number;
} {
  return { min: 4 + depth, max: 7 + depth * 2 };
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

export function createLevel(rng: RngState, depth: number): LevelResult {
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

  const table = spawnTableForDepth(depth);
  const monsters: Omit<Entity, "id">[] = [];

  // The boss guards the room farthest from the entrance on the final level.
  if (depth >= FINAL_DEPTH) {
    const lair = farthestRoomCenter(map);
    if (lair !== null) {
      taken.add(pointKey(lair));
      monsters.push(monsterFromDef(MONSTERS[BOSS_ID], lair));
    }
  }
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
      monsters.push(monsterFromDef(def.value, spot.position));
    }
  }

  return { map, monsters, rng: state };
}
