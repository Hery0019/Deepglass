/**
 * Canvas renderer. Reads a GameState and draws it as ASCII glyphs.
 * This module never mutates the state.
 */

import type { GameState, Point } from "../core/index";
import { TILES, getPlayer, isExploredAt, isVisibleAt, tileAt } from "../core/index";
import { PALETTE } from "./palette";

export type RenderMetrics = {
  readonly cellWidth: number;
  readonly cellHeight: number;
  readonly fontSize: number;
  /** Rows reserved below the map for the HUD (status bar and message log). */
  readonly hudRows: number;
};

export type Renderer = {
  readonly metrics: RenderMetrics;
  readonly context: CanvasRenderingContext2D;
  /** Screen size in cells: the whole canvas, and the part above the HUD. */
  readonly columns: number;
  readonly rows: number;
  readonly mapRows: number;
  /** Grid cell shown in the top-left corner of the map area; updated by `render`. */
  readonly camera: { x: number; y: number };
};

export const HUD_ROWS = 7;

export function createRenderer(
  canvas: HTMLCanvasElement,
  columns: number,
  mapRows: number,
  cellWidth: number,
  cellHeight: number,
): Renderer {
  const rows = mapRows + HUD_ROWS;
  canvas.width = columns * cellWidth;
  canvas.height = rows * cellHeight;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("Could not acquire a 2D rendering context.");
  }
  return {
    context,
    columns,
    rows,
    mapRows,
    camera: { x: 0, y: 0 },
    metrics: {
      cellWidth,
      cellHeight,
      fontSize: Math.floor(cellHeight * 0.85),
      hudRows: HUD_ROWS,
    },
  };
}

function setFont(renderer: Renderer): void {
  renderer.context.font = `${String(renderer.metrics.fontSize)}px "DejaVu Sans Mono", Menlo, Consolas, monospace`;
  renderer.context.textBaseline = "middle";
  renderer.context.textAlign = "center";
}

/** Screen cell showing grid point `p`; may lie outside the map area when `p` is off screen. */
export function toScreen(renderer: Renderer, p: Point): Point {
  return { x: p.x - renderer.camera.x, y: p.y - renderer.camera.y };
}

/** Grid point shown at screen cell `s`. */
export function toGrid(renderer: Renderer, s: Point): Point {
  return { x: s.x + renderer.camera.x, y: s.y + renderer.camera.y };
}

/** Whether a screen cell lies inside the map area. */
export function onMapScreen(renderer: Renderer, s: Point): boolean {
  return s.x >= 0 && s.y >= 0 && s.x < renderer.columns && s.y < renderer.mapRows;
}

/** Draw a single glyph in screen cell (col, row). */
export function drawGlyph(
  renderer: Renderer,
  col: number,
  row: number,
  glyph: string,
  color: string,
): void {
  const { cellWidth, cellHeight } = renderer.metrics;
  renderer.context.fillStyle = color;
  renderer.context.fillText(
    glyph,
    col * cellWidth + cellWidth / 2,
    row * cellHeight + cellHeight / 2,
  );
}

/** Draw a left-aligned string starting at grid cell (col, row), clipped to `maxCols`. */
export function drawText(
  renderer: Renderer,
  col: number,
  row: number,
  text: string,
  color: string,
  maxCols: number = renderer.columns - col,
): void {
  const clipped = text.length > maxCols ? text.slice(0, maxCols) : text;
  for (let i = 0; i < clipped.length; i++) {
    const ch = clipped[i];
    if (ch !== undefined && ch !== " ") {
      drawGlyph(renderer, col + i, row, ch, color);
    }
  }
}

function clear(renderer: Renderer): void {
  const { context } = renderer;
  context.fillStyle = PALETTE.background;
  context.fillRect(0, 0, context.canvas.width, context.canvas.height);
}

function tileColor(type: keyof typeof TILES, visible: boolean): string {
  switch (type) {
    case "wall":
      return visible ? PALETTE.wallVisible : PALETTE.wallExplored;
    case "floor":
      return visible ? PALETTE.floorVisible : PALETTE.floorExplored;
    case "stairs-down":
      return visible ? PALETTE.stairs : PALETTE.stairsExplored;
    case "door-closed":
    case "door-open":
      return visible ? PALETTE.door : PALETTE.doorExplored;
  }
}

/** Keep the player centred when the map is larger than the screen, without showing beyond its edges. */
function aimCamera(renderer: Renderer, state: GameState): void {
  const { map } = state;
  const player = getPlayer(state);
  const clamp = (value: number, max: number): number => Math.max(0, Math.min(max, value));
  renderer.camera.x = clamp(
    player.position.x - Math.floor(renderer.columns / 2),
    map.width - renderer.columns,
  );
  renderer.camera.y = clamp(
    player.position.y - Math.floor(renderer.mapRows / 2),
    map.height - renderer.mapRows,
  );
}

function drawMap(renderer: Renderer, state: GameState): void {
  const { map } = state;
  for (let sy = 0; sy < renderer.mapRows; sy++) {
    for (let sx = 0; sx < renderer.columns; sx++) {
      const p = toGrid(renderer, { x: sx, y: sy });
      if (p.x >= map.width || p.y >= map.height) {
        continue;
      }
      const visible = isVisibleAt(map, p);
      if (!visible && !isExploredAt(map, p)) {
        continue;
      }
      const type = tileAt(map, p);
      drawGlyph(renderer, sx, sy, TILES[type].glyph, tileColor(type, visible));
    }
  }
}

function drawEntities(renderer: Renderer, state: GameState): void {
  // Traps, then items, then monsters, then the player so the player is always on top.
  const order: Record<string, number> = { trap: 0, item: 1, monster: 2, player: 3 };
  const sorted = [...state.entities].sort((a, b) => (order[a.kind] ?? 0) - (order[b.kind] ?? 0));
  for (const entity of sorted) {
    if (entity.trap?.hidden === true) {
      continue;
    }
    // Known traps stay drawn on remembered tiles; creatures and items only while in view.
    const shown =
      entity.kind === "trap"
        ? isExploredAt(state.map, entity.position)
        : isVisibleAt(state.map, entity.position);
    if (!shown) {
      continue;
    }
    const s = toScreen(renderer, entity.position);
    if (!onMapScreen(renderer, s)) {
      continue;
    }
    drawGlyph(renderer, s.x, s.y, entity.glyph, entity.color);
  }
}

/** Draw the full frame: map, entities, then any overlay supplied by the UI layer. */
export function render(
  renderer: Renderer,
  state: GameState,
  drawOverlay: (renderer: Renderer, state: GameState) => void,
): void {
  clear(renderer);
  setFont(renderer);
  aimCamera(renderer, state);
  drawMap(renderer, state);
  drawEntities(renderer, state);
  drawOverlay(renderer, state);
}
