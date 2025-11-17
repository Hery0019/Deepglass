/**
 * Heads-up display: status bar and message log drawn below the map.
 * Reads state only.
 */

import type { GameState, LogTone } from "../core/index";
import { getPlayer } from "../core/index";
import { PALETTE } from "../render/palette";
import { type Renderer, drawText } from "../render/renderer";

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

export function drawHud(renderer: Renderer, state: GameState): void {
  const mapRows = state.map.height;
  const player = getPlayer(state);

  // Status bar.
  const hp = player.health;
  const hpText = hp === undefined ? "" : `HP ${String(hp.current)}/${String(hp.max)}`;
  const status = `${hpText}  Depth ${String(state.depth)}  Turn ${String(state.turn)}`;
  drawText(renderer, 1, mapRows, status, PALETTE.hudText);
  const seedText = `Seed ${String(state.seed)}`;
  drawText(renderer, renderer.columns - seedText.length - 1, mapRows, seedText, PALETTE.hudDim);

  // Message log: the most recent entries, newest at the bottom.
  const logRows = renderer.metrics.hudRows - 1;
  const recent = state.log.slice(-logRows);
  const firstRow = mapRows + 1 + (logRows - recent.length);
  recent.forEach((entry, i) => {
    const isLatestTurn = entry.turn === state.turn;
    const color = isLatestTurn ? toneColor(entry.tone) : PALETTE.hudDim;
    drawText(renderer, 1, firstRow + i, entry.text, color, renderer.columns - 2);
  });
}
