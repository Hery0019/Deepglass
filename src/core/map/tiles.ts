/**
 * Tile definitions. A tile is identified by its TileType; everything the
 * game needs to know about a tile (passability, opacity, glyph) is looked
 * up in TILES.
 */

export type TileType = "wall" | "floor" | "stairs-down" | "door-closed" | "door-open";

export type TileDef = {
  readonly type: TileType;
  readonly glyph: string;
  readonly walkable: boolean;
  readonly opaque: boolean;
  /** A closed door: not walkable, but moving into it opens it. */
  readonly openable?: boolean;
  readonly description: string;
};

export const TILES: Readonly<Record<TileType, TileDef>> = {
  wall: {
    type: "wall",
    glyph: "#",
    walkable: false,
    opaque: true,
    description: "a rough stone wall",
  },
  floor: {
    type: "floor",
    glyph: ".",
    walkable: true,
    opaque: false,
    description: "the dungeon floor",
  },
  "stairs-down": {
    type: "stairs-down",
    glyph: ">",
    walkable: true,
    opaque: false,
    description: "a staircase leading down",
  },
  "door-closed": {
    type: "door-closed",
    glyph: "+",
    walkable: false,
    opaque: true,
    openable: true,
    description: "a closed wooden door",
  },
  "door-open": {
    type: "door-open",
    glyph: "'",
    walkable: true,
    opaque: false,
    description: "an open doorway",
  },
};

export function isWalkable(tile: TileType): boolean {
  return TILES[tile].walkable;
}

export function isOpaque(tile: TileType): boolean {
  return TILES[tile].opaque;
}

export function isOpenable(tile: TileType): boolean {
  return TILES[tile].openable === true;
}

/** Walkable now, or a door that a step will open: what routes may pass through. */
export function isPassable(tile: TileType): boolean {
  return TILES[tile].walkable || TILES[tile].openable === true;
}
