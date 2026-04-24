/**
 * Test helpers: build small maps from string art so FOV and pathfinding can
 * be checked against hand-verified expectations.
 *
 * Legend: '#' wall, '.' floor, '+' closed door, '>' stairs down, '@' player start (floor).
 */

import type { Point } from "../src/core/grid";
import type { DungeonMap } from "../src/core/map/dungeon";
import type { TileType } from "../src/core/map/tiles";
import { seedRng } from "../src/core/rng";
import { createPlayer } from "../src/core/turn";
import type { Entity, GameState } from "../src/core/types";

export type AsciiMap = {
  readonly map: DungeonMap;
  readonly origin: Point;
};

export function mapFromStrings(rows: readonly string[]): AsciiMap {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const tiles: TileType[] = [];
  let origin: Point = { x: 0, y: 0 };
  let stairsDown: Point | undefined;
  rows.forEach((row, y) => {
    if (row.length !== width) {
      throw new Error(
        `row ${String(y)} has length ${String(row.length)}, expected ${String(width)}`,
      );
    }
    for (let x = 0; x < width; x++) {
      const ch = row[x] ?? "?";
      switch (ch) {
        case "#":
          tiles.push("wall");
          break;
        case ".":
          tiles.push("floor");
          break;
        case "+":
          tiles.push("door-closed");
          break;
        case ">":
          tiles.push("stairs-down");
          stairsDown = { x, y };
          break;
        case "@":
          tiles.push("floor");
          origin = { x, y };
          break;
        default:
          throw new Error(`unknown map character '${ch}'`);
      }
    }
  });
  const map: DungeonMap = {
    width,
    height,
    tiles,
    explored: new Array<boolean>(width * height).fill(false),
    visible: new Array<boolean>(width * height).fill(false),
    rooms: [],
    spawn: origin,
    ...(stairsDown !== undefined ? { stairsDown } : {}),
  };
  return { map, origin };
}

/** Render a visibility set as string art: visible tiles keep their glyph, hidden tiles become ' '. */
export function visibilityToStrings(map: DungeonMap, visible: ReadonlySet<number>): string[] {
  const out: string[] = [];
  for (let y = 0; y < map.height; y++) {
    let line = "";
    for (let x = 0; x < map.width; x++) {
      const index = y * map.width + x;
      if (!visible.has(index)) {
        line += " ";
        continue;
      }
      const tile = map.tiles[index];
      line += tile === "wall" ? "#" : tile === "stairs-down" ? ">" : ".";
    }
    out.push(line);
  }
  return out;
}

/**
 * Build a full GameState from string art. The player stands on '@'; extra
 * entities are appended with ids starting at 2, in the order given.
 */
export function stateFromStrings(
  rows: readonly string[],
  extras: readonly Omit<Entity, "id">[] = [],
  seed = 1,
): GameState {
  const { map, origin } = mapFromStrings(rows);
  const player = createPlayer(origin);
  const entities: Entity[] = [player, ...extras.map((e, i) => ({ ...e, id: 2 + i }))];
  return {
    seed,
    rng: seedRng(seed),
    turn: 0,
    depth: 1,
    map,
    entities,
    playerId: player.id,
    nextEntityId: 2 + extras.length,
    nextItemId: 1,
    log: [],
    status: "playing",
    stats: { kills: 0, maxDepth: 1 },
  };
}
