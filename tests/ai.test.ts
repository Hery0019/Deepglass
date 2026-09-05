import { describe, expect, it } from "vitest";
import { MONSTERS } from "../src/core/data/monsters";
import { getPlayer } from "../src/core/entity";
import { chebyshevDistance } from "../src/core/grid";
import { monsterFromDef } from "../src/core/level";
import { canSeePlayer, runMonsterTurn } from "../src/core/systems/ai";
import type { Entity, GameState } from "../src/core/types";
import { stateFromStrings } from "./helpers";

type MonsterKey = keyof typeof MONSTERS;

function build(
  rows: readonly string[],
  kind: MonsterKey,
  at: { x: number; y: number },
  patch: Partial<Entity> = {},
): GameState {
  return stateFromStrings(rows, [{ ...monsterFromDef(MONSTERS[kind], at), ...patch }]);
}

function monsterOf(state: GameState): Entity {
  const m = state.entities.find((e) => e.id === 2);
  if (m === undefined) {
    throw new Error("monster missing");
  }
  return m;
}

function movePlayer(state: GameState, to: { x: number; y: number }): GameState {
  return {
    ...state,
    entities: state.entities.map((e) => (e.id === 1 ? { ...e, position: to } : e)),
  };
}

describe("chaser AI", () => {
  it("moves toward a visible player", () => {
    const state = build(["#########", "#@......#", "#########"], "rat", { x: 6, y: 1 });
    expect(canSeePlayer(state, monsterOf(state))).toBe(true);
    const result = runMonsterTurn(state, monsterOf(state));
    expect(monsterOf(result.state).position).toEqual({ x: 5, y: 1 });
    expect(result.events[0]?.type).toBe("entity-moved");
  });

  it("attacks instead of moving when adjacent", () => {
    const state = build(["#########", "#@......#", "#########"], "rat", { x: 2, y: 1 });
    const result = runMonsterTurn(state, monsterOf(state));
    expect(result.events.some((e) => e.type === "attack-hit" || e.type === "attack-missed")).toBe(
      true,
    );
    expect(monsterOf(result.state).position).toEqual({ x: 2, y: 1 });
  });

  it("cannot see the player through a wall and stays put", () => {
    const state = build(["#########", "#@..#...#", "#########"], "rat", { x: 6, y: 1 });
    expect(canSeePlayer(state, monsterOf(state))).toBe(false);
    const result = runMonsterTurn(state, monsterOf(state));
    expect(monsterOf(result.state).position).toEqual({ x: 6, y: 1 });
    expect(result.events).toEqual([]);
  });

  it("paths around an obstacle instead of pressing against it", () => {
    // The orc remembers the player at (2,3), directly below it, but a wall
    // sits in between. Greedy stepping would stall; A* goes around via (1,2).
    const rows = ["#########", "#.......#", "#.###...#", "#......@#", "#########"];
    const state = stateFromStrings(rows, [
      {
        ...monsterFromDef(MONSTERS.orc, { x: 2, y: 1 }),
        ai: { behaviour: "chaser", lastKnownPlayerPosition: { x: 2, y: 3 } },
      },
    ]);
    expect(canSeePlayer(state, monsterOf(state))).toBe(false);
    const result = runMonsterTurn(state, monsterOf(state));
    expect(monsterOf(result.state).position).toEqual({ x: 1, y: 2 });
  });

  it("remembers where it last saw the player and walks there", () => {
    const rows = ["#########", "#@......#", "#.#######", "#.......#", "#########"];
    const state = build(rows, "rat", { x: 7, y: 1 });
    const seen = runMonsterTurn(state, monsterOf(state)).state;
    expect(monsterOf(seen).ai?.lastKnownPlayerPosition).toEqual({ x: 1, y: 1 });

    const hidden = movePlayer(seen, { x: 7, y: 3 });
    const m = monsterOf(hidden);
    expect(canSeePlayer(hidden, m)).toBe(false);
    const result = runMonsterTurn(hidden, m);
    const after = monsterOf(result.state);
    expect(chebyshevDistance(after.position, { x: 1, y: 1 })).toBeLessThan(
      chebyshevDistance(m.position, { x: 1, y: 1 }),
    );
    expect(getPlayer(result.state).position).toEqual({ x: 7, y: 3 });
  });

  it("forgets the last known position once it arrives there", () => {
    const rows = ["#########", "#.......#", "#########"];
    const state = stateFromStrings(rows, [
      {
        ...monsterFromDef(MONSTERS.rat, { x: 6, y: 1 }),
        ai: { behaviour: "chaser", lastKnownPlayerPosition: { x: 6, y: 1 } },
      },
    ]);
    // Put the player out of sight by walling: the row is open, so move the player far beyond sight.
    const far = {
      ...state,
      entities: state.entities.map((e) => (e.id === 1 ? { ...e, sightRadius: 0 } : e)),
    };
    const blind = {
      ...far,
      entities: far.entities.map((e) => (e.id === 2 ? { ...e, sightRadius: 0 } : e)),
    };
    const result = runMonsterTurn(blind, monsterOf(blind));
    expect(monsterOf(result.state).ai?.lastKnownPlayerPosition).toBeUndefined();
  });
});

describe("ranged AI", () => {
  const HALL = ["###########", "#@........#", "###########"];

  it("shoots when within range and line of sight", () => {
    const state = build(HALL, "goblin-archer", { x: 5, y: 1 });
    const result = runMonsterTurn(state, monsterOf(state));
    const shot = result.events.find((e) => e.type === "attack-hit" || e.type === "attack-missed");
    expect(shot).toBeDefined();
    expect(shot !== undefined && "ranged" in shot && shot.ranged).toBe(true);
    expect(monsterOf(result.state).position).toEqual({ x: 5, y: 1 });
  });

  it("backs away when the player is closer than its preferred range", () => {
    const state = build(HALL, "goblin-archer", { x: 2, y: 1 });
    const result = runMonsterTurn(state, monsterOf(state));
    expect(monsterOf(result.state).position).toEqual({ x: 3, y: 1 });
    expect(result.events[0]?.type).toBe("entity-moved");
  });

  it("approaches when the player is beyond its range", () => {
    const rows = ["################", "#@.............#", "################"];
    const state = build(rows, "goblin-archer", { x: 9, y: 1 });
    // Distance 8 > range 6 but within sight radius 8.
    const result = runMonsterTurn(state, monsterOf(state));
    expect(monsterOf(result.state).position).toEqual({ x: 8, y: 1 });
  });

  it("fights in melee when cornered", () => {
    const state = build(["#####", "#@..#", "#####"], "goblin-archer", { x: 3, y: 1 });
    // Player at 1, archer at 3: distance 2 < preferred 4, and the archer cannot retreat.
    const moved = movePlayer(state, { x: 2, y: 1 });
    const result = runMonsterTurn(moved, monsterOf(moved));
    const attack = result.events.find((e) => e.type === "attack-hit" || e.type === "attack-missed");
    expect(attack).toBeDefined();
    expect(attack !== undefined && "ranged" in attack && attack.ranged).toBe(false);
  });
});

describe("erratic AI", () => {
  it("sometimes wanders and sometimes chases, deterministically per RNG state", () => {
    const rows = [
      "#########",
      "#.......#",
      "#.......#",
      "#@......#",
      "#.......#",
      "#.......#",
      "#########",
    ];
    const state = build(rows, "bat", { x: 6, y: 3 });
    let current = state;
    let approached = 0;
    let wandered = 0;
    for (let i = 0; i < 40; i++) {
      const before = monsterOf(current);
      const result = runMonsterTurn(current, before);
      const after = monsterOf(result.state);
      const dBefore = chebyshevDistance(before.position, { x: 1, y: 3 });
      const dAfter = chebyshevDistance(after.position, { x: 1, y: 3 });
      if (dAfter < dBefore) {
        approached++;
      } else if (dAfter > dBefore) {
        wandered++;
      }
      // Reset the bat so the experiment stays comparable.
      current = {
        ...result.state,
        entities: result.state.entities.map((e) =>
          e.id === 2 ? { ...e, position: { x: 6, y: 3 } } : e,
        ),
      };
    }
    expect(approached).toBeGreaterThan(0);
    expect(wandered).toBeGreaterThan(0);
  });
});

describe("ambusher AI", () => {
  it("stays still while the player is not adjacent, even in plain sight", () => {
    const state = build(["#########", "#@......#", "#########"], "cave-spider", { x: 4, y: 1 });
    const result = runMonsterTurn(state, monsterOf(state));
    expect(monsterOf(result.state).position).toEqual({ x: 4, y: 1 });
    expect(result.events).toEqual([]);
  });

  it("strikes when the player steps adjacent and then pursues", () => {
    const state = build(["#########", "#@......#", "#########"], "cave-spider", { x: 2, y: 1 });
    const strike = runMonsterTurn(state, monsterOf(state));
    expect(strike.events.some((e) => e.type === "attack-hit" || e.type === "attack-missed")).toBe(
      true,
    );
    expect(monsterOf(strike.state).ai?.alerted).toBe(true);

    // The player retreats; the alerted spider now chases.
    const retreated = movePlayer(strike.state, { x: 6, y: 1 });
    const chase = runMonsterTurn(retreated, monsterOf(retreated));
    expect(monsterOf(chase.state).position).toEqual({ x: 3, y: 1 });
  });
});

describe("fleeing AI", () => {
  it("chases at full health", () => {
    const state = build(["#########", "#@......#", "#########"], "kobold", { x: 5, y: 1 });
    const result = runMonsterTurn(state, monsterOf(state));
    expect(monsterOf(result.state).position).toEqual({ x: 4, y: 1 });
  });

  it("retreats when wounded below its threshold", () => {
    const state = build(
      ["#########", "#@......#", "#########"],
      "kobold",
      { x: 3, y: 1 },
      {
        health: { current: 2, max: 8 },
      },
    );
    const result = runMonsterTurn(state, monsterOf(state));
    expect(monsterOf(result.state).position).toEqual({ x: 4, y: 1 });
    expect(monsterOf(result.state).ai?.fleeing).toBe(true);
  });

  it("recovers out of sight and returns to the fight", () => {
    const rows = ["#########", "#@..#...#", "#########"];
    const state = build(
      rows,
      "kobold",
      { x: 6, y: 1 },
      {
        health: { current: 2, max: 8 },
        ai: { behaviour: "fleeing", fleeing: true },
      },
    );
    let current = state;
    for (let i = 0; i < 3; i++) {
      current = runMonsterTurn(current, monsterOf(current)).state;
    }
    // Healed one point per unseen turn until back above 40% of 8: 2 -> 3 -> 4, then it stops hiding.
    expect(monsterOf(current).health?.current).toBe(4);
    expect(monsterOf(current).position).toEqual({ x: 6, y: 1 });

    // Back in sight and healthy, it drops the fleeing flag and advances.
    const open = stateFromStrings(["#########", "#@......#", "#########"], [monsterOf(current)]);
    const result = runMonsterTurn(open, monsterOf(open));
    expect(monsterOf(result.state).ai?.fleeing).toBeUndefined();
    expect(monsterOf(result.state).position).toEqual({ x: 5, y: 1 });
  });

  it("fights back when cornered", () => {
    const state = build(
      ["#####", "#@.#", "#####"].map((r) => r.padEnd(5, "#")),
      "kobold",
      { x: 2, y: 1 },
      {
        health: { current: 1, max: 8 },
      },
    );
    const result = runMonsterTurn(state, monsterOf(state));
    expect(result.events.some((e) => e.type === "attack-hit" || e.type === "attack-missed")).toBe(
      true,
    );
  });
});

describe("boss AI", () => {
  it("either closes in or hurls a ranged attack when it sees the player at range", () => {
    const state = build(["###########", "#@........#", "###########"], "warden", { x: 5, y: 1 });
    let rangedSeen = false;
    let movedSeen = false;
    let current = state;
    for (let i = 0; i < 30; i++) {
      const result = runMonsterTurn(current, monsterOf(current));
      for (const e of result.events) {
        if ((e.type === "attack-hit" || e.type === "attack-missed") && e.ranged) {
          rangedSeen = true;
        }
        if (e.type === "entity-moved") {
          movedSeen = true;
        }
      }
      current = {
        ...result.state,
        entities: result.state.entities.map((e) =>
          e.id === 2
            ? { ...e, position: { x: 5, y: 1 } }
            : e.id === 1
              ? { ...e, health: { current: 999, max: 999 } }
              : e,
        ),
      };
    }
    expect(rangedSeen).toBe(true);
    expect(movedSeen).toBe(true);
  });

  it("is flagged as the boss when built from its definition", () => {
    const boss = monsterFromDef(MONSTERS.warden, { x: 1, y: 1 });
    expect(boss.isBoss).toBe(true);
    expect(monsterFromDef(MONSTERS.rat, { x: 1, y: 1 }).isBoss).toBeUndefined();
  });
});
