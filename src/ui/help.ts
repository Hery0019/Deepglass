/**
 * Help overlay: the full key map and a short explanation of the glyphs.
 * Reads state only.
 */

import { PALETTE } from "../render/palette";
import { type Renderer, drawText } from "../render/renderer";
import { centredBox, drawFrame } from "./overlay";

const KEY_MAP: readonly (readonly [string, string])[] = [
  ["Arrow keys / h j k l", "move (west, south, north, east)"],
  ["y u b n", "move diagonally"],
  [". or s", "wait one turn"],
  [">", "descend, or walk to the stairs once you have seen them"],
  ["o", "explore until something interesting appears"],
  ["r", "rest until healed; any key interrupts"],
  ["x", "examine: move the cursor, Tab cycles monsters"],
  ["f", "fire the readied bow: Tab picks a target, f or Enter shoots"],
  ["g or ,", "pick up the item under you"],
  ["i", "open your pack; press a letter to use or equip"],
  ["d", "drop an item; press a letter to choose"],
  ["m", "message history; Up / Down scroll"],
  ["?", "toggle this help"],
  ["+ / -", "zoom in / out (the view follows you)"],
  ["0", "reset zoom"],
  ["Esc", "close any overlay"],
  ["tap", "step, attack, shoot, or walk to a seen tile; tap yourself to wait"],
];

const LEGEND: readonly (readonly [string, string])[] = [
  ["@", "you"],
  ["#  .", "wall, floor"],
  ["+  '", "closed door, open door; walk into a door to open it"],
  [">  ^", "stairs down, a trap you have found"],
  ["!  ?  %", "potion, scroll, food"],
  [")  }  [", "weapon, bow, armour"],
  ["letters", "monsters; move into one to attack it"],
];

export function drawHelp(renderer: Renderer): void {
  const box = centredBox(renderer, 76, 36);
  drawFrame(renderer, box, "Help");
  const left = box.col + 3;
  let row = box.row + 2;

  drawText(renderer, left, row, "Keys", PALETTE.hudText);
  row++;
  for (const [keys, description] of KEY_MAP) {
    drawText(renderer, left, row, keys, PALETTE.logSystem);
    drawText(renderer, left + 22, row, description, PALETTE.hudDim, box.width - 26);
    row++;
  }

  row++;
  drawText(renderer, left, row, "Glyphs", PALETTE.hudText);
  row++;
  for (const [glyph, description] of LEGEND) {
    drawText(renderer, left, row, glyph, PALETTE.logCombat);
    drawText(renderer, left + 22, row, description, PALETTE.hudDim, box.width - 26);
    row++;
  }

  row++;
  drawText(
    renderer,
    left,
    row,
    "Reach depth 9 and defeat the Warden to win. Death is permanent.",
    PALETTE.hudText,
    box.width - 6,
  );
  row++;
  drawText(
    renderer,
    left,
    row,
    "Eat when hungry: you stop healing when weak and starve at zero.",
    PALETTE.hudDim,
    box.width - 6,
  );
  row++;
  drawText(
    renderer,
    left,
    row,
    "Potions and scrolls are unknown until you try one of their kind.",
    PALETTE.hudDim,
    box.width - 6,
  );
  row++;
  drawText(
    renderer,
    left,
    row,
    "The seed in the status bar and the URL replays this exact dungeon.",
    PALETTE.hudDim,
    box.width - 6,
  );
}
