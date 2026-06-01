/**
 * Touch toolbar: a row of key buttons drawn over the top border of the map
 * for devices without a keyboard. Each button stands for a key, so tapping
 * one goes through the same key mapping as typing it.
 */

import { PALETTE } from "../render/palette";
import { type Renderer, drawText } from "../render/renderer";

export type ToolbarButton = {
  readonly key: string;
  readonly label: string;
};

export const TOOLBAR: readonly ToolbarButton[] = [
  { key: "i", label: "pack" },
  { key: "g", label: "get" },
  { key: "o", label: "explore" },
  { key: "r", label: "rest" },
  { key: ">", label: "stairs" },
  { key: "f", label: "fire" },
  { key: "x", label: "look" },
  { key: "m", label: "log" },
  { key: "?", label: "help" },
  { key: "Escape", label: "esc" },
];

/** Row the toolbar occupies: the map's top border, which is always solid wall. */
export const TOOLBAR_ROW = 0;

type Placed = ToolbarButton & { readonly col: number; readonly width: number };

function layout(): Placed[] {
  const placed: Placed[] = [];
  let col = 1;
  for (const button of TOOLBAR) {
    const text = ` ${button.label} `;
    placed.push({ ...button, col, width: text.length });
    col += text.length + 1;
  }
  return placed;
}

const LAYOUT = layout();

/** Key of the button under a tap on the toolbar row, or null. */
export function toolbarKeyAt(col: number): string | null {
  const hit = LAYOUT.find((b) => col >= b.col && col < b.col + b.width);
  return hit?.key ?? null;
}

export function drawToolbar(renderer: Renderer): void {
  const { cellWidth, cellHeight } = renderer.metrics;
  for (const button of LAYOUT) {
    renderer.context.fillStyle = PALETTE.hudFrame;
    renderer.context.fillRect(
      button.col * cellWidth,
      TOOLBAR_ROW * cellHeight,
      button.width * cellWidth,
      cellHeight,
    );
    drawText(renderer, button.col + 1, TOOLBAR_ROW, button.label, PALETTE.hudText);
  }
}
