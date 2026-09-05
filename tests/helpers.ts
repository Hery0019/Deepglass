/**
 * Test helpers: build small maps from string art so FOV and pathfinding can
 * be checked against hand-verified expectations.
 *
 * Legend: '#' wall, '.' floor, '>' stairs down, '@' player start (floor).
 */

import type { Point } from "../src/core/grid";
import type { DungeonMap } from "../src/core/map/dungeon";
import type { TileType } from "../src/core/map/tiles";

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
