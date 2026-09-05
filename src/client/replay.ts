/**
 * Replay encoding: a run is its seed plus the sequence of actions, so a
 * compact text form of the actions in the URL reproduces the whole run.
 * One character for the common actions; a few characters for the rest.
 */

import type { Action, Point } from "../core/index";

const DIRECTION_KEYS: readonly (readonly [string, Point])[] = [
  ["k", { x: 0, y: -1 }],
  ["j", { x: 0, y: 1 }],
  ["h", { x: -1, y: 0 }],
  ["l", { x: 1, y: 0 }],
  ["y", { x: -1, y: -1 }],
  ["u", { x: 1, y: -1 }],
  ["b", { x: -1, y: 1 }],
  ["n", { x: 1, y: 1 }],
];

const SLOTS = "abcdefghij";

function encodeOne(action: Action): string {
  switch (action.type) {
    case "move": {
      const key = DIRECTION_KEYS.find(
        ([, d]) => d.x === action.direction.x && d.y === action.direction.y,
      );
      return key?.[0] ?? "";
    }
    case "wait":
      return ".";
    case "descend":
      return ">";
    case "pick-up":
      return "g";
    case "explore":
      return "o";
    case "travel-to-stairs":
      return "s";
    case "rest":
      return "r";
    case "use-item":
      return `U${SLOTS[action.slot] ?? ""}`;
    case "drop-item":
      return `D${SLOTS[action.slot] ?? ""}`;
    case "fire":
      return `F${String(action.targetId)};`;
    case "travel":
      return `T${String(action.goal.x)},${String(action.goal.y)};`;
  }
}

export function encodeActions(actions: readonly Action[]): string {
  return actions.map(encodeOne).join("");
}

/** Parse a replay string. Unknown characters are skipped, so a damaged string still replays as far as it can. */
export function decodeActions(text: string): Action[] {
  const actions: Action[] = [];
  let i = 0;
  const readUntil = (end: string): string => {
    const stop = text.indexOf(end, i);
    const chunk = stop === -1 ? text.slice(i) : text.slice(i, stop);
    i = stop === -1 ? text.length : stop + 1;
    return chunk;
  };
  while (i < text.length) {
    const ch = text[i] ?? "";
    i++;
    const direction = DIRECTION_KEYS.find(([key]) => key === ch)?.[1];
    if (direction !== undefined) {
      actions.push({ type: "move", direction });
      continue;
    }
    switch (ch) {
      case ".":
        actions.push({ type: "wait" });
        break;
      case ">":
        actions.push({ type: "descend" });
        break;
      case "g":
        actions.push({ type: "pick-up" });
        break;
      case "o":
        actions.push({ type: "explore" });
        break;
      case "s":
        actions.push({ type: "travel-to-stairs" });
        break;
      case "r":
        actions.push({ type: "rest" });
        break;
      case "U":
      case "D": {
        const slot = SLOTS.indexOf(text[i] ?? "");
        i++;
        if (slot !== -1) {
          actions.push({ type: ch === "U" ? "use-item" : "drop-item", slot });
        }
        break;
      }
      case "F": {
        const targetId = Number.parseInt(readUntil(";"), 10);
        if (Number.isFinite(targetId)) {
          actions.push({ type: "fire", targetId });
        }
        break;
      }
      case "T": {
        const [xs, ys] = readUntil(";").split(",");
        const x = Number.parseInt(xs ?? "", 10);
        const y = Number.parseInt(ys ?? "", 10);
        if (Number.isFinite(x) && Number.isFinite(y)) {
          actions.push({ type: "travel", goal: { x, y } });
        }
        break;
      }
      default:
        break;
    }
  }
  return actions;
}
