/**
 * Hunger: a slow clock that makes time cost something. Nutrition drops by
 * one each turn. Below `HUNGRY` the player is warned; below `WEAK` natural
 * healing stops; at zero the player starves and takes damage.
 */

import { findEntity, updateEntity } from "../entity";
import type { Entity, GameEvent, GameState } from "../types";
import { applyDamage, isDead, resolveDeath } from "./combat";

export const HUNGER_MAX = 1500;
export const HUNGER_START = 1200;
export const HUNGER_HUNGRY = 300;
export const HUNGER_WEAK = 100;
/** Turns between points of starvation damage once nutrition reaches zero. */
export const STARVATION_INTERVAL = 4;

export type HungerLevel = "fed" | "hungry" | "weak" | "starving";

export function hungerLevel(entity: Entity): HungerLevel {
  const hunger = entity.hunger;
  if (hunger === undefined || hunger.current > HUNGER_HUNGRY) {
    return "fed";
  }
  if (hunger.current > HUNGER_WEAK) {
    return "hungry";
  }
  return hunger.current > 0 ? "weak" : "starving";
}

/** Whether hunger currently prevents natural healing. */
export function hungerBlocksRegen(entity: Entity): boolean {
  const level = hungerLevel(entity);
  return level === "weak" || level === "starving";
}

export type HungerResult = {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
};

/** Advance one entity's hunger by a turn, announcing level changes and starvation damage. */
export function tickHunger(state: GameState, entityId: number): HungerResult {
  const entity = findEntity(state, entityId);
  if (entity?.hunger === undefined) {
    return { state, events: [] };
  }
  const before = hungerLevel(entity);
  const current = Math.max(0, entity.hunger.current - 1);
  let next = updateEntity(state, entityId, (e) =>
    e.hunger === undefined ? e : { ...e, hunger: { ...e.hunger, current } },
  );
  const events: GameEvent[] = [];
  const after = hungerLevel({ ...entity, hunger: { ...entity.hunger, current } });
  if (after !== before) {
    events.push({ type: "hunger-changed", entityId, level: after });
  }
  if (after === "starving" && state.turn % STARVATION_INTERVAL === 0) {
    next = applyDamage(next, entityId, 1);
    events.push({ type: "entity-damaged", entityId, amount: 1, source: "starvation" });
    const starved = findEntity(next, entityId);
    if (starved !== undefined && isDead(starved)) {
      const death = resolveDeath(next, starved, undefined);
      return { state: death.state, events: [...events, ...death.events] };
    }
  }
  return { state: next, events };
}

/** Restore nutrition, capped at the maximum. Reports a level change if eating ends hunger. */
export function feed(state: GameState, entityId: number, amount: number): HungerResult {
  const entity = findEntity(state, entityId);
  if (entity?.hunger === undefined) {
    return { state, events: [] };
  }
  const before = hungerLevel(entity);
  const current = Math.min(entity.hunger.max, entity.hunger.current + amount);
  const next = updateEntity(state, entityId, (e) =>
    e.hunger === undefined ? e : { ...e, hunger: { ...e.hunger, current } },
  );
  const after = hungerLevel({ ...entity, hunger: { ...entity.hunger, current } });
  return {
    state: next,
    events: after === before ? [] : [{ type: "hunger-changed", entityId, level: after }],
  };
}
