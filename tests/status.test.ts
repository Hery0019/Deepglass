import { describe, expect, it } from "vitest";
import { MONSTERS } from "../src/core/data/monsters";
import { getPlayer } from "../src/core/entity";
import { monsterFromDef } from "../src/core/level";
import { applyStatus, hasStatus, tickAllStatuses, tickStatuses } from "../src/core/systems/status";
import { applyAction } from "../src/core/turn";
import type { GameState } from "../src/core/types";
import { stateFromStrings } from "./helpers";

const ROOM = ["#########", "#.......#", "#...@...#", "#.......#", "#########"];

describe("status effects", () => {
  it("poison deals damage each turn and expires after its duration", () => {
    let state = applyStatus(stateFromStrings(ROOM), 1, "poison", 3).state;
    expect(hasStatus(getPlayer(state), "poison")).toBe(true);
    const start = getPlayer(state).health?.current ?? 0;
    for (let i = 0; i < 3; i++) {
      state = applyAction(state, { type: "wait" }).state;
    }
    expect(getPlayer(state).health?.current).toBe(start - 3);
    expect(hasStatus(getPlayer(state), "poison")).toBe(false);
    // A fourth turn deals no more damage.
    const after = applyAction(state, { type: "wait" }).state;
    expect(getPlayer(after).health?.current).toBe(start - 3);
  });

  it("emits applied and expired events exactly once each", () => {
    const applied = applyStatus(stateFromStrings(ROOM), 1, "poison", 2);
    expect(applied.events).toEqual([{ type: "status-applied", entityId: 1, status: "poison" }]);
    const first = applyAction(applied.state, { type: "wait" });
    expect(first.events.filter((e) => e.type === "status-expired")).toHaveLength(0);
    const second = applyAction(first.state, { type: "wait" });
    expect(second.events.filter((e) => e.type === "status-expired")).toEqual([
      { type: "status-expired", entityId: 1, status: "poison" },
    ]);
  });

  it("reapplying a status extends the duration to the longer one without stacking damage", () => {
    const once = applyStatus(stateFromStrings(ROOM), 1, "poison", 2);
    const twice = applyStatus(once.state, 1, "poison", 5);
    expect(twice.events).toEqual([]);
    expect(getPlayer(twice.state).statuses).toEqual([{ id: "poison", turnsLeft: 5 }]);
    const shorter = applyStatus(twice.state, 1, "poison", 1);
    expect(getPlayer(shorter.state).statuses).toEqual([{ id: "poison", turnsLeft: 5 }]);
    const ticked = tickStatuses(shorter.state, 1);
    const damage = ticked.events.filter((e) => e.type === "entity-damaged");
    expect(damage).toHaveLength(1);
  });

  it("different statuses coexist", () => {
    const state = applyStatus(
      applyStatus(stateFromStrings(ROOM), 1, "poison", 3).state,
      1,
      "confusion",
      3,
    ).state;
    expect(getPlayer(state).statuses?.map((s) => s.id)).toEqual(["poison", "confusion"]);
  });

  it("poison can kill and the death is not credited to anyone", () => {
    const base = stateFromStrings(ROOM);
    const frail: GameState = {
      ...base,
      entities: base.entities.map((e) =>
        e.id === 1 ? { ...e, health: { current: 1, max: 20 } } : e,
      ),
    };
    const poisoned = applyStatus(frail, 1, "poison", 3).state;
    const result = applyAction(poisoned, { type: "wait" });
    expect(result.state.status).toBe("dead");
    expect(
      result.events.some(
        (e) => e.type === "entity-died" && e.entityId === 1 && e.killerId === undefined,
      ),
    ).toBe(true);
  });

  it("poisoned monsters die from poison and are removed", () => {
    const rat = { ...monsterFromDef(MONSTERS.rat, { x: 1, y: 1 }), health: { current: 1, max: 5 } };
    const state = applyStatus(stateFromStrings(ROOM, [rat]), 2, "poison", 3).state;
    const result = tickAllStatuses(state);
    expect(result.state.entities.find((e) => e.id === 2)).toBeUndefined();
    expect(result.state.stats.kills).toBe(0);
  });

  it("confusion scrambles the player's movement and still costs the turn", () => {
    const state = applyStatus(stateFromStrings(ROOM), 1, "confusion", 10).state;
    // Try many times; at least one requested move must land somewhere unexpected.
    let scrambled = false;
    let current = state;
    for (let i = 0; i < 20; i++) {
      const before = getPlayer(current).position;
      const result = applyAction(current, { type: "move", direction: { x: 1, y: 0 } });
      const after = getPlayer(result.state).position;
      expect(result.state.turn).toBe(current.turn + 1);
      if (after.x !== before.x + 1 || after.y !== before.y) {
        scrambled = true;
      }
      // Keep the player centred so walls do not dominate the sample.
      current = {
        ...result.state,
        entities: result.state.entities.map((e) =>
          e.id === 1 ? { ...e, position: { x: 4, y: 2 } } : e,
        ),
      };
    }
    expect(scrambled).toBe(true);
  });

  it("a monster's on-hit status is applied to the player when the roll succeeds", () => {
    const spider = {
      ...monsterFromDef(MONSTERS["cave-spider"], { x: 5, y: 2 }),
      attack: { min: 1, max: 1, accuracy: 1 },
      onHit: { status: "poison" as const, turns: 4, chance: 1 },
    };
    const state = stateFromStrings(ROOM, [spider]);
    const result = applyAction(state, { type: "wait" });
    expect(hasStatus(getPlayer(result.state), "poison")).toBe(true);
    expect(result.events.some((e) => e.type === "status-applied" && e.entityId === 1)).toBe(true);
  });

  it("statuses cannot be applied to entities without health", () => {
    const state = stateFromStrings(ROOM, [
      {
        kind: "item",
        name: "rock",
        glyph: "*",
        color: "#fff",
        position: { x: 1, y: 1 },
        blocksMovement: false,
      },
    ]);
    const result = applyStatus(state, 2, "poison", 3);
    expect(result.events).toEqual([]);
    expect(result.state).toBe(state);
  });
});
