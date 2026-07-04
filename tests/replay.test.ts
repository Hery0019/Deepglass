import { describe, expect, it } from "vitest";
import { decodeActions, encodeActions } from "../src/client/replay";
import { INITIAL_MEMORY, chooseAction } from "../tools/bot";
import { applyAction, createGame } from "../src/core/turn";
import type { Action } from "../src/core/types";

describe("replay encoding", () => {
  it("round-trips every action type", () => {
    const actions: Action[] = [
      { type: "move", direction: { x: 1, y: -1 } },
      { type: "wait" },
      { type: "descend" },
      { type: "pick-up" },
      { type: "explore" },
      { type: "travel-to-stairs" },
      { type: "rest" },
      { type: "use-item", slot: 3 },
      { type: "drop-item", slot: 9 },
      { type: "fire", targetId: 17 },
      { type: "travel", goal: { x: 42, y: 7 } },
    ];
    const text = encodeActions(actions);
    expect(text).toBe("u.>gosrUdDjF17;T42,7;");
    expect(decodeActions(text)).toEqual(actions);
  });

  it("skips garbage and truncated entries", () => {
    expect(decodeActions("h?jU;F")).toEqual([
      { type: "move", direction: { x: -1, y: 0 } },
      { type: "move", direction: { x: 0, y: 1 } },
    ]);
  });

  it("reproduces a bot run from its seed and encoded actions", () => {
    let state = createGame(5);
    let memory = INITIAL_MEMORY;
    const actions: Action[] = [];
    for (let i = 0; i < 300 && state.status === "playing"; i++) {
      const choice = chooseAction(state, memory, "explore");
      memory = choice.memory;
      actions.push(choice.action);
      state = applyAction(state, choice.action).state;
    }
    let replayed = createGame(5);
    for (const action of decodeActions(encodeActions(actions))) {
      replayed = applyAction(replayed, action).state;
    }
    expect(JSON.stringify(replayed)).toBe(JSON.stringify(state));
  });
});
