/**
 * Monster AI. Each behaviour is a function from (state, monster) to a new
 * state and events. `runMonsterTurn` dispatches on the behaviour name.
 */

import { getPlayer } from "../entity";
import { type Point, chebyshevDistance, directionToward, isAdjacent, pointsEqual } from "../grid";
import { hasLineOfSight } from "./fov";
import { meleeAttack } from "./combat";
import { tryMove } from "./movement";
import type { AiBehaviour, Entity, GameEvent, GameState } from "../types";

export type AiResult = {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
};

const DEFAULT_SIGHT = 7;

/** Whether the monster can currently see the player. */
export function canSeePlayer(state: GameState, monster: Entity): boolean {
  const player = getPlayer(state);
  const radius = monster.sightRadius ?? DEFAULT_SIGHT;
  if (chebyshevDistance(monster.position, player.position) > radius) {
    return false;
  }
  return hasLineOfSight(state.map, monster.position, player.position);
}

function remember(state: GameState, monster: Entity, position: Point | undefined): GameState {
  return {
    ...state,
    entities: state.entities.map((e) => {
      if (e.id !== monster.id || e.ai === undefined) {
        return e;
      }
      const ai =
        position === undefined
          ? { behaviour: e.ai.behaviour }
          : { ...e.ai, lastKnownPlayerPosition: position };
      return { ...e, ai };
    }),
  };
}

/**
 * Step toward a target. Tries the direct diagonal first, then the two
 * cardinal components so the monster slides around simple corners.
 */
function stepToward(state: GameState, monster: Entity, target: Point): AiResult {
  const direct = directionToward(monster.position, target);
  const candidates: Point[] = [direct];
  if (direct.x !== 0 && direct.y !== 0) {
    candidates.push({ x: direct.x, y: 0 }, { x: 0, y: direct.y });
  }
  for (const direction of candidates) {
    const outcome = tryMove(state, monster, direction);
    if (outcome.kind === "moved") {
      return {
        state: outcome.state,
        events: [
          { type: "entity-moved", entityId: monster.id, from: monster.position, to: outcome.to },
        ],
      };
    }
  }
  return { state, events: [] };
}

/** Melee chaser: attack if adjacent, otherwise approach; head to the last known position if blind. */
function chaser(state: GameState, monster: Entity): AiResult {
  const player = getPlayer(state);
  if (canSeePlayer(state, monster)) {
    const seen = remember(state, monster, player.position);
    if (isAdjacent(monster.position, player.position)) {
      return meleeAttack(seen, monster, player);
    }
    return stepToward(seen, monster, player.position);
  }
  const memory = monster.ai?.lastKnownPlayerPosition;
  if (memory !== undefined) {
    if (pointsEqual(memory, monster.position)) {
      return { state: remember(state, monster, undefined), events: [] };
    }
    const moved = stepToward(state, monster, memory);
    if (moved.events.length === 0) {
      // Path is blocked; give up on the memory rather than pacing forever.
      return { state: remember(state, monster, undefined), events: [] };
    }
    return moved;
  }
  return { state, events: [] };
}

const BEHAVIOURS: Readonly<Record<AiBehaviour, (state: GameState, monster: Entity) => AiResult>> = {
  chaser,
};

export function runMonsterTurn(state: GameState, monster: Entity): AiResult {
  if (monster.ai === undefined) {
    return { state, events: [] };
  }
  return BEHAVIOURS[monster.ai.behaviour](state, monster);
}
