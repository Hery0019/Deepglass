/**
 * Shared drawing helpers for full-screen overlays (inventory, help, end screens).
 */

import { PALETTE } from "../render/palette";
import { type Renderer, drawGlyph, drawText } from "../render/renderer";

export type Box = {
  readonly col: number;
  readonly row: number;
  readonly width: number;
  readonly height: number;
};

/** A centred box of the given size, in grid cells. */
export function centredBox(renderer: Renderer, width: number, height: number): Box {
  return {
    col: Math.max(0, Math.floor((renderer.columns - width) / 2)),
    row: Math.max(0, Math.floor((renderer.rows - height) / 2)),
    width,
    height,
  };
}

/** Fill a box with the background colour and draw a single-line frame around it. */
export function drawFrame(renderer: Renderer, box: Box, title?: string): void {
  const { cellWidth, cellHeight } = renderer.metrics;
  renderer.context.fillStyle = PALETTE.background;
  renderer.context.fillRect(
    box.col * cellWidth,
    box.row * cellHeight,
    box.width * cellWidth,
    box.height * cellHeight,
  );
  const right = box.col + box.width - 1;
  const bottom = box.row + box.height - 1;
  for (let c = box.col + 1; c < right; c++) {
    drawGlyph(renderer, c, box.row, "─", PALETTE.hudFrame);
    drawGlyph(renderer, c, bottom, "─", PALETTE.hudFrame);
  }
  for (let r = box.row + 1; r < bottom; r++) {
    drawGlyph(renderer, box.col, r, "│", PALETTE.hudFrame);
    drawGlyph(renderer, right, r, "│", PALETTE.hudFrame);
  }
  drawGlyph(renderer, box.col, box.row, "┌", PALETTE.hudFrame);
  drawGlyph(renderer, right, box.row, "┐", PALETTE.hudFrame);
  drawGlyph(renderer, box.col, bottom, "└", PALETTE.hudFrame);
  drawGlyph(renderer, right, bottom, "┘", PALETTE.hudFrame);
  if (title !== undefined) {
    drawText(renderer, box.col + 2, box.row, ` ${title} `, PALETTE.hudText);
  }
}
