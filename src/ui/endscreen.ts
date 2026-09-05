/**
 * Death and victory screens: a run summary with no continue option.
 * Reads state only.
 */

import type { GameState } from "../core/index";
import { getPlayer } from "../core/index";
import { PALETTE } from "../render/palette";
import { type Renderer, drawText } from "../render/renderer";
import { centredBox, drawFrame } from "./overlay";

export function drawEndScreen(renderer: Renderer, state: GameState): void {
  if (state.status === "playing") {
    return;
  }
  const won = state.status === "won";
  const box = centredBox(renderer, 64, 14);
  drawFrame(renderer, box, won ? "Victory" : "You died");
  const left = box.col + 3;
  let row = box.row + 2;
  const headline = won
    ? "You have slain the Warden of the Deepglass."
    : "Your journey ends here, in the dark.";
  drawText(renderer, left, row, headline, won ? PALETTE.logGood : PALETTE.logBad);
  row += 2;

  const player = getPlayer(state);
  const lines: readonly (readonly [string, string])[] = [
    ["Seed", String(state.seed)],
    ["Depth reached", String(state.stats.maxDepth)],
    ["Turns survived", String(state.turn)],
    ["Kills", String(state.stats.kills)],
    ["Character level", String(player.experience?.level ?? 1)],
  ];
  for (const [label, value] of lines) {
    drawText(renderer, left, row, `${label}:`, PALETTE.hudDim);
    drawText(renderer, left + 18, row, value, PALETTE.hudText);
    row++;
  }
  row++;
  drawText(
    renderer,
    left,
    row,
    "Death is permanent. Reload the page to begin a new run.",
    PALETTE.hudDim,
    box.width - 6,
  );
}
