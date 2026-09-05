import { describe, expect, it } from "vitest";
import {
  MAX_SCORES,
  type RunRecord,
  compareRuns,
  insertRun,
  recordFromState,
} from "../src/client/scores";
import { createGame } from "../src/core/turn";

function run(overrides: Partial<RunRecord>): RunRecord {
  return {
    seed: 1,
    outcome: "dead",
    depth: 1,
    turns: 100,
    kills: 0,
    level: 1,
    endedAt: 0,
    ...overrides,
  };
}

describe("best runs", () => {
  it("rank wins first, then depth, kills, and fewer turns", () => {
    const ranked = [
      run({ seed: 1, depth: 5, kills: 10 }),
      run({ seed: 2, outcome: "won", depth: 9, turns: 5000 }),
      run({ seed: 3, depth: 5, kills: 12 }),
      run({ seed: 4, depth: 5, kills: 12, turns: 50 }),
      run({ seed: 5, outcome: "won", depth: 9, turns: 4000 }),
    ].sort(compareRuns);
    expect(ranked.map((r) => r.seed)).toEqual([5, 2, 4, 3, 1]);
  });

  it("keep only the best entries", () => {
    let scores: RunRecord[] = [];
    for (let i = 0; i < MAX_SCORES + 5; i++) {
      scores = insertRun(scores, run({ seed: i, depth: i }));
    }
    expect(scores).toHaveLength(MAX_SCORES);
    expect(scores[0]?.depth).toBe(MAX_SCORES + 4);
    expect(scores.at(-1)?.depth).toBe(5);
  });

  it("are built from the finished game", () => {
    const state = { ...createGame(42), status: "dead" as const, turn: 321 };
    const record = recordFromState(state, "orc", 1000);
    expect(record).toEqual({
      seed: 42,
      outcome: "dead",
      depth: 1,
      turns: 321,
      kills: 0,
      level: 1,
      cause: "orc",
      endedAt: 1000,
    });
    expect(recordFromState({ ...state, status: "won" }, undefined, 1).outcome).toBe("won");
  });
});
