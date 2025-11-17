/**
 * Canvas renderer. Reads a GameState and draws it as ASCII glyphs.
 * This module never mutates the state.
 */

import type { GameState } from "../core/index";
import { TILES, isExploredAt, isVisibleAt, tileAt } from "../core/index";
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
  readonly columns: number;
  readonly rows: number;
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

/** Draw a single glyph in grid cell (col, row). */
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
  }
}

function drawMap(renderer: Renderer, state: GameState): void {
  const { map } = state;
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const p = { x, y };
      const visible = isVisibleAt(map, p);
      if (!visible && !isExploredAt(map, p)) {
        continue;
      }
      const type = tileAt(map, p);
      drawGlyph(renderer, x, y, TILES[type].glyph, tileColor(type, visible));
    }
  }
}

function drawEntities(renderer: Renderer, state: GameState): void {
  // Items first, then monsters, then the player so the player is always on top.
  const order: Record<string, number> = { item: 0, monster: 1, player: 2 };
  const sorted = [...state.entities].sort((a, b) => (order[a.kind] ?? 0) - (order[b.kind] ?? 0));
  for (const entity of sorted) {
    if (!isVisibleAt(state.map, entity.position)) {
      continue;
    }
    drawGlyph(renderer, entity.position.x, entity.position.y, entity.glyph, entity.color);
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
  drawMap(renderer, state);
  drawEntities(renderer, state);
  drawOverlay(renderer, state);
}
