import { describe, expect, it } from "vitest";
import { INITIAL_MEMORY, chooseAction, runBot } from "../tools/bot";
import { createGame } from "../src/core/turn";

describe("scripted bot", () => {
  it("plays a run to its end without stalling", { timeout: 60_000 }, () => {
    for (const seed of [3, 7, 20]) {
      const outcome = runBot(seed);
      expect(outcome.status).not.toBe("stalled");
      expect(outcome.turns).toBeGreaterThan(0);
      if (outcome.status === "dead") {
        expect(outcome.killer).toBeDefined();
      }
    }
  });

  it("is deterministic for a given seed", { timeout: 60_000 }, () => {
    expect(runBot(11)).toEqual(runBot(11));
    expect(runBot(11, "dive")).toEqual(runBot(11, "dive"));
  });

  it("starts by exploring when nothing is in view", () => {
    const choice = chooseAction(createGame(7), INITIAL_MEMORY, "explore");
    expect(choice.action.type).toBe("move");
  });
});
