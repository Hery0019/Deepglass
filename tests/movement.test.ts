import { describe, expect, it } from "vitest";
import { applyAction, createGame, getPlayer } from "../src/core/index";
import { tileAt } from "../src/core/map/dungeon";
import { DIRECTIONS_8, addPoints } from "../src/core/grid";

describe("player movement", () => {
  it("moves the player onto a walkable tile and advances the turn", () => {
    const state = createGame(1);
    const player = getPlayer(state);
    // Spawn is a room centre, so at least one neighbour is floor.
    const direction = DIRECTIONS_8.find(
      (d) => tileAt(state.map, addPoints(player.position, d)) === "floor",
    );
    expect(direction).toBeDefined();
    if (direction === undefined) {
      return;
    }
    const result = applyAction(state, { type: "move", direction });
    expect(getPlayer(result.state).position).toEqual(addPoints(player.position, direction));
    expect(result.state.turn).toBe(state.turn + 1);
    expect(result.events.some((e) => e.type === "entity-moved")).toBe(true);
  });

  it("does not move into a wall and does not consume a turn", () => {
    const state = createGame(1);
    const player = getPlayer(state);
    // Walk in one direction until blocked, then confirm the block is free.
    let current = state;
    for (let i = 0; i < 100; i++) {
      const before = getPlayer(current).position;
      const result = applyAction(current, { type: "move", direction: { x: 1, y: 0 } });
      const after = getPlayer(result.state).position;
      if (after.x === before.x) {
        expect(result.events.some((e) => e.type === "entity-blocked")).toBe(true);
        expect(result.state.turn).toBe(current.turn);
        expect(tileAt(current.map, { x: before.x + 1, y: before.y })).toBe("wall");
        return;
      }
      current = result.state;
    }
    throw new Error(
      `player at ${String(player.position.x)},${String(player.position.y)} never hit a wall`,
    );
  });

  it("waiting consumes a turn without moving", () => {
    const state = createGame(5);
    const result = applyAction(state, { type: "wait" });
    expect(result.state.turn).toBe(1);
    expect(getPlayer(result.state).position).toEqual(getPlayer(state).position);
  });

  it("does not mutate the input state", () => {
    const state = createGame(3);
    const snapshot = JSON.stringify(state);
    applyAction(state, { type: "move", direction: { x: 0, y: -1 } });
    applyAction(state, { type: "wait" });
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});
