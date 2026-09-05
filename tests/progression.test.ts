import { describe, expect, it } from "vitest";
import { MONSTERS } from "../src/core/data/monsters";
import { getPlayer } from "../src/core/entity";
import { FINAL_DEPTH, depthScaling, monsterFromDef } from "../src/core/level";
import {
  LEVEL_UP_GAINS,
  MAX_LEVEL,
  applyLevelUps,
  xpForLevel,
} from "../src/core/systems/progression";
import { applyAction, createGame, descend } from "../src/core/turn";
import type { GameState } from "../src/core/types";
import { stateFromStrings } from "./helpers";

const ROOM = ["#########", "#.......#", "#...@...#", "#.......#", "#########"];

function withXp(state: GameState, xp: number): GameState {
  return {
    ...state,
    entities: state.entities.map((e) =>
      e.id === state.playerId ? { ...e, experience: { level: 1, xp } } : e,
    ),
  };
}

describe("experience and levels", () => {
  it("has a strictly increasing experience curve", () => {
    expect(xpForLevel(1)).toBe(0);
    for (let level = 2; level <= MAX_LEVEL; level++) {
      expect(xpForLevel(level)).toBeGreaterThan(xpForLevel(level - 1));
    }
  });

  it("raises the level and grows stats when the threshold is met", () => {
    const state = withXp(stateFromStrings(ROOM), xpForLevel(2));
    const before = getPlayer(state);
    const result = applyLevelUps(state);
    const after = getPlayer(result.state);
    expect(after.experience?.level).toBe(2);
    expect(after.health?.max).toBe((before.health?.max ?? 0) + LEVEL_UP_GAINS.maxHealth);
    expect(after.health?.current).toBe((before.health?.current ?? 0) + LEVEL_UP_GAINS.maxHealth);
    expect(after.attack?.min).toBe((before.attack?.min ?? 0) + LEVEL_UP_GAINS.attackMin);
    expect(after.attack?.max).toBe((before.attack?.max ?? 0) + LEVEL_UP_GAINS.attackMax);
    expect(result.events).toEqual([{ type: "player-levelled-up", level: 2 }]);
  });

  it("gains several levels at once when a large amount of experience arrives", () => {
    const state = withXp(stateFromStrings(ROOM), xpForLevel(4));
    const result = applyLevelUps(state);
    expect(getPlayer(result.state).experience?.level).toBe(4);
    expect(result.events.map((e) => (e.type === "player-levelled-up" ? e.level : 0))).toEqual([
      2, 3, 4,
    ]);
    // Defence rises at level 3.
    expect(getPlayer(result.state).defence).toBe(1);
  });

  it("does nothing below the threshold", () => {
    const state = withXp(stateFromStrings(ROOM), xpForLevel(2) - 1);
    const result = applyLevelUps(state);
    expect(result.state).toBe(state);
    expect(result.events).toEqual([]);
  });

  it("levels up as part of the turn in which the kill happens", () => {
    const rat = {
      ...monsterFromDef(MONSTERS.rat, { x: 5, y: 2 }),
      health: { current: 1, max: 5 },
      xpValue: xpForLevel(2),
    };
    const state = stateFromStrings(ROOM, [rat]);
    const sure: GameState = {
      ...state,
      entities: state.entities.map((e) =>
        e.id === 1 ? { ...e, attack: { min: 9, max: 9, accuracy: 1 } } : e,
      ),
    };
    const result = applyAction(sure, { type: "move", direction: { x: 1, y: 0 } });
    expect(getPlayer(result.state).experience?.level).toBe(2);
    expect(result.events.some((e) => e.type === "player-levelled-up")).toBe(true);
  });
});

describe("depth scaling", () => {
  it("monsters gain health and eventually damage below their minimum depth", () => {
    expect(depthScaling(MONSTERS.orc, MONSTERS.orc.minDepth)).toEqual({ health: 0, damage: 0 });
    expect(depthScaling(MONSTERS.orc, MONSTERS.orc.minDepth + 4)).toEqual({ health: 4, damage: 1 });
    const deep = monsterFromDef(MONSTERS.orc, { x: 1, y: 1 }, MONSTERS.orc.minDepth + 4);
    expect(deep.health?.max).toBe(MONSTERS.orc.health + 4);
    expect(deep.attack?.max).toBe(MONSTERS.orc.attackMax + 1);
  });
});

describe("descending", () => {
  it("refuses when the player is not standing on stairs and costs no turn", () => {
    const state = createGame(11);
    const result = applyAction(state, { type: "descend" });
    expect(result.state.depth).toBe(1);
    expect(result.state.turn).toBe(0);
    expect(result.events).toEqual([{ type: "no-stairs-here" }]);
  });

  it("builds the next level, keeps the player's pack and wounds, and drops the old entities", () => {
    const base = createGame(11);
    const stairs = base.map.stairsDown;
    if (stairs === undefined) {
      throw new Error("level 1 must have stairs");
    }
    const onStairs: GameState = {
      ...base,
      entities: base.entities.map((e) =>
        e.id === 1
          ? {
              ...e,
              position: stairs,
              health: { current: 7, max: 20 },
              inventory: { items: [{ id: 999, defId: "sword" }], capacity: 10 },
            }
          : e,
      ),
    };
    const result = applyAction(onStairs, { type: "descend" });
    expect(result.state.depth).toBe(2);
    expect(result.state.stats.maxDepth).toBe(2);
    expect(result.state.map).not.toBe(base.map);
    const player = getPlayer(result.state);
    expect(player.position).toEqual(result.state.map.spawn);
    expect(player.health?.current).toBe(7);
    expect(player.inventory?.items).toEqual([{ id: 999, defId: "sword" }]);
    expect(result.state.entities.filter((e) => e.kind === "monster").length).toBeGreaterThan(0);
    // No entity from the previous level survives except the player.
    for (const e of result.state.entities) {
      if (e.id !== 1) {
        expect(e.id).toBeGreaterThanOrEqual(base.nextEntityId);
      }
    }
    expect(result.events[0]).toEqual({ type: "level-descended", depth: 2 });
  });

  it("allocates fresh item ids on deeper levels", () => {
    const base = createGame(21);
    const stairs = base.map.stairsDown;
    if (stairs === undefined) {
      throw new Error("level 1 must have stairs");
    }
    const onStairs: GameState = {
      ...base,
      entities: base.entities.map((e) => (e.id === 1 ? { ...e, position: stairs } : e)),
    };
    const next = descend(onStairs).state;
    const oldIds = new Set(base.entities.flatMap((e) => (e.item === undefined ? [] : [e.item.id])));
    for (const e of next.entities) {
      if (e.item !== undefined) {
        expect(oldIds.has(e.item.id)).toBe(false);
      }
    }
  });
});

describe("a complete run", () => {
  /** Teleport the player onto the stairs: a test-only shortcut for the walk. */
  function standOnStairs(state: GameState): GameState {
    const stairs = state.map.stairsDown;
    if (stairs === undefined) {
      throw new Error(`depth ${String(state.depth)} has no stairs`);
    }
    return {
      ...state,
      entities: state.entities.map((e) => (e.id === 1 ? { ...e, position: stairs } : e)),
    };
  }

  it("can descend to the final level, kill the boss, and win", () => {
    for (const seed of [1, 77, 2024]) {
      let state = createGame(seed);
      // Make the player invulnerable so the walk-through tests progression, not luck.
      state = {
        ...state,
        entities: state.entities.map((e) =>
          e.id === 1
            ? {
                ...e,
                health: { current: 9999, max: 9999 },
                attack: { min: 500, max: 500, accuracy: 1 },
              }
            : e,
        ),
      };
      while (state.depth < FINAL_DEPTH) {
        state = applyAction(standOnStairs(state), { type: "descend" }).state;
        expect(state.status).toBe("playing");
      }
      expect(state.map.stairsDown).toBeUndefined();
      const boss = state.entities.find((e) => e.isBoss === true);
      expect(boss).toBeDefined();
      if (boss === undefined) {
        return;
      }
      // Step next to the boss and strike.
      const adjacent = { x: boss.position.x - 1, y: boss.position.y };
      state = {
        ...state,
        entities: state.entities.map((e) => (e.id === 1 ? { ...e, position: adjacent } : e)),
      };
      const result = applyAction(state, { type: "move", direction: { x: 1, y: 0 } });
      expect(result.state.status).toBe("won");
      expect(result.events.some((e) => e.type === "game-won")).toBe(true);
      expect(result.state.stats.kills).toBe(1);
      expect(result.state.stats.maxDepth).toBe(FINAL_DEPTH);
      // Nothing more can happen after the win.
      expect(applyAction(result.state, { type: "wait" }).state).toBe(result.state);
    }
  });
});
