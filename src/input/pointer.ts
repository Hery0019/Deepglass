/**
 * Pointer mapping: turns a tap on a grid cell into the same commands the
 * keyboard produces. Contains no game logic beyond reading the state.
 */

import type { GameState, Point } from "../core/index";
import {
  canShoot,
  chebyshevDistance,
  entitiesAt,
  getPlayer,
  isExploredAt,
  isOnStairs,
  isPassableAt,
  isVisibleAt,
  pointsEqual,
} from "../core/index";
import type { InputCommand, UiMode } from "./keyboard";

export type PointerCommand =
  | InputCommand
  /** Behave as if this key had been pressed in the current mode. */
  | { readonly kind: "key"; readonly key: string }
  /** Move the examine or targeting cursor straight to a cell. */
  | { readonly kind: "cursor-set"; readonly cell: Point };

/** What a tap on `cell` means while playing. */
function playTap(state: GameState, cell: Point): PointerCommand | null {
  const player = getPlayer(state);
  if (cell.y >= state.map.height) {
    return { kind: "ui", command: { type: "open", mode: "messages" } };
  }
  if (pointsEqual(cell, player.position)) {
    return isOnStairs(state) ? { kind: "stairs" } : { kind: "action", action: { type: "wait" } };
  }
  const monster = entitiesAt(state, cell).find((e) => e.kind === "monster");
  if (
    monster !== undefined &&
    isVisibleAt(state.map, cell) &&
    chebyshevDistance(cell, player.position) > 1 &&
    canShoot(state, player, monster)
  ) {
    return { kind: "action", action: { type: "fire", targetId: monster.id } };
  }
  if (chebyshevDistance(cell, player.position) === 1) {
    const direction = { x: cell.x - player.position.x, y: cell.y - player.position.y };
    return { kind: "action", action: { type: "move", direction } };
  }
  if (isExploredAt(state.map, cell) && isPassableAt(state.map, cell)) {
    return { kind: "auto", action: { type: "travel", goal: cell } };
  }
  return null;
}

/**
 * Map a tap to a command. `cursor` is the examine or targeting cursor;
 * `inventorySlot` says which pack slot, if any, the tap landed on.
 */
export function tapToCommand(
  state: GameState,
  mode: UiMode,
  cell: Point,
  cursor: Point,
  inventorySlot: number | null,
): PointerCommand | null {
  switch (mode) {
    case "play":
      return playTap(state, cell);
    case "examine":
      return pointsEqual(cell, cursor)
        ? { kind: "ui", command: { type: "close" } }
        : { kind: "cursor-set", cell };
    case "target":
      return pointsEqual(cell, cursor) ? { kind: "fire-at-cursor" } : { kind: "cursor-set", cell };
    case "inventory":
      return inventorySlot === null
        ? { kind: "ui", command: { type: "close" } }
        : { kind: "action", action: { type: "use-item", slot: inventorySlot } };
    case "drop":
      return inventorySlot === null
        ? { kind: "ui", command: { type: "close" } }
        : { kind: "action", action: { type: "drop-item", slot: inventorySlot } };
    case "help":
    case "messages":
      return { kind: "ui", command: { type: "close" } };
  }
}
