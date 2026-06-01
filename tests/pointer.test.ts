import { describe, expect, it } from "vitest";
import { MONSTERS } from "../src/core/data/monsters";
import { getPlayer } from "../src/core/entity";
import { monsterFromDef } from "../src/core/level";
import { autoContinues } from "../src/core/systems/explore";
import { PLAYER_SIGHT_RADIUS, updateVisibility } from "../src/core/systems/fov";
import { applyAction } from "../src/core/turn";
import type { GameState } from "../src/core/types";
import { tapToCommand } from "../src/input/pointer";
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
  "#.........>#",
  "############",
];

describe("taps while playing", () => {
  const state = withVision(stateFromStrings(HALL));
  const cursor = { x: 0, y: 0 };

  it("step to an adjacent tile, wait on yourself, and walk to a seen tile", () => {
    expect(tapToCommand(state, "play", { x: 2, y: 2 }, cursor, null)).toEqual({
      kind: "action",
      action: { type: "move", direction: { x: 1, y: 1 } },
    });
    expect(tapToCommand(state, "play", { x: 1, y: 1 }, cursor, null)).toEqual({
      kind: "action",
      action: { type: "wait" },
    });
    expect(tapToCommand(state, "play", { x: 8, y: 3 }, cursor, null)).toEqual({
      kind: "auto",
      action: { type: "travel", goal: { x: 8, y: 3 } },
    });
    expect(tapToCommand(state, "play", { x: 11, y: 4 }, cursor, null)).toBeNull();
  });

  it("descend when tapping yourself on the stairs and open the log from the HUD", () => {
    const onStairs: GameState = {
      ...state,
      entities: state.entities.map((e) =>
        e.id === state.playerId ? { ...e, position: { x: 10, y: 3 } } : e,
      ),
    };
    expect(tapToCommand(onStairs, "play", { x: 10, y: 3 }, cursor, null)).toEqual({
      kind: "stairs",
    });
    expect(tapToCommand(state, "play", { x: 3, y: 7 }, cursor, null)).toEqual({
      kind: "ui",
      command: { type: "open", mode: "messages" },
    });
  });

  it("shoot a visible monster in range when a bow is readied, otherwise walk toward it", () => {
    const orc = monsterFromDef(MONSTERS.orc, { x: 5, y: 1 });
    const base = withVision(stateFromStrings(HALL, [orc]));
    expect(tapToCommand(base, "play", { x: 5, y: 1 }, cursor, null)).toEqual({
      kind: "auto",
      action: { type: "travel", goal: { x: 5, y: 1 } },
    });
    const armed: GameState = {
      ...base,
      entities: base.entities.map((e) =>
        e.id === base.playerId
          ? {
              ...e,
              inventory: { items: [{ id: 1, defId: "short-bow" }], capacity: 10 },
              equipment: { bowId: 1 },
            }
          : e,
      ),
    };
    expect(tapToCommand(armed, "play", { x: 5, y: 1 }, cursor, null)).toEqual({
      kind: "action",
      action: { type: "fire", targetId: 2 },
    });
  });
});

describe("taps in overlays", () => {
  const state = withVision(stateFromStrings(HALL));

  it("move the cursor, and confirm on a second tap", () => {
    const cursor = { x: 4, y: 2 };
    expect(tapToCommand(state, "examine", { x: 6, y: 2 }, cursor, null)).toEqual({
      kind: "cursor-set",
      cell: { x: 6, y: 2 },
    });
    expect(tapToCommand(state, "examine", cursor, cursor, null)).toEqual({
      kind: "ui",
      command: { type: "close" },
    });
    expect(tapToCommand(state, "target", cursor, cursor, null)).toEqual({
      kind: "fire-at-cursor",
    });
  });

  it("use or drop the tapped pack line, and close on a tap elsewhere", () => {
    const cursor = { x: 0, y: 0 };
    expect(tapToCommand(state, "inventory", { x: 5, y: 5 }, cursor, 2)).toEqual({
      kind: "action",
      action: { type: "use-item", slot: 2 },
    });
    expect(tapToCommand(state, "drop", { x: 5, y: 5 }, cursor, 0)).toEqual({
      kind: "action",
      action: { type: "drop-item", slot: 0 },
    });
    expect(tapToCommand(state, "inventory", { x: 5, y: 5 }, cursor, null)).toEqual({
      kind: "ui",
      command: { type: "close" },
    });
    expect(tapToCommand(state, "help", { x: 5, y: 5 }, cursor, null)).toEqual({
      kind: "ui",
      command: { type: "close" },
    });
  });
});

describe("the travel action", () => {
  it("walks to a seen tile and stops there, and refuses unknown destinations", () => {
    const start = withVision(stateFromStrings(HALL));
    const goal = { x: 8, y: 3 };
    let state = start;
    for (let i = 0; i < 30; i++) {
      const result = applyAction(state, { type: "travel", goal });
      state = result.state;
      if (!autoContinues({ type: "travel", goal }, start, result)) {
        break;
      }
    }
    expect(getPlayer(state).position).toEqual(goal);
    expect(applyAction(state, { type: "travel", goal }).events).toEqual([
      { type: "auto-refused", reason: "already-there" },
    ]);
    const unknown = applyAction(start, { type: "travel", goal: { x: 0, y: 0 } });
    expect(unknown.events).toEqual([{ type: "auto-refused", reason: "no-route" }]);
    expect(unknown.state.log.at(-1)?.text).toBe("You know no way there.");
  });
});
