import { describe, expect, it } from "vitest";
import { MONSTERS } from "../src/core/data/monsters";
import { entitiesAt, getPlayer } from "../src/core/entity";
import { chebyshevDistance } from "../src/core/grid";
import { FINAL_DEPTH, createLevel, monsterFromDef, spawnTableForDepth } from "../src/core/level";
import { seedRng } from "../src/core/rng";
import { resolveDeath } from "../src/core/systems/combat";
import { stateFromStrings } from "./helpers";

describe("the Gatekeeper", () => {
  it("stands beside the stairs on depth 5 and nowhere else", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const level = createLevel(seedRng(seed), 5);
      const keepers = level.monsters.filter((m) => m.name === MONSTERS.gatekeeper.name);
      expect(keepers).toHaveLength(1);
      const keeper = keepers[0];
      expect(level.map.stairsDown).toBeDefined();
      if (keeper !== undefined && level.map.stairsDown !== undefined) {
        expect(chebyshevDistance(keeper.position, level.map.stairsDown)).toBe(1);
      }
    }
    for (const depth of [1, 4, 6, FINAL_DEPTH]) {
      const level = createLevel(seedRng(3), depth);
      expect(level.monsters.some((m) => m.name === MONSTERS.gatekeeper.name)).toBe(false);
      expect(spawnTableForDepth(depth).some((m) => m.id === "gatekeeper")).toBe(false);
    }
  });

  it("leaves its drop on the floor when killed", () => {
    const keeper = monsterFromDef(MONSTERS.gatekeeper, { x: 3, y: 1 });
    const base = stateFromStrings(["#####", "#@..#", "#####"], [keeper]);
    const dying = {
      ...base,
      entities: base.entities.map((e) =>
        e.id === 2 && e.health !== undefined ? { ...e, health: { ...e.health, current: 0 } } : e,
      ),
    };
    const victim = dying.entities[1];
    if (victim === undefined) {
      throw new Error("no keeper");
    }
    const result = resolveDeath(dying, victim, dying.playerId);
    const floor = entitiesAt(result.state, { x: 3, y: 1 });
    expect(floor.map((e) => e.item?.defId)).toEqual(["chain-mail"]);
    expect(result.state.nextItemId).toBe(base.nextItemId + 1);
    expect(result.events.map((e) => e.type)).toEqual(["entity-died", "item-dropped"]);
    expect(getPlayer(result.state).experience?.xp).toBe(MONSTERS.gatekeeper.xpValue);
  });
});
