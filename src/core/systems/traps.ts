/**
 * Traps: hidden hazards on floor tiles. Only the player triggers them; the
 * monsters know their own dungeon. Standing next to a hidden trap gives a
 * chance each turn to notice it.
 */

import { TRAPS, TRAP_GLYPH, type TrapDef } from "../data/traps";
import { entitiesAt, getPlayer, updateEntity } from "../entity";
import { type Point, chebyshevDistance } from "../grid";
import { isWalkableAt } from "../map/dungeon";
import { chance, nextInt } from "../rng";
import type { Entity, GameEvent, GameState } from "../types";
import { applyDamage, isDead, resolveDeath } from "./combat";
import { applyStatus } from "./status";

/** Chance per turn of noticing each hidden trap adjacent to the player. */
export const TRAP_SEARCH_CHANCE = 0.15;

export type TrapResult = {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
};

export function trapEntityFromDef(def: TrapDef, position: Point): Omit<Entity, "id"> {
  return {
    kind: "trap",
    name: def.name,
    glyph: TRAP_GLYPH,
    color: def.color,
    position,
    blocksMovement: false,
    trap: { id: def.id, hidden: true },
  };
}

/** The trap on a tile, if any (hidden or not). */
export function trapAt(state: GameState, p: Point): Entity | undefined {
  return entitiesAt(state, p).find((e) => e.kind === "trap");
}

/** Whether the player knows of a trap on this tile. */
export function isKnownTrapAt(state: GameState, p: Point): boolean {
  const trap = trapAt(state, p);
  return trap?.trap !== undefined && !trap.trap.hidden;
}

function reveal(state: GameState, trapEntityId: number): GameState {
  return updateEntity(state, trapEntityId, (e) =>
    e.trap === undefined ? e : { ...e, trap: { ...e.trap, hidden: false } },
  );
}

/** A random walkable tile with nothing blocking on it, at least a few steps away. */
export function randomDestination(
  state: GameState,
  from: Point,
): { state: GameState; to: Point | null } {
  let next = state;
  for (let attempt = 0; attempt < 60; attempt++) {
    const xRoll = nextInt(next.rng, 0, state.map.width - 1);
    const yRoll = nextInt(xRoll.rng, 0, state.map.height - 1);
    next = { ...next, rng: yRoll.rng };
    const to = { x: xRoll.value, y: yRoll.value };
    if (!isWalkableAt(state.map, to) || chebyshevDistance(from, to) < 5) {
      continue;
    }
    if (entitiesAt(state, to).some((e) => e.blocksMovement || e.kind === "trap")) {
      continue;
    }
    return { state: next, to };
  }
  return { state: next, to: null };
}

/** Fire the trap under the player, if there is one. Hidden traps become known. */
export function triggerTrapUnderPlayer(state: GameState): TrapResult {
  const player = getPlayer(state);
  const trap = trapAt(state, player.position);
  if (trap?.trap === undefined) {
    return { state, events: [] };
  }
  const def = TRAPS[trap.trap.id];
  let next = reveal(state, trap.id);
  const events: GameEvent[] = [
    { type: "trap-triggered", entityId: player.id, trap: def.id, at: player.position },
  ];
  const effect = def.effect;
  switch (effect.type) {
    case "damage":
    case "damage-status": {
      const roll = nextInt(next.rng, effect.min, effect.max);
      next = applyDamage({ ...next, rng: roll.rng }, player.id, roll.value);
      events.push({
        type: "entity-damaged",
        entityId: player.id,
        amount: roll.value,
        source: `the ${def.name}`,
      });
      const hurt = getPlayer(next);
      if (isDead(hurt)) {
        const death = resolveDeath(next, hurt, undefined);
        return { state: death.state, events: [...events, ...death.events] };
      }
      if (effect.type === "damage-status") {
        const applied = applyStatus(next, player.id, effect.status, effect.turns);
        next = applied.state;
        events.push(...applied.events);
      }
      return { state: next, events };
    }
    case "teleport": {
      const destination = randomDestination(next, player.position);
      next = destination.state;
      if (destination.to !== null) {
        const to = destination.to;
        next = updateEntity(next, player.id, (e) => ({ ...e, position: to }));
        events.push({ type: "entity-teleported", entityId: player.id, to });
      }
      return { state: next, events };
    }
  }
}

/** Each hidden trap next to the player may be noticed this turn. */
export function searchForTraps(state: GameState): TrapResult {
  const player = getPlayer(state);
  let next = state;
  const events: GameEvent[] = [];
  for (const entity of state.entities) {
    if (entity.trap?.hidden !== true) {
      continue;
    }
    if (chebyshevDistance(entity.position, player.position) !== 1) {
      continue;
    }
    const roll = chance(next.rng, TRAP_SEARCH_CHANCE);
    next = { ...next, rng: roll.rng };
    if (roll.value) {
      next = reveal(next, entity.id);
      events.push({ type: "trap-found", trap: entity.trap.id, at: entity.position });
    }
  }
  return { state: next, events };
}
