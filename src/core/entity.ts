/**
 * Entity lookup and update helpers. All updates return new arrays; nothing
 * here mutates the state.
 */

import { type Point, pointsEqual } from "./grid";
import type { Entity, EntityId, GameState } from "./types";

export function findEntity(state: GameState, id: EntityId): Entity | undefined {
  return state.entities.find((e) => e.id === id);
}

export function getPlayer(state: GameState): Entity {
  const player = findEntity(state, state.playerId);
  if (player === undefined) {
    throw new Error("Game state has no player entity.");
  }
  return player;
}

/** The blocking entity standing on a tile, if any. */
export function blockingEntityAt(state: GameState, p: Point): Entity | undefined {
  return state.entities.find((e) => e.blocksMovement && pointsEqual(e.position, p));
}

export function entitiesAt(state: GameState, p: Point): Entity[] {
  return state.entities.filter((e) => pointsEqual(e.position, p));
}

/** Replace one entity by id. Returns the same state if the id is unknown. */
export function updateEntity(
  state: GameState,
  id: EntityId,
  update: (entity: Entity) => Entity,
): GameState {
  let changed = false;
  const entities = state.entities.map((e) => {
    if (e.id !== id) {
      return e;
    }
    changed = true;
    return update(e);
  });
  return changed ? { ...state, entities } : state;
}

export function removeEntity(state: GameState, id: EntityId): GameState {
  return { ...state, entities: state.entities.filter((e) => e.id !== id) };
}

/** Append an entity, allocating its id from the state counter. */
export function spawnEntity(
  state: GameState,
  entity: Omit<Entity, "id">,
): { readonly state: GameState; readonly entity: Entity } {
  const created: Entity = { ...entity, id: state.nextEntityId };
  return {
    state: {
      ...state,
      entities: [...state.entities, created],
      nextEntityId: state.nextEntityId + 1,
    },
    entity: created,
  };
}
