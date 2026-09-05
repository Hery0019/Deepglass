/**
 * Inventory overlay. Lists the player's items with their slot letters and
 * marks equipped gear. Reads state only.
 */

import type { GameState, Point } from "../core/index";
import { ITEMS, getPlayer, isEquipped } from "../core/index";
import { SLOT_KEYS } from "../input/keyboard";
import { PALETTE } from "../render/palette";
import { type Renderer, drawText } from "../render/renderer";
import { type Box, centredBox, drawFrame } from "./overlay";

function inventoryBox(renderer: Renderer, state: GameState): Box {
  const capacity = getPlayer(state).inventory?.capacity ?? 0;
  return centredBox(renderer, 78, capacity + 6);
}

/** Pack slot listed on a grid cell of the open inventory, or null. */
export function inventorySlotAt(renderer: Renderer, state: GameState, cell: Point): number | null {
  const box = inventoryBox(renderer, state);
  const items = getPlayer(state).inventory?.items ?? [];
  const slot = cell.y - (box.row + 2);
  if (cell.x < box.col || cell.x >= box.col + box.width || slot < 0 || slot >= items.length) {
    return null;
  }
  return slot;
}

export function drawInventory(renderer: Renderer, state: GameState, dropping: boolean): void {
  const player = getPlayer(state);
  const items = player.inventory?.items ?? [];
  const capacity = player.inventory?.capacity ?? 0;
  const box = inventoryBox(renderer, state);
  drawFrame(renderer, box, dropping ? "Drop which item?" : "Inventory");

  const left = box.col + 2;
  let row = box.row + 2;
  if (items.length === 0) {
    drawText(renderer, left, row, "Your pack is empty.", PALETTE.hudDim);
  }
  items.forEach((item, index) => {
    const def = ITEMS[item.defId];
    const key = SLOT_KEYS[index] ?? "?";
    const equipped = isEquipped(player, item);
    const suffix = equipped
      ? def.category === "armour"
        ? " (worn)"
        : def.category === "bow"
          ? " (readied)"
          : " (wielded)"
      : "";
    drawText(renderer, left, row, `${key})`, PALETTE.hudDim);
    drawText(renderer, left + 3, row, def.glyph, def.color);
    drawText(
      renderer,
      left + 5,
      row,
      `${def.name}${suffix}`,
      equipped ? PALETTE.logGood : PALETTE.hudText,
    );
    drawText(renderer, left + 28, row, def.description, PALETTE.hudDim, box.width - 31);
    row++;
  });

  const hint = dropping
    ? "Press a letter to drop that item, Esc to cancel."
    : "Press a letter to use or equip, Esc to close.";
  drawText(renderer, left, box.row + box.height - 2, hint, PALETTE.hudDim);
  drawText(
    renderer,
    box.col + box.width - 12,
    box.row,
    ` ${String(items.length)}/${String(capacity)} `,
    PALETTE.hudDim,
  );
}
