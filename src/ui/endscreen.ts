/**
 * Death and victory screens: a run summary, the best runs on this
 * browser, and the key for a new run. Reads state only.
 */

import type { RunRecord } from "../client/scores";
import type { GameState } from "../core/index";
import { getPlayer } from "../core/index";
import { PALETTE } from "../render/palette";
import { type Renderer, drawText } from "../render/renderer";
import { centredBox, drawFrame } from "./overlay";

const BEST_SHOWN = 5;

function describeRun(run: RunRecord): string {
  const outcome = run.outcome === "won" ? "won" : `died on ${String(run.depth)}`;
  const cause = run.outcome === "dead" && run.cause !== undefined ? ` (${run.cause})` : "";
  return `${outcome}${cause}, ${String(run.kills)} kills, ${String(run.turns)} turns, level ${String(run.level)}`;
}

export function drawEndScreen(
  renderer: Renderer,
  state: GameState,
  scores: readonly RunRecord[] = [],
): void {
  if (state.status === "playing") {
    return;
  }
  const won = state.status === "won";
  const best = scores.slice(0, BEST_SHOWN);
  const box = centredBox(renderer, 72, 14 + (best.length > 0 ? best.length + 2 : 0));
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
  if (best.length > 0) {
    row++;
    drawText(renderer, left, row, "Best runs on this browser", PALETTE.hudText);
    row++;
    best.forEach((run, i) => {
      const current = run.seed === state.seed && run.turns === state.turn;
      drawText(renderer, left, row, `${String(i + 1)}.`, PALETTE.hudDim);
      drawText(
        renderer,
        left + 3,
        row,
        `seed ${String(run.seed)}: ${describeRun(run)}`,
        current ? PALETTE.logSystem : run.outcome === "won" ? PALETTE.logGood : PALETTE.hudDim,
        box.width - 8,
      );
      row++;
    });
  }
  row++;
  drawText(
    renderer,
    left,
    row,
    "Death is permanent. n or Enter: new run. c: copy the replay link.",
    PALETTE.hudDim,
    box.width - 6,
  );
}
