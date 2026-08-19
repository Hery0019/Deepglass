import { describe, expect, it } from "vitest";
import { getPlayer } from "../src/core/entity";
import {
  HUNGER_HUNGRY,
  HUNGER_MAX,
  HUNGER_START,
  HUNGER_WEAK,
  STARVATION_INTERVAL,
  feed,
  hungerLevel,
  tickHunger,
} from "../src/core/systems/hunger";
import { REGEN_INTERVAL, applyAction, createGame } from "../src/core/turn";
import type { GameState } from "../src/core/types";
import { stateFromStrings } from "./helpers";

function withHunger(state: GameState, current: number, health?: number): GameState {
  return {
    ...state,
    entities: state.entities.map((e) =>
      e.id === state.playerId
        ? {
            ...e,
            hunger: { current, max: HUNGER_MAX },
            ...(health !== undefined && e.health !== undefined
              ? { health: { ...e.health, current: health } }
              : {}),
          }
        : e,
    ),
  };
}

const CELL = ["#####", "#@..#", "#####"];

describe("hunger", () => {
  it("starts the player fed and drops nutrition by one each turn", () => {
    const start = createGame(1);
    expect(getPlayer(start).hunger).toEqual({ current: HUNGER_START, max: HUNGER_MAX });
    const after = applyAction(start, { type: "wait" }).state;
    expect(getPlayer(after).hunger?.current).toBe(HUNGER_START - 1);
  });

  it("announces each level as nutrition crosses the thresholds", () => {
    const hungry = tickHunger(withHunger(stateFromStrings(CELL), HUNGER_HUNGRY + 1), 1);
    expect(hungry.events).toEqual([{ type: "hunger-changed", entityId: 1, level: "hungry" }]);
    const weak = tickHunger(withHunger(stateFromStrings(CELL), HUNGER_WEAK + 1), 1);
    expect(weak.events).toEqual([{ type: "hunger-changed", entityId: 1, level: "weak" }]);
    const starving = tickHunger(withHunger(stateFromStrings(CELL), 1), 1);
    expect(starving.events[0]).toEqual({ type: "hunger-changed", entityId: 1, level: "starving" });
    const steady = tickHunger(withHunger(stateFromStrings(CELL), 500), 1);
    expect(steady.events).toEqual([]);
  });

  it("starves the player once nutrition is gone and can kill", () => {
    let state = withHunger(stateFromStrings(CELL), 0, 2);
    let damageEvents = 0;
    for (let i = 0; i < STARVATION_INTERVAL * 2; i++) {
      const result = applyAction(state, { type: "wait" });
      damageEvents += result.events.filter(
        (e) => e.type === "entity-damaged" && e.source === "starvation",
      ).length;
      state = result.state;
    }
    expect(damageEvents).toBe(2);
    expect(state.status).toBe("dead");
    expect(state.log.at(-1)?.text).toBe("You die...");
  });

  it("suspends natural healing while weak", () => {
    const weak = withHunger(stateFromStrings(CELL), HUNGER_WEAK, 10);
    let state = weak;
    for (let i = 0; i < REGEN_INTERVAL * 2; i++) {
      state = applyAction(state, { type: "wait" }).state;
    }
    expect(getPlayer(state).health?.current).toBe(10);

    const fed = withHunger(stateFromStrings(CELL), HUNGER_START, 10);
    state = fed;
    for (let i = 0; i < REGEN_INTERVAL * 2; i++) {
      state = applyAction(state, { type: "wait" }).state;
    }
    expect(getPlayer(state).health?.current).toBeGreaterThan(10);
  });

  it("eating restores nutrition up to the cap and ends hunger", () => {
    const hungry = withHunger(stateFromStrings(CELL), 50);
    const fed = feed(hungry, 1, 800);
    expect(getPlayer(fed.state).hunger?.current).toBe(850);
    expect(fed.events).toEqual([{ type: "hunger-changed", entityId: 1, level: "fed" }]);
    const full = feed(withHunger(stateFromStrings(CELL), HUNGER_MAX - 10), 1, 800);
    expect(getPlayer(full.state).hunger?.current).toBe(HUNGER_MAX);
    expect(hungerLevel(getPlayer(full.state))).toBe("fed");
  });

  it("a food ration is eaten from the pack", () => {
    const base = withHunger(stateFromStrings(CELL), 50);
    const state: GameState = {
      ...base,
      entities: base.entities.map((e) =>
        e.id === base.playerId
          ? { ...e, inventory: { items: [{ id: 1, defId: "food-ration" }], capacity: 10 } }
          : e,
      ),
    };
    const result = applyAction(state, { type: "use-item", slot: 0 });
    expect(getPlayer(result.state).inventory?.items).toEqual([]);
    // 1000 eaten, one turn of hunger ticked.
    expect(getPlayer(result.state).hunger?.current).toBe(1049);
    expect(result.state.log.some((l) => l.text === "You eat the food ration.")).toBe(true);
  });
});
