/**
 * Title screen shown before the first move: the name, what the run is
 * about, and the keys that matter most. Any key or tap dismisses it.
 */

import { PALETTE } from "../render/palette";
import { type Renderer, drawText } from "../render/renderer";
import { centredBox, drawFrame, wrapText } from "./overlay";

const BANNER: readonly string[] = [
  "██████╗ ███████╗███████╗██████╗  ██████╗ ██╗      █████╗ ███████╗███████╗",
  "██╔══██╗██╔════╝██╔════╝██╔══██╗██╔════╝ ██║     ██╔══██╗██╔════╝██╔════╝",
  "██║  ██║█████╗  █████╗  ██████╔╝██║  ███╗██║     ███████║███████╗███████╗",
  "██║  ██║██╔══╝  ██╔══╝  ██╔═══╝ ██║   ██║██║     ██╔══██║╚════██║╚════██║",
  "██████╔╝███████╗███████╗██║     ╚██████╔╝███████╗██║  ██║███████║███████║",
  "╚═════╝ ╚══════╝╚══════╝╚═╝      ╚═════╝ ╚══════╝╚═╝  ╚═╝╚══════╝╚══════╝",
];

const TAGLINE = "Descend eight levels, reach the ninth, kill the Warden. No second chances.";

const LINES: readonly (readonly [string, string])[] = [
  ["Move", "arrows or h j k l (y u b n diagonally); bump into a monster to fight"],
  ["Explore", "o walks to what you have not seen; > takes or finds the stairs"],
  ["Survive", "r rests, % is food, potions and scrolls are unknown until tried"],
  ["Learn", "? lists every key; x examines; m shows the message history"],
];

const BOX_WIDTH = 78;
const LABEL_WIDTH = 9;

export function drawTitle(renderer: Renderer, seed: number): void {
  const wide = renderer.columns >= BOX_WIDTH;
  const width = Math.min(BOX_WIDTH, renderer.columns);
  const textWidth = width - 4;
  const tagline = wrapText(TAGLINE, textWidth);
  const lines = LINES.map(
    ([label, text]) => [label, wrapText(text, textWidth - LABEL_WIDTH)] as const,
  );
  const lineRows = lines.reduce((sum, [, rows]) => sum + rows.length, 0);
  const height = 1 + (wide ? BANNER.length : 1) + 1 + tagline.length + 1 + lineRows + 1 + 2 + 1;
  const box = centredBox(renderer, width, height);
  drawFrame(renderer, box);
  const left = box.col + 2;
  let row = box.row + 1;
  if (wide) {
    for (const line of BANNER) {
      drawText(renderer, box.col + 3, row, line, PALETTE.stairs, box.width - 4);
      row++;
    }
  } else {
    drawText(renderer, left, row, "DEEPGLASS", PALETTE.stairs);
    row++;
  }
  row++;
  for (const line of tagline) {
    drawText(renderer, left, row, line, PALETTE.hudText, textWidth);
    row++;
  }
  row++;
  for (const [label, rows] of lines) {
    drawText(renderer, left, row, label, PALETTE.logSystem);
    for (const line of rows) {
      drawText(renderer, left + LABEL_WIDTH, row, line, PALETTE.hudDim, textWidth - LABEL_WIDTH);
      row++;
    }
  }
  row++;
  drawText(renderer, left, row, `Seed ${String(seed)}`, PALETTE.hudDim);
  drawText(renderer, left, row + 1, "Press any key or tap to begin.", PALETTE.logGood, textWidth);
}
