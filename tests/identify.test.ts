import { describe, expect, it } from "vitest";
import { ITEMS } from "../src/core/data/items";
import { getPlayer } from "../src/core/entity";
import { seedRng } from "../src/core/rng";
import {
  identify,
  isIdentified,
  itemDescription,
  itemName,
  rollAppearances,
} from "../src/core/systems/identify";
import { hasStatus } from "../src/core/systems/status";
import { applyAction, createGame } from "../src/core/turn";
import type { GameState, Item } from "../src/core/types";
import { stateFromStrings } from "./helpers";

function carrying(state: GameState, items: readonly Item[]): GameState {
  return {
    ...state,
    identified: [],
    appearances: rollAppearances(seedRng(state.seed)).appearances,
    entities: state.entities.map((e) =>
      e.id === state.playerId ? { ...e, inventory: { items: [...items], capacity: 10 } } : e,
    ),
  };
}

const CELL = ["#######", "#@....#", "#######"];

describe("unidentified items", () => {
  it("give every potion and scroll a distinct look, fixed by the seed", () => {
    const a = rollAppearances(seedRng(11)).appearances;
    const b = rollAppearances(seedRng(11)).appearances;
    expect(a).toEqual(b);
    const looks = Object.values(a);
    expect(new Set(looks).size).toBe(looks.length);
    expect(a["health-potion"]).toMatch(/ potion$/);
    expect(a["scroll-of-flame"]).toMatch(/^scroll labelled /);
    expect(a["food-ration"]).toBeUndefined();
    expect(rollAppearances(seedRng(12)).appearances).not.toEqual(a);
  });

  it("a new game knows nothing, and gear is always known", () => {
    const game = createGame(3);
    expect(game.identified).toEqual([]);
    expect(isIdentified(game, "health-potion")).toBe(false);
    expect(isIdentified(game, "sword")).toBe(true);
    expect(isIdentified(game, "food-ration")).toBe(true);
    expect(itemName(game, { id: 1, defId: "sword" })).toBe("sword");
  });

  it("show the look and a vague description until used, then the real name everywhere", () => {
    const potion: Item = { id: 1, defId: "health-potion" };
    const spare: Item = { id: 2, defId: "health-potion" };
    const state = carrying(stateFromStrings(CELL), [potion, spare]);
    expect(itemName(state, potion)).toBe(state.appearances["health-potion"]);
    expect(itemDescription(state, potion)).toMatch(/do not know/);
    const result = applyAction(state, { type: "use-item", slot: 0 });
    expect(result.events.map((e) => e.type)).toContain("item-identified");
    expect(isIdentified(result.state, "health-potion")).toBe(true);
    expect(itemName(result.state, spare)).toBe("health potion");
    expect(itemDescription(result.state, spare)).toBe(ITEMS["health-potion"].description);
    const texts = result.state.log.map((l) => l.text);
    expect(texts).toContain(`You drink the ${state.appearances["health-potion"] ?? ""}.`);
    expect(texts).toContain("It was a health potion.");
    expect(identify(result.state, "health-potion")).toBe(result.state);
  });

  it("a potion of poison poisons, a scroll of mapping reveals the level, teleportation moves you", () => {
    const rows = [
      "############", //
      "#@.........#",
      "#..........#",
      "#..........#",
      "#..........#",
      "#..........#",
      "#..........#",
      "############",
    ];
    const state = carrying(stateFromStrings(rows), [
      { id: 1, defId: "poison-potion" },
      { id: 2, defId: "scroll-of-mapping" },
      { id: 3, defId: "scroll-of-teleportation" },
    ]);
    const poisoned = applyAction(state, { type: "use-item", slot: 0 }).state;
    expect(hasStatus(getPlayer(poisoned), "poison")).toBe(true);
    const mapped = applyAction(poisoned, { type: "use-item", slot: 0 }).state;
    expect(mapped.map.explored.every(Boolean)).toBe(true);
    const moved = applyAction(mapped, { type: "use-item", slot: 0 });
    expect(moved.events.some((e) => e.type === "entity-teleported")).toBe(true);
    expect(getPlayer(moved.state).position).not.toEqual({ x: 1, y: 1 });
    expect(moved.state.identified).toEqual([
      "poison-potion",
      "scroll-of-mapping",
      "scroll-of-teleportation",
    ]);
  });
});
