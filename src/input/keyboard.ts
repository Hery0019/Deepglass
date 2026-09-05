/**
 * Keyboard mapping: translates KeyboardEvent keys into game Actions or
 * UI commands, depending on which overlay (if any) is open. Contains no
 * game logic.
 */

import type { Action, Point } from "../core/index";

/** Which screen currently has the keyboard. Owned by the client, not the game state. */
export type UiMode = "play" | "inventory" | "drop" | "help" | "examine" | "target" | "messages";

/** Commands that affect the client (overlays) rather than the game state. */
export type UiCommand =
  | { readonly type: "open"; readonly mode: Exclude<UiMode, "play"> }
  | { readonly type: "close" }
  | { readonly type: "zoom"; readonly direction: "in" | "out" | "reset" }
  /** Move the examine cursor by one cell. */
  | { readonly type: "cursor"; readonly direction: Point }
  /** Jump the examine cursor to the next visible monster. */
  | { readonly type: "cursor-next" }
  /** Scroll the message history; positive is toward older entries. */
  | { readonly type: "scroll"; readonly delta: number };

export type InputCommand =
  | { readonly kind: "action"; readonly action: Action }
  /** An action the client repeats until `autoContinues` says to stop. */
  | { readonly kind: "auto"; readonly action: Action }
  /** Descend when standing on the stairs, otherwise travel to them. */
  | { readonly kind: "stairs" }
  /** Shoot at whatever monster the targeting cursor is on. */
  | { readonly kind: "fire-at-cursor" }
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
      return { kind: "stairs" };
    case "o":
      return { kind: "auto", action: { type: "explore" } };
    case "r":
    case "R":
      return { kind: "auto", action: { type: "rest" } };
    case "x":
      return { kind: "ui", command: { type: "open", mode: "examine" } };
    case "f":
      return { kind: "ui", command: { type: "open", mode: "target" } };
    case "g":
    case ",":
      return { kind: "action", action: { type: "pick-up" } };
    case "i":
      return { kind: "ui", command: { type: "open", mode: "inventory" } };
    case "d":
      return { kind: "ui", command: { type: "open", mode: "drop" } };
    case "?":
      return { kind: "ui", command: { type: "open", mode: "help" } };
    case "m":
      return { kind: "ui", command: { type: "open", mode: "messages" } };
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
    case "examine":
    case "target": {
      if (key === "Enter" || (mode === "target" && key === "f")) {
        return mode === "target"
          ? { kind: "fire-at-cursor" }
          : { kind: "ui", command: { type: "close" } };
      }
      if (key === "x" && mode === "examine") {
        return { kind: "ui", command: { type: "close" } };
      }
      if (key === "Tab") {
        return { kind: "ui", command: { type: "cursor-next" } };
      }
      const direction = MOVEMENT_KEYS[key];
      return direction === undefined
        ? null
        : { kind: "ui", command: { type: "cursor", direction } };
    }
    case "help":
      return key === "?" ? { kind: "ui", command: { type: "close" } } : null;
    case "messages":
      switch (key) {
        case "m":
          return { kind: "ui", command: { type: "close" } };
        case "ArrowUp":
        case "k":
          return { kind: "ui", command: { type: "scroll", delta: 1 } };
        case "ArrowDown":
        case "j":
          return { kind: "ui", command: { type: "scroll", delta: -1 } };
        case "PageUp":
          return { kind: "ui", command: { type: "scroll", delta: 10 } };
        case "PageDown":
          return { kind: "ui", command: { type: "scroll", delta: -10 } };
        default:
          return null;
      }
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
