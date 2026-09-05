import { describe, expect, it } from "vitest";
import { ITEMS } from "../src/core/data/items";
import { MONSTERS } from "../src/core/data/monsters";
import { entitiesAt, getPlayer } from "../src/core/entity";
import { itemEntityFromDef, monsterFromDef } from "../src/core/level";
import { effectiveAttack, effectiveDefence, isEquipped } from "../src/core/systems/items";
import { hasStatus } from "../src/core/systems/status";
import { applyAction } from "../src/core/turn";
import type { Entity, GameState, Item } from "../src/core/types";
import { stateFromStrings } from "./helpers";

const ROOM = ["#########", "#.......#", "#...@...#", "#.......#", "#########"];

function withInventory(state: GameState, items: readonly Item[]): GameState {
  return {
    ...state,
    entities: state.entities.map((e) =>
      e.id === state.playerId ? { ...e, inventory: { items, capacity: 10 } } : e,
    ),
  };
}

function item(defId: keyof typeof ITEMS, id = 100): Item {
  return { id, defId };
}

describe("pickup and drop", () => {
  it("picks up an item from the player's tile and removes it from the floor", () => {
    const potion = itemEntityFromDef(ITEMS["health-potion"], 7, { x: 4, y: 2 });
    const state = stateFromStrings(ROOM, [potion]);
    const result = applyAction(state, { type: "pick-up" });
    expect(getPlayer(result.state).inventory?.items).toEqual([{ id: 7, defId: "health-potion" }]);
    expect(entitiesAt(result.state, { x: 4, y: 2 }).filter((e) => e.kind === "item")).toHaveLength(
      0,
    );
    expect(result.state.turn).toBe(1);
    expect(result.events[0]?.type).toBe("item-picked-up");
  });

  it("reports nothing to pick up without spending a turn", () => {
    const state = stateFromStrings(ROOM);
    const result = applyAction(state, { type: "pick-up" });
    expect(result.state.turn).toBe(0);
    expect(result.events[0]?.type).toBe("nothing-here");
  });

  it("refuses to pick up when the pack is full", () => {
    const potion = itemEntityFromDef(ITEMS["health-potion"], 7, { x: 4, y: 2 });
    const full = withInventory(
      stateFromStrings(ROOM, [potion]),
      Array.from({ length: 10 }, (_, i) => item("dagger", i + 1)),
    );
    const result = applyAction(full, { type: "pick-up" });
    expect(result.events[0]?.type).toBe("inventory-full");
    expect(result.state.turn).toBe(0);
    expect(getPlayer(result.state).inventory?.items).toHaveLength(10);
  });

  it("drops an item onto the floor and unequips it if worn", () => {
    const state = withInventory(stateFromStrings(ROOM), [item("sword")]);
    const equipped = applyAction(state, { type: "use-item", slot: 0 }).state;
    expect(isEquipped(getPlayer(equipped), item("sword"))).toBe(true);
    const dropped = applyAction(equipped, { type: "drop-item", slot: 0 });
    expect(getPlayer(dropped.state).inventory?.items).toEqual([]);
    expect(getPlayer(dropped.state).equipment?.weaponId).toBeUndefined();
    const floor = entitiesAt(dropped.state, { x: 4, y: 2 }).find((e) => e.kind === "item");
    expect(floor?.item).toEqual(item("sword"));
    expect(dropped.events.map((e) => e.type)).toEqual(["item-unequipped", "item-dropped"]);
  });

  it("dropping an empty slot does nothing and costs no turn", () => {
    const result = applyAction(stateFromStrings(ROOM), { type: "drop-item", slot: 3 });
    expect(result.state.turn).toBe(0);
    expect(result.events).toEqual([]);
  });
});

describe("equipment", () => {
  it("weapons replace the damage range and adjust accuracy", () => {
    const state = withInventory(stateFromStrings(ROOM), [item("war-axe")]);
    const before = effectiveAttack(getPlayer(state));
    const equipped = applyAction(state, { type: "use-item", slot: 0 }).state;
    const after = effectiveAttack(getPlayer(equipped));
    expect(after.min).toBe(ITEMS["war-axe"].weapon?.min);
    expect(after.max).toBe(ITEMS["war-axe"].weapon?.max);
    expect(after.accuracy).toBeCloseTo(before.accuracy - 0.15);
  });

  it("armour adds defence and may penalize accuracy", () => {
    const state = withInventory(stateFromStrings(ROOM), [item("plate-armour")]);
    const equipped = applyAction(state, { type: "use-item", slot: 0 }).state;
    expect(effectiveDefence(getPlayer(equipped))).toBe(5);
    expect(effectiveAttack(getPlayer(equipped)).accuracy).toBeCloseTo(0.85 - 0.15);
  });

  it("equipping a second weapon swaps it; using an equipped item unequips it", () => {
    const state = withInventory(stateFromStrings(ROOM), [item("dagger", 1), item("sword", 2)]);
    const one = applyAction(state, { type: "use-item", slot: 0 }).state;
    expect(getPlayer(one).equipment?.weaponId).toBe(1);
    const two = applyAction(one, { type: "use-item", slot: 1 }).state;
    expect(getPlayer(two).equipment?.weaponId).toBe(2);
    const none = applyAction(two, { type: "use-item", slot: 1 });
    expect(getPlayer(none.state).equipment?.weaponId).toBeUndefined();
    expect(none.events[0]?.type).toBe("item-unequipped");
  });

  it("armour bonus is applied when the player is hit", () => {
    const orc = {
      ...monsterFromDef(MONSTERS.orc, { x: 5, y: 2 }),
      attack: { min: 6, max: 6, accuracy: 1 },
    };
    const bare = withInventory(stateFromStrings(ROOM, [orc]), [item("chain-mail")]);
    const armoured = applyAction(bare, { type: "use-item", slot: 0 });
    // The orc attacks during the monster phase of the equip turn.
    const hit = armoured.events.find((e) => e.type === "attack-hit");
    expect(hit).toBeDefined();
    if (hit?.type === "attack-hit") {
      expect(hit.damage).toBe(6 - 3);
    }
  });
});

describe("consumables", () => {
  it("a health potion heals up to max and is consumed", () => {
    const hurt: GameState = {
      ...stateFromStrings(ROOM),
      entities: stateFromStrings(ROOM).entities.map((e) =>
        e.id === 1 ? { ...e, health: { current: 15, max: 20 } } : e,
      ),
    };
    const state = withInventory(hurt, [item("health-potion")]);
    const result = applyAction(state, { type: "use-item", slot: 0 });
    expect(getPlayer(result.state).health?.current).toBe(20);
    expect(getPlayer(result.state).inventory?.items).toEqual([]);
    expect(result.events.map((e) => e.type)).toEqual(["item-used", "entity-healed"]);
  });

  it("a health potion cures poison", () => {
    const base = stateFromStrings(ROOM);
    const poisoned: GameState = {
      ...base,
      entities: base.entities.map((e) =>
        e.id === 1 ? { ...e, statuses: [{ id: "poison", turnsLeft: 5 }] } : e,
      ),
    };
    const state = withInventory(poisoned, [item("health-potion")]);
    const result = applyAction(state, { type: "use-item", slot: 0 });
    expect(hasStatus(getPlayer(result.state), "poison")).toBe(false);
    expect(result.events.some((e) => e.type === "status-expired")).toBe(true);
  });

  it("the scroll of flame damages every visible monster within its radius", () => {
    const near = monsterFromDef(MONSTERS.orc, { x: 6, y: 2 });
    const far = monsterFromDef(MONSTERS.orc, { x: 1, y: 1 });
    const rows = [
      "##############",
      "#............#",
      "#...@........#",
      "#............#",
      "##############",
    ];
    const state = withInventory(stateFromStrings(rows, [near, far]), [item("scroll-of-flame")]);
    const result = applyAction(state, { type: "use-item", slot: 0 });
    const burned = result.events.filter((e) => e.type === "entity-damaged");
    expect(burned.map((e) => (e.type === "entity-damaged" ? e.entityId : -1)).sort()).toEqual([
      2, 3,
    ]);
    for (const e of burned) {
      if (e.type === "entity-damaged") {
        expect(e.amount).toBeGreaterThanOrEqual(6);
        expect(e.amount).toBeLessThanOrEqual(12);
      }
    }
  });

  it("the scroll of flame does not reach monsters behind a wall or out of range", () => {
    const behindWall = monsterFromDef(MONSTERS.orc, { x: 6, y: 2 });
    const outOfRange = monsterFromDef(MONSTERS.orc, { x: 10, y: 2 });
    const rows = [
      "##############",
      "#....#.......#",
      "#...@#.......#",
      "#....#.......#",
      "##############",
    ];
    const state = withInventory(stateFromStrings(rows, [behindWall, outOfRange]), [
      item("scroll-of-flame"),
    ]);
    const result = applyAction(state, { type: "use-item", slot: 0 });
    expect(result.events.filter((e) => e.type === "entity-damaged")).toHaveLength(0);
  });

  it("the scroll of bewilderment confuses monsters in range", () => {
    const orc = monsterFromDef(MONSTERS.orc, { x: 6, y: 2 });
    const state = withInventory(stateFromStrings(ROOM, [orc]), [item("scroll-of-bewilderment")]);
    const result = applyAction(state, { type: "use-item", slot: 0 });
    const confused = result.state.entities.find((e: Entity) => e.id === 2);
    expect(confused !== undefined && hasStatus(confused, "confusion")).toBe(true);
    expect(result.events.some((e) => e.type === "status-applied" && e.entityId === 2)).toBe(true);
  });

  it("kills from a scroll count toward the player's tally", () => {
    const weak = {
      ...monsterFromDef(MONSTERS.rat, { x: 5, y: 2 }),
      health: { current: 1, max: 5 },
    };
    const state = withInventory(stateFromStrings(ROOM, [weak]), [item("scroll-of-flame")]);
    const result = applyAction(state, { type: "use-item", slot: 0 });
    expect(result.state.stats.kills).toBe(1);
    expect(result.state.entities.find((e) => e.id === 2)).toBeUndefined();
  });
});
