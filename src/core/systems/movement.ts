/**
 * Movement system: resolve a step for any entity, respecting walls and
 * blocking entities.
 */

import { addPoints, type Point } from "../grid";
import { isWalkableAt } from "../map/dungeon";
import { blockingEntityAt, updateEntity } from "../entity";
import type { Entity, GameEvent, GameState } from "../types";

export type MoveOutcome =
  | { readonly kind: "moved"; readonly state: GameState; readonly to: Point }
  | { readonly kind: "blocked-by-terrain"; readonly at: Point }
  | { readonly kind: "blocked-by-entity"; readonly at: Point; readonly blocker: Entity };

/** Try to move an entity one step. Does not itself emit events; the caller decides. */
export function tryMove(state: GameState, mover: Entity, direction: Point): MoveOutcome {
  const target = addPoints(mover.position, direction);
  if (!isWalkableAt(state.map, target)) {
    return { kind: "blocked-by-terrain", at: target };
  }
  const blocker = blockingEntityAt(state, target);
  if (blocker !== undefined && blocker.id !== mover.id) {
    return { kind: "blocked-by-entity", at: target, blocker };
  }
  const next = updateEntity(state, mover.id, (e) => ({ ...e, position: target }));
  return { kind: "moved", state: next, to: target };
}

/** Move an entity and produce the matching event, or a blocked event. */
export function moveEntity(
  state: GameState,
  mover: Entity,
  direction: Point,
): { readonly state: GameState; readonly events: readonly GameEvent[] } {
  const outcome = tryMove(state, mover, direction);
  switch (outcome.kind) {
    case "moved":
      return {
        state: outcome.state,
        events: [
          { type: "entity-moved", entityId: mover.id, from: mover.position, to: outcome.to },
        ],
      };
    case "blocked-by-terrain":
    case "blocked-by-entity":
      return {
        state,
        events: [{ type: "entity-blocked", entityId: mover.id, at: outcome.at }],
      };
  }
}
