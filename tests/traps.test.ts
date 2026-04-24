import { describe, expect, it } from "vitest";
import { TRAPS } from "../src/core/data/traps";
import { getPlayer } from "../src/core/entity";
import { chebyshevDistance } from "../src/core/grid";
import { FINAL_DEPTH, createLevel, trapCountForDepth } from "../src/core/level";
import { isWalkableAt } from "../src/core/map/dungeon";
import { seedRng } from "../src/core/rng";
import { exploreStep, travelStep } from "../src/core/systems/explore";
import { PLAYER_SIGHT_RADIUS, updateVisibility } from "../src/core/systems/fov";
import { hasStatus } from "../src/core/systems/status";
import {
  isKnownTrapAt,
  searchForTraps,
  trapEntityFromDef,
  triggerTrapUnderPlayer,
} from "../src/core/systems/traps";
import { applyAction } from "../src/core/turn";
import type { GameState } from "../src/core/types";
import { stateFromStrings } from "./helpers";

function withVision(state: GameState): GameState {
  return {
    ...state,
    map: updateVisibility(state.map, getPlayer(state).position, PLAYER_SIGHT_RADIUS),
  };
}

const HALL = [
  "############", //
  "#@.........#",
  "#..........#",
  "#..........#",
  "############",
];

describe("traps", () => {
  it("are hidden until stepped on, then hurt and become known", () => {
    const spike = trapEntityFromDef(TRAPS.spike, { x: 2, y: 1 });
    const state = withVision(stateFromStrings(HALL, [spike]));
    expect(isKnownTrapAt(state, { x: 2, y: 1 })).toBe(false);
    const result = applyAction(state, { type: "move", direction: { x: 1, y: 0 } });
    const types = result.events.map((e) => e.type);
    expect(types).toContain("trap-triggered");
    expect(types).toContain("entity-damaged");
    const player = getPlayer(result.state);
    expect(player.health?.current).toBeLessThan(player.health?.max ?? 0);
    expect(isKnownTrapAt(result.state, { x: 2, y: 1 })).toBe(true);
    expect(result.state.log.some((l) => l.text === "Spikes shoot up from the floor!")).toBe(true);
  });

  it("a dart trap poisons", () => {
    const dart = trapEntityFromDef(TRAPS.dart, { x: 2, y: 1 });
    const state = withVision(stateFromStrings(HALL, [dart]));
    const result = applyAction(state, { type: "move", direction: { x: 1, y: 0 } });
    expect(hasStatus(getPlayer(result.state), "poison")).toBe(true);
  });

  it("a teleport trap moves the player somewhere else on the level", () => {
    const rune = trapEntityFromDef(TRAPS.teleport, { x: 2, y: 1 });
    const state = withVision(stateFromStrings(HALL, [rune]));
    const result = applyAction(state, { type: "move", direction: { x: 1, y: 0 } });
    const to = getPlayer(result.state).position;
    expect(chebyshevDistance(to, { x: 2, y: 1 })).toBeGreaterThanOrEqual(5);
    expect(isWalkableAt(result.state.map, to)).toBe(true);
    expect(result.state.map.visible[to.y * 12 + to.x]).toBe(true);
  });

  it("can kill", () => {
    const spike = trapEntityFromDef(TRAPS.spike, { x: 1, y: 1 });
    const base = stateFromStrings(HALL, [spike]);
    const frail: GameState = {
      ...base,
      entities: base.entities.map((e) =>
        e.id === base.playerId && e.health !== undefined
          ? { ...e, health: { ...e.health, current: 1 } }
          : e,
      ),
    };
    const result = triggerTrapUnderPlayer(frail);
    expect(result.state.status).toBe("dead");
    expect(result.events.some((e) => e.type === "entity-died")).toBe(true);
  });

  it("can be noticed from an adjacent tile", () => {
    const spike = trapEntityFromDef(TRAPS.spike, { x: 2, y: 1 });
    let state = withVision(stateFromStrings(HALL, [spike]));
    let found = false;
    for (let seed = 1; seed <= 60 && !found; seed++) {
      state = { ...state, rng: seedRng(seed) };
      const result = searchForTraps(state);
      found = result.events.some((e) => e.type === "trap-found");
      if (found) {
        expect(isKnownTrapAt(result.state, { x: 2, y: 1 })).toBe(true);
      }
    }
    expect(found).toBe(true);
    // A trap two tiles away is never noticed.
    const far = trapEntityFromDef(TRAPS.spike, { x: 4, y: 1 });
    const distant = withVision(stateFromStrings(HALL, [far]));
    for (let seed = 1; seed <= 30; seed++) {
      expect(searchForTraps({ ...distant, rng: seedRng(seed) }).events).toEqual([]);
    }
  });

  it("known traps are routed around by automatic movement", () => {
    const rows = [
      "#######", //
      "#@.>..#",
      "#######",
    ];
    const spike = {
      ...trapEntityFromDef(TRAPS.spike, { x: 2, y: 1 }),
      trap: { id: "spike" as const, hidden: false },
    };
    const state = withVision(stateFromStrings(rows, [spike]));
    expect(travelStep(state, { x: 3, y: 1 })).toBeNull();
    expect(exploreStep(state)).toBeNull();
    const hidden = withVision(
      stateFromStrings(rows, [trapEntityFromDef(TRAPS.spike, { x: 2, y: 1 })]),
    );
    expect(travelStep(hidden, { x: 3, y: 1 })?.direction).toEqual({ x: 1, y: 0 });
  });

  it("are placed on levels away from the entrance, the stairs, and everything else", () => {
    let placed = 0;
    for (let seed = 1; seed <= 30; seed++) {
      for (const depth of [1, 5, FINAL_DEPTH]) {
        const level = createLevel(seedRng(seed), depth);
        const taken = new Set<string>(
          [...level.monsters, ...level.items].map(
            (e) => `${String(e.position.x)},${String(e.position.y)}`,
          ),
        );
        expect(level.traps.length).toBeLessThanOrEqual(trapCountForDepth(depth).max);
        for (const trap of level.traps) {
          placed++;
          const key = `${String(trap.position.x)},${String(trap.position.y)}`;
          expect(taken.has(key)).toBe(false);
          taken.add(key);
          expect(isWalkableAt(level.map, trap.position)).toBe(true);
          expect(trap.position).not.toEqual(level.map.spawn);
          expect(trap.position).not.toEqual(level.map.stairsDown);
          expect(trap.trap?.hidden).toBe(true);
        }
      }
    }
    expect(placed).toBeGreaterThan(0);
  });
});
