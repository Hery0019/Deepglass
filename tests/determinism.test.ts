import { describe, expect, it } from "vitest";
import { DIRECTIONS_8 } from "../src/core/grid";
import { nextInt, seedRng } from "../src/core/rng";
import { applyAction, createGame } from "../src/core/turn";
import type { Action, GameState } from "../src/core/types";

/** A long, varied action script derived from its own seed so it exercises many code paths. */
function scriptedActions(seed: number, count: number): Action[] {
  let rng = seedRng(seed);
  const actions: Action[] = [];
  for (let i = 0; i < count; i++) {
    const roll = nextInt(rng, 0, 9);
    rng = roll.rng;
    if (roll.value === 0) {
      actions.push({ type: "wait" });
    } else {
      const direction = DIRECTIONS_8[roll.value % DIRECTIONS_8.length];
      if (direction !== undefined) {
        actions.push({ type: "move", direction });
      }
    }
  }
  return actions;
}

function replay(seed: number, actions: readonly Action[]): GameState {
  let state = createGame(seed);
  for (const action of actions) {
    state = applyAction(state, action).state;
  }
  return state;
}

describe("determinism", () => {
  it("replaying the same seed and actions yields a byte-identical final state", () => {
    for (const seed of [1, 42, 123456, 987654321]) {
      const actions = scriptedActions(seed, 400);
      const a = replay(seed, actions);
      const b = replay(seed, actions);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });

  it("different seeds diverge", () => {
    const actions = scriptedActions(7, 100);
    expect(JSON.stringify(replay(1, actions))).not.toBe(JSON.stringify(replay(2, actions)));
  });

  it("applyAction never mutates its input", () => {
    const state = createGame(2024);
    const frozen = JSON.stringify(state);
    for (const action of scriptedActions(2024, 50)) {
      applyAction(state, action);
    }
    expect(JSON.stringify(state)).toBe(frozen);
  });

  it("a finished game ignores further actions", () => {
    const state: GameState = { ...createGame(5), status: "dead" };
    const result = applyAction(state, { type: "wait" });
    expect(result.state).toBe(state);
    expect(result.events).toEqual([]);
  });
});
