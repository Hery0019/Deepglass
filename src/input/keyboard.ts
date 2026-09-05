/**
 * Keyboard mapping: translates KeyboardEvent keys into game Actions or
 * UI commands, depending on which overlay (if any) is open. Contains no
 * game logic.
 */

import type { Action, Point } from "../core/index";

/** Which screen currently has the keyboard. Owned by the client, not the game state. */
export type UiMode = "play" | "inventory" | "drop" | "help";

/** Commands that affect the client (overlays) rather than the game state. */
export type UiCommand =
  | { readonly type: "open"; readonly mode: Exclude<UiMode, "play"> }
  | { readonly type: "close" }
  | { readonly type: "zoom"; readonly direction: "in" | "out" | "reset" };

export type InputCommand =
  | { readonly kind: "action"; readonly action: Action }
  | { readonly kind: "ui"; readonly command: UiCommand };

const MOVEMENT_KEYS: Readonly<Record<string, Point>> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  k: { x: 0, y: -1 },
  j: { x: 0, y: 1 },
  h: { x: -1, y: 0 },
  l: { x: 1, y: 0 },
  y: { x: -1, y: -1 },
  u: { x: 1, y: -1 },
  b: { x: -1, y: 1 },
  n: { x: 1, y: 1 },
  Home: { x: -1, y: -1 },
  PageUp: { x: 1, y: -1 },
  End: { x: -1, y: 1 },
  PageDown: { x: 1, y: 1 },
};

/** Letters that address inventory slots, in slot order. */
export const SLOT_KEYS = "abcdefghij";

function slotFromKey(key: string): number | null {
  if (key.length !== 1) {
    return null;
  }
  const index = SLOT_KEYS.indexOf(key.toLowerCase());
  return index === -1 ? null : index;
}

function playModeCommand(key: string): InputCommand | null {
  const direction = MOVEMENT_KEYS[key];
  if (direction !== undefined) {
    return { kind: "action", action: { type: "move", direction } };
  }
  switch (key) {
    case ".":
    case "s":
      return { kind: "action", action: { type: "wait" } };
    case ">":
      return { kind: "action", action: { type: "descend" } };
    case "g":
    case ",":
      return { kind: "action", action: { type: "pick-up" } };
    case "i":
      return { kind: "ui", command: { type: "open", mode: "inventory" } };
    case "d":
      return { kind: "ui", command: { type: "open", mode: "drop" } };
    case "?":
      return { kind: "ui", command: { type: "open", mode: "help" } };
    case "+":
    case "=":
      return { kind: "ui", command: { type: "zoom", direction: "in" } };
    case "-":
    case "_":
      return { kind: "ui", command: { type: "zoom", direction: "out" } };
    case "0":
      return { kind: "ui", command: { type: "zoom", direction: "reset" } };
    default:
      return null;
  }
}

/** Map a key to a command for the current mode, or null if the key is unbound. */
export function keyToCommand(key: string, mode: UiMode): InputCommand | null {
  if (mode === "play") {
    return playModeCommand(key);
  }
  if (key === "Escape") {
    return { kind: "ui", command: { type: "close" } };
  }
  switch (mode) {
    case "help":
      return key === "?" ? { kind: "ui", command: { type: "close" } } : null;
    case "inventory": {
      if (key === "i") {
        return { kind: "ui", command: { type: "close" } };
      }
      const slot = slotFromKey(key);
      return slot === null ? null : { kind: "action", action: { type: "use-item", slot } };
    }
    case "drop": {
      if (key === "d") {
        return { kind: "ui", command: { type: "close" } };
      }
      const slot = slotFromKey(key);
      return slot === null ? null : { kind: "action", action: { type: "drop-item", slot } };
    }
  }
}
