/**
 * Message history overlay: the full log, newest at the bottom, scrollable.
 * Reads state only.
 */

import type { GameState, LogTone } from "../core/index";
import { PALETTE } from "../render/palette";
import { type Renderer, drawText } from "../render/renderer";
import { centredBox, drawFrame } from "./overlay";

const BOX_WIDTH = 78;
const BOX_HEIGHT = 40;
/** Rows inside the frame available for entries. */
export const HISTORY_ROWS = BOX_HEIGHT - 4;

function toneColor(tone: LogTone): string {
  switch (tone) {
    case "info":
      return PALETTE.logInfo;
    case "combat":
      return PALETTE.logCombat;
    case "good":
      return PALETTE.logGood;
    case "bad":
      return PALETTE.logBad;
    case "system":
      return PALETTE.logSystem;
  }
}

/** Largest scroll offset that still shows a full page, given the log length. */
export function maxHistoryOffset(state: GameState): number {
  return Math.max(0, state.log.length - HISTORY_ROWS);
}

/** Draw the log; `offset` is how many entries back from the newest the view is scrolled. */
export function drawMessageHistory(renderer: Renderer, state: GameState, offset: number): void {
  const box = centredBox(renderer, BOX_WIDTH, BOX_HEIGHT);
  drawFrame(renderer, box, "Messages");
  const left = box.col + 2;
  const end = Math.max(0, state.log.length - offset);
  const start = Math.max(0, end - HISTORY_ROWS);
  const entries = state.log.slice(start, end);
  const firstRow = box.row + 2 + (HISTORY_ROWS - entries.length);
  entries.forEach((entry, i) => {
    const turn = `T${String(entry.turn)}`.padEnd(6);
    drawText(renderer, left, firstRow + i, turn, PALETTE.hudDim);
    drawText(renderer, left + 6, firstRow + i, entry.text, toneColor(entry.tone), box.width - 9);
  });
  const hint =
    offset > 0
      ? `Up / Down to scroll (${String(offset)} newer below), Esc to close.`
      : "Up / Down to scroll, Esc to close.";
  drawText(renderer, left, box.row + box.height - 2, hint, PALETTE.hudDim);
}
