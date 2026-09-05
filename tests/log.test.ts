import { describe, expect, it } from "vitest";
import { getPlayer } from "../src/core/entity";
import { itemEntityFromDef } from "../src/core/level";
import { ITEMS } from "../src/core/data/items";
import { HUNGER_MAX } from "../src/core/systems/hunger";
import { applyAction } from "../src/core/turn";
import type { GameState } from "../src/core/types";
import { stateFromStrings } from "./helpers";

describe("the message log", () => {
  it("counts a line repeated back to back instead of printing it again", () => {
    const base = stateFromStrings(["#####", "#@..#", "#####"]);
    let state: GameState = {
      ...base,
      entities: base.entities.map((e) =>
        e.id === base.playerId ? { ...e, hunger: { current: 0, max: HUNGER_MAX } } : e,
      ),
    };
    for (let i = 0; i < 12; i++) {
      state = applyAction(state, { type: "wait" }).state;
    }
    const starving = state.log.filter((l) => l.text === "You take 1 damage from starvation.");
    expect(starving).toHaveLength(1);
    expect(starving[0]?.count).toBe(3);
    expect(getPlayer(state).health?.current).toBe((getPlayer(base).health?.max ?? 0) - 3);
  });

  it("announces items underfoot when the player steps onto them", () => {
    const potion = itemEntityFromDef(ITEMS["food-ration"], 1, { x: 2, y: 1 });
    const state = stateFromStrings(["#####", "#@..#", "#####"], [potion]);
    const result = applyAction(state, { type: "move", direction: { x: 1, y: 0 } });
    expect(result.events).toContainEqual({
      type: "item-seen",
      item: { id: 1, defId: "food-ration" },
      count: 1,
    });
    expect(result.state.log.at(-1)?.text).toBe("You see a food ration here.");
  });
});
