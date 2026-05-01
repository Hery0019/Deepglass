import { describe, expect, it } from "vitest";
import { MONSTERS } from "../src/core/data/monsters";
import { getPlayer } from "../src/core/entity";
import { monsterFromDef } from "../src/core/level";
import { canShoot } from "../src/core/systems/combat";
import { PLAYER_SIGHT_RADIUS, updateVisibility } from "../src/core/systems/fov";
import { effectiveRanged, equippedBow } from "../src/core/systems/items";
import { applyAction } from "../src/core/turn";
import type { GameState } from "../src/core/types";
import { stateFromStrings } from "./helpers";

function withVision(state: GameState): GameState {
  return {
    ...state,
    map: updateVisibility(state.map, getPlayer(state).position, PLAYER_SIGHT_RADIUS),
  };
}

function withBow(state: GameState, defId: "short-bow" | "long-bow" = "short-bow"): GameState {
  return {
    ...state,
    entities: state.entities.map((e) =>
      e.id === state.playerId
        ? {
            ...e,
            inventory: { items: [{ id: 1, defId }], capacity: 10 },
            equipment: { bowId: 1 },
          }
        : e,
    ),
  };
}

const HALL = ["############", "#@.........#", "############"];

describe("bows", () => {
  it("are readied with use-item and give a ranged profile", () => {
    const base = stateFromStrings(HALL);
    const carrying: GameState = {
      ...base,
      entities: base.entities.map((e) =>
        e.id === base.playerId
          ? { ...e, inventory: { items: [{ id: 1, defId: "short-bow" }], capacity: 10 } }
          : e,
      ),
    };
    expect(effectiveRanged(getPlayer(carrying))).toBeUndefined();
    const readied = applyAction(carrying, { type: "use-item", slot: 0 }).state;
    expect(equippedBow(getPlayer(readied))?.defId).toBe("short-bow");
    const profile = effectiveRanged(getPlayer(readied));
    expect(profile?.min).toBe(2);
    expect(profile?.max).toBe(5);
    expect(profile?.range).toBe(6);
    expect(profile?.accuracy).toBeCloseTo(0.8);
    expect(readied.log.at(-1)?.text).toBe("You ready the short bow.");
    const put = applyAction(readied, { type: "use-item", slot: 0 }).state;
    expect(equippedBow(getPlayer(put))).toBeUndefined();
  });

  it("shoot a visible monster in range and the shot takes a turn", () => {
    const orc = monsterFromDef(MONSTERS.orc, { x: 5, y: 1 });
    const state = withVision(withBow(stateFromStrings(HALL, [orc])));
    expect(canShoot(state, getPlayer(state), state.entities[1] as never)).toBe(true);
    let hits = 0;
    let misses = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const result = applyAction({ ...state, rng: seed }, { type: "fire", targetId: 2 });
      expect(result.state.turn).toBe(1);
      const shot = result.events.find((e) => e.type === "attack-hit" || e.type === "attack-missed");
      expect(shot !== undefined && "ranged" in shot && shot.ranged).toBe(true);
      if (shot?.type === "attack-hit") {
        hits++;
      } else {
        misses++;
      }
    }
    expect(hits).toBeGreaterThan(0);
    expect(misses).toBeGreaterThan(0);
  });

  it("refuse without a bow, out of range, or without a line of sight", () => {
    const orc = monsterFromDef(MONSTERS.orc, { x: 9, y: 1 });
    const noBow = withVision(stateFromStrings(HALL, [orc]));
    expect(applyAction(noBow, { type: "fire", targetId: 2 }).events).toEqual([
      { type: "fire-refused", reason: "no-bow" },
    ]);
    const far = withBow(noBow);
    expect(applyAction(far, { type: "fire", targetId: 2 }).events).toEqual([
      { type: "fire-refused", reason: "no-target" },
    ]);
    expect(applyAction(far, { type: "fire", targetId: 2 }).state.turn).toBe(0);
    const longBow = withBow(noBow, "long-bow");
    expect(canShoot(longBow, getPlayer(longBow), longBow.entities[1] as never)).toBe(true);

    const rows = ["#########", "#@..+..r#", "#########"];
    const rat = monsterFromDef(MONSTERS.rat, { x: 7, y: 1 });
    const hidden = withVision(
      withBow(
        stateFromStrings(
          rows.map((r) => r.replace("r", ".")),
          [rat],
        ),
      ),
    );
    expect(applyAction(hidden, { type: "fire", targetId: 2 }).events).toEqual([
      { type: "fire-refused", reason: "no-target" },
    ]);
  });
});
