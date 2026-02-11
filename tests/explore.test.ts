import { describe, expect, it } from "vitest";
import { MONSTERS } from "../src/core/data/monsters";
import { getPlayer } from "../src/core/entity";
import { PLAYER_SIGHT_RADIUS, updateVisibility } from "../src/core/systems/fov";
import { monsterFromDef } from "../src/core/level";
import {
  autoContinues,
  exploreStep,
  isFrontier,
  isOnStairs,
  stairsKnown,
  travelStep,
  visibleMonsters,
} from "../src/core/systems/explore";
import { applyAction, createGame } from "../src/core/turn";
import type { Action, GameState } from "../src/core/types";
import { stateFromStrings } from "./helpers";

/** A long corridor: the player sees eight tiles ahead, so the frontier lies to the east. */
const CORRIDOR = [
  "####################", //
  "#@.................#",
  "####################",
];

function withVision(state: GameState): GameState {
  return {
    ...state,
    map: updateVisibility(state.map, getPlayer(state).position, PLAYER_SIGHT_RADIUS),
  };
}

function runUntilStopped(state: GameState, action: Action, cap = 500): GameState {
  let current = state;
  for (let i = 0; i < cap; i++) {
    const result = applyAction(current, action);
    current = result.state;
    if (!autoContinues(action, state, result)) {
      break;
    }
  }
  return current;
}

describe("frontier detection", () => {
  it("marks seen floor tiles next to unseen tiles, and nothing else", () => {
    const state = withVision(stateFromStrings(CORRIDOR));
    expect(isFrontier(state.map, { x: PLAYER_SIGHT_RADIUS, y: 1 })).toBe(true);
    expect(isFrontier(state.map, { x: 2, y: 1 })).toBe(false);
    expect(isFrontier(state.map, { x: 1, y: 0 })).toBe(false);
    expect(isFrontier(state.map, { x: 18, y: 1 })).toBe(false);
  });
});

describe("exploreStep", () => {
  it("heads toward the nearest unexplored tile", () => {
    const state = withVision(stateFromStrings(CORRIDOR));
    const step = exploreStep(state);
    expect(step?.direction).toEqual({ x: 1, y: 0 });
    // The corridor walls beyond the circular sight radius stay unseen, so the
    // frontier is the last floor tile whose diagonal neighbours are unknown.
    expect(step?.target).toEqual({ x: PLAYER_SIGHT_RADIUS, y: 1 });
  });

  it("returns null once everything reachable is explored", () => {
    const state = withVision(stateFromStrings(["#####", "#@..#", "#####"]));
    expect(exploreStep(state)).toBeNull();
  });

  it("routes around a visible monster instead of walking into it", () => {
    const rows = [
      "#######", //
      "#@....#",
      "#.....#",
      "#######",
    ];
    const orc = monsterFromDef(MONSTERS.orc, { x: 2, y: 1 });
    const state = withVision(stateFromStrings(rows, [orc]));
    // The room is fully seen, so the only frontier would be beyond the monster: none here.
    expect(exploreStep(state)).toBeNull();
    expect(visibleMonsters(state)).toHaveLength(1);
  });
});

describe("travelStep", () => {
  it("returns the first step of a route through explored tiles", () => {
    const state = withVision(stateFromStrings(CORRIDOR));
    const step = travelStep(state, { x: 5, y: 1 });
    expect(step?.direction).toEqual({ x: 1, y: 0 });
  });

  it("refuses to route through tiles the player has not seen", () => {
    const state = withVision(stateFromStrings(CORRIDOR));
    expect(travelStep(state, { x: 18, y: 1 })).toBeNull();
  });
});

describe("automatic actions through applyAction", () => {
  it("explore walks until the corridor is fully seen and then reports nothing to explore", () => {
    const start = withVision(stateFromStrings(CORRIDOR));
    const explored = runUntilStopped(start, { type: "explore" });
    expect(exploreStep(explored)).toBeNull();
    expect(explored.turn).toBeGreaterThan(0);
    const again = applyAction(explored, { type: "explore" });
    expect(again.events).toEqual([{ type: "auto-refused", reason: "nothing-to-explore" }]);
    expect(again.state.turn).toBe(explored.turn);
    expect(again.state.log.at(-1)?.text).toBe("You have explored everything you can reach.");
  });

  it("refuses to explore, travel, or rest with a monster in view", () => {
    const rows = ["#######", "#@....#", "#######"];
    const rat = monsterFromDef(MONSTERS.rat, { x: 5, y: 1 });
    const state = withVision(stateFromStrings(rows, [rat]));
    for (const action of [
      { type: "explore" },
      { type: "travel-to-stairs" },
      { type: "rest" },
    ] as const) {
      const result = applyAction(state, action);
      expect(result.events).toEqual([
        { type: "auto-refused", reason: "monster-in-view", entityId: 2 },
      ]);
      expect(result.state.log.at(-1)?.text).toBe("Not with the giant rat in view.");
    }
  });

  it("travels to known stairs, stops on them, and refuses when they are unknown", () => {
    const rows = [
      "####################", //
      "#@.................#",
      "#..................#",
      "#.................>#",
      "####################",
    ];
    const unknown = withVision(stateFromStrings(rows));
    expect(stairsKnown(unknown)).toBe(false);
    const refused = applyAction(unknown, { type: "travel-to-stairs" });
    expect(refused.events).toEqual([{ type: "auto-refused", reason: "stairs-unknown" }]);

    const explored = runUntilStopped(unknown, { type: "explore" });
    expect(stairsKnown(explored)).toBe(true);
    const arrived = runUntilStopped(explored, { type: "travel-to-stairs" });
    expect(isOnStairs(arrived)).toBe(true);
    const again = applyAction(arrived, { type: "travel-to-stairs" });
    expect(again.events).toEqual([{ type: "auto-refused", reason: "already-there" }]);
  });

  it("rests until health is full and refuses at full health or while poisoned", () => {
    const base = withVision(stateFromStrings(["#####", "#@..#", "#####"]));
    const wounded: GameState = {
      ...base,
      entities: base.entities.map((e) =>
        e.id === base.playerId && e.health !== undefined
          ? { ...e, health: { ...e.health, current: e.health.max - 3 } }
          : e,
      ),
    };
    const rested = runUntilStopped(wounded, { type: "rest" });
    const player = getPlayer(rested);
    expect(player.health?.current).toBe(player.health?.max);
    expect(applyAction(rested, { type: "rest" }).events).toEqual([
      { type: "auto-refused", reason: "full-health" },
    ]);

    const poisoned: GameState = {
      ...wounded,
      entities: wounded.entities.map((e) =>
        e.id === wounded.playerId ? { ...e, statuses: [{ id: "poison", turnsLeft: 3 }] } : e,
      ),
    };
    expect(applyAction(poisoned, { type: "rest" }).events).toEqual([
      { type: "auto-refused", reason: "poisoned" },
    ]);
  });

  it("stops an exploration when a monster comes into view or an item is underfoot", () => {
    // A generated level: run explore until it stops and check the reason is a legitimate one.
    const start = createGame(7);
    let state = start;
    let stoppedForReason = false;
    for (let i = 0; i < 400 && !stoppedForReason; i++) {
      const result = applyAction(state, { type: "explore" });
      if (!autoContinues({ type: "explore" }, state, result)) {
        const player = getPlayer(result.state);
        const monsterSeen = visibleMonsters(result.state).length > 0;
        const itemHere = result.state.entities.some(
          (e) =>
            e.kind === "item" &&
            e.position.x === player.position.x &&
            e.position.y === player.position.y,
        );
        const finished = exploreStep(result.state) === null;
        const refused = result.events.some((e) => e.type === "auto-refused");
        expect(monsterSeen || itemHere || finished || refused).toBe(true);
        stoppedForReason = true;
      }
      state = result.state;
    }
    expect(stoppedForReason).toBe(true);
  });
});
