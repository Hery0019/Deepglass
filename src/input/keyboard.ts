/**
 * Keyboard mapping: translates KeyboardEvent keys into game Actions or
 * UI commands. Contains no game logic.
 */

import type { Action, Point } from "../core/index";

/** Commands that affect the client (overlays, new game) rather than the game state. */
export type UiCommand =
  | { readonly type: "toggle-help" }
  | { readonly type: "toggle-inventory" }
  | { readonly type: "close-overlay" };

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

/** Map a key to a command, or null if the key is unbound. */
export function keyToCommand(key: string): InputCommand | null {
  const direction = MOVEMENT_KEYS[key];
  if (direction !== undefined) {
    return { kind: "action", action: { type: "move", direction } };
  }
  switch (key) {
    case ".":
    case "s":
      return { kind: "action", action: { type: "wait" } };
    case "?":
      return { kind: "ui", command: { type: "toggle-help" } };
    case "i":
      return { kind: "ui", command: { type: "toggle-inventory" } };
    case "Escape":
      return { kind: "ui", command: { type: "close-overlay" } };
    default:
      return null;
  }
}
