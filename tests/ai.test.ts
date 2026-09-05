import { describe, expect, it } from "vitest";
import { MONSTERS } from "../src/core/data/monsters";
import { getPlayer } from "../src/core/entity";
import { chebyshevDistance } from "../src/core/grid";
import { monsterFromDef } from "../src/core/level";
import { canSeePlayer, runMonsterTurn } from "../src/core/systems/ai";
import type { GameState } from "../src/core/types";
import { stateFromStrings } from "./helpers";

function build(rows: readonly string[], monsterAt: { x: number; y: number }): GameState {
  return stateFromStrings(rows, [monsterFromDef(MONSTERS.rat, monsterAt)]);
}

describe("chaser AI", () => {
  it("moves toward a visible player", () => {
    const state = build(["#########", "#@......#", "#########"], { x: 6, y: 1 });
    const monster = state.entities[1];
    if (monster === undefined) {
      throw new Error("monster missing");
    }
    expect(canSeePlayer(state, monster)).toBe(true);
    const result = runMonsterTurn(state, monster);
    const moved = result.state.entities.find((e) => e.id === 2);
    expect(moved?.position).toEqual({ x: 5, y: 1 });
    expect(result.events[0]?.type).toBe("entity-moved");
  });

  it("attacks instead of moving when adjacent", () => {
    const state = build(["#########", "#@......#", "#########"], { x: 2, y: 1 });
    const monster = state.entities[1];
    if (monster === undefined) {
      throw new Error("monster missing");
    }
    const result = runMonsterTurn(state, monster);
    expect(result.events.some((e) => e.type === "attack-hit" || e.type === "attack-missed")).toBe(
      true,
    );
    expect(result.state.entities.find((e) => e.id === 2)?.position).toEqual({ x: 2, y: 1 });
  });

  it("cannot see the player through a wall and stays put", () => {
    const state = build(["#########", "#@..#...#", "#########"], { x: 6, y: 1 });
    const monster = state.entities[1];
    if (monster === undefined) {
      throw new Error("monster missing");
    }
    expect(canSeePlayer(state, monster)).toBe(false);
    const result = runMonsterTurn(state, monster);
    expect(result.state.entities.find((e) => e.id === 2)?.position).toEqual({ x: 6, y: 1 });
    expect(result.events).toEqual([]);
  });

  it("remembers where it last saw the player and walks there", () => {
    // Monster sees the player, then the player steps around a corner.
    const rows = ["#########", "#@......#", "#.#######", "#.......#", "#########"];
    const state = build(rows, { x: 7, y: 1 });
    const monster = state.entities[1];
    if (monster === undefined) {
      throw new Error("monster missing");
    }
    const seen = runMonsterTurn(state, monster).state;
    const rememberedMonster = seen.entities.find((e) => e.id === 2);
    expect(rememberedMonster?.ai?.lastKnownPlayerPosition).toEqual({ x: 1, y: 1 });

    // Teleport the player out of sight.
    const hidden: GameState = {
      ...seen,
      entities: seen.entities.map((e) => (e.id === 1 ? { ...e, position: { x: 7, y: 3 } } : e)),
    };
    const m = hidden.entities.find((e) => e.id === 2);
    if (m === undefined) {
      throw new Error("monster missing");
    }
    expect(canSeePlayer(hidden, m)).toBe(false);
    const result = runMonsterTurn(hidden, m);
    const after = result.state.entities.find((e) => e.id === 2);
    expect(after).toBeDefined();
    if (after !== undefined) {
      expect(chebyshevDistance(after.position, { x: 1, y: 1 })).toBeLessThan(
        chebyshevDistance(m.position, { x: 1, y: 1 }),
      );
    }
    expect(getPlayer(result.state).position).toEqual({ x: 7, y: 3 });
  });
});
