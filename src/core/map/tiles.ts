/**
 * Tile definitions. A tile is identified by its TileType; everything the
 * game needs to know about a tile (passability, opacity, glyph) is looked
 * up in TILES.
 */

export type TileType = "wall" | "floor" | "stairs-down";

export type TileDef = {
  readonly type: TileType;
  readonly glyph: string;
  readonly walkable: boolean;
  readonly opaque: boolean;
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
};

export function isWalkable(tile: TileType): boolean {
  return TILES[tile].walkable;
}

export function isOpaque(tile: TileType): boolean {
  return TILES[tile].opaque;
}
