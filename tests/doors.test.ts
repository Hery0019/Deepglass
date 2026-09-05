import { describe, expect, it } from "vitest";
import { MONSTERS } from "../src/core/data/monsters";
import { getPlayer } from "../src/core/entity";
import { monsterFromDef } from "../src/core/level";
import { isFullyConnected, tileAt } from "../src/core/map/dungeon";
import { generateMap } from "../src/core/map/generate";
import { seedRng } from "../src/core/rng";
import { runMonsterTurn } from "../src/core/systems/ai";
import { autoContinues, exploreStep } from "../src/core/systems/explore";
import { PLAYER_SIGHT_RADIUS, updateVisibility } from "../src/core/systems/fov";
import { applyAction } from "../src/core/turn";
import type { GameState } from "../src/core/types";
import { stateFromStrings } from "./helpers";

function withVision(state: GameState): GameState {
  return {
    ...state,
    map: updateVisibility(state.map, getPlayer(state).position, PLAYER_SIGHT_RADIUS),
  };
}

const DOORWAY = [
  "#########", //
  "#@..+...#",
  "#########",
];

describe("doors", () => {
  it("block sight while closed and open when walked into, costing a turn", () => {
    const start = withVision(stateFromStrings(DOORWAY));
    expect(start.map.visible[1 * 9 + 6]).toBe(false);
    let state = start;
    for (let i = 0; i < 2; i++) {
      state = applyAction(state, { type: "move", direction: { x: 1, y: 0 } }).state;
    }
    expect(getPlayer(state).position).toEqual({ x: 3, y: 1 });
    const opened = applyAction(state, { type: "move", direction: { x: 1, y: 0 } });
    expect(opened.events[0]).toEqual({ type: "door-opened", entityId: 1, at: { x: 4, y: 1 } });
    expect(getPlayer(opened.state).position).toEqual({ x: 3, y: 1 });
    expect(opened.state.turn).toBe(state.turn + 1);
    expect(tileAt(opened.state.map, { x: 4, y: 1 })).toBe("door-open");
    expect(opened.state.map.visible[1 * 9 + 6]).toBe(true);
    expect(opened.state.log.at(-1)?.text).toBe("You open the door.");
    // The original map is untouched.
    expect(tileAt(state.map, { x: 4, y: 1 })).toBe("door-closed");
  });

  it("are opened by monsters on their way to the player", () => {
    const orc = monsterFromDef(MONSTERS.orc, { x: 7, y: 1 });
    const state = withVision(stateFromStrings(DOORWAY, [orc]));
    // The orc cannot see through the door, so give it a reason to come: a remembered position.
    const remembering: GameState = {
      ...state,
      entities: state.entities.map((e) =>
        e.id === 2 && e.ai !== undefined
          ? { ...e, ai: { ...e.ai, lastKnownPlayerPosition: { x: 1, y: 1 } } }
          : e,
      ),
    };
    let current = remembering;
    for (let i = 0; i < 3; i++) {
      const monster = current.entities.find((e) => e.id === 2);
      if (monster === undefined) {
        throw new Error("orc vanished");
      }
      current = runMonsterTurn(current, monster).state;
    }
    expect(tileAt(current.map, { x: 4, y: 1 })).toBe("door-open");
  });

  it("do not interrupt automatic exploration", () => {
    const start = withVision(stateFromStrings(DOORWAY));
    let state = start;
    let openedDuringRun = false;
    for (let i = 0; i < 20; i++) {
      const result = applyAction(state, { type: "explore" });
      openedDuringRun ||= result.events.some((e) => e.type === "door-opened");
      state = result.state;
      if (!autoContinues({ type: "explore" }, start, result)) {
        break;
      }
    }
    expect(openedDuringRun).toBe(true);
    expect(exploreStep(state)).toBeNull();
  });

  it("are generated only at single-tile corridor mouths and keep levels connected", () => {
    let doors = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const { map } = generateMap(seedRng(seed));
      expect(isFullyConnected(map, map.spawn)).toBe(true);
      map.tiles.forEach((tile, index) => {
        if (tile !== "door-closed") {
          return;
        }
        doors++;
        const x = index % map.width;
        const y = Math.floor(index / map.width);
        const open = (dx: number, dy: number): boolean =>
          tileAt(map, { x: x + dx, y: y + dy }) !== "wall";
        const vertical = open(0, -1) && open(0, 1) && !open(-1, 0) && !open(1, 0);
        const horizontal = open(-1, 0) && open(1, 0) && !open(0, -1) && !open(0, 1);
        expect(vertical || horizontal).toBe(true);
      });
    }
    expect(doors).toBeGreaterThan(100);
  });
});
