import { describe, expect, it } from "vitest";
import { getPlayer } from "../src/core/entity";
import { applyAction, createGame } from "../src/core/turn";
import { stateFromStrings } from "./helpers";

const ROOM = ["#######", "#.....#", "#..@..#", "#.....#", "#######"];

describe("player movement", () => {
  it("moves the player onto a walkable tile and advances the turn", () => {
    const state = stateFromStrings(ROOM);
    const result = applyAction(state, { type: "move", direction: { x: 1, y: -1 } });
    expect(getPlayer(result.state).position).toEqual({ x: 4, y: 1 });
    expect(result.state.turn).toBe(1);
    expect(result.events.some((e) => e.type === "entity-moved")).toBe(true);
  });

  it("does not move into a wall and does not consume a turn", () => {
    const state = stateFromStrings(["#####", "#.@##", "#####"]);
    const result = applyAction(state, { type: "move", direction: { x: 1, y: 0 } });
    expect(getPlayer(result.state).position).toEqual({ x: 2, y: 1 });
    expect(result.state.turn).toBe(0);
    expect(result.events).toEqual([{ type: "entity-blocked", entityId: 1, at: { x: 3, y: 1 } }]);
  });

  it("does not walk off the edge of the grid", () => {
    const state = stateFromStrings(["@.."]);
    const result = applyAction(state, { type: "move", direction: { x: -1, y: 0 } });
    expect(getPlayer(result.state).position).toEqual({ x: 0, y: 0 });
    expect(result.state.turn).toBe(0);
  });

  it("waiting consumes a turn without moving", () => {
    const state = stateFromStrings(ROOM);
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
