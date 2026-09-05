/**
 * Status effects: application, stacking, per-turn ticking, and expiry.
 *
 * Stacking rule: reapplying a status the entity already has extends its
 * duration to the longer of the two; it never doubles the effect.
 */

import { STATUS_EFFECTS, type StatusId } from "../data/effects";
import { findEntity, updateEntity } from "../entity";
import type { Entity, GameEvent, GameState, StatusInstance } from "../types";
import { applyDamage, isDead, resolveDeath } from "./combat";

export type StatusResult = {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
};

export function hasStatus(entity: Entity, status: StatusId): boolean {
  return entity.statuses?.some((s) => s.id === status) ?? false;
}

/** Apply a status. Emits "status-applied" only when the entity did not already have it. */
export function applyStatus(
  state: GameState,
  entityId: number,
  status: StatusId,
  turns: number,
): StatusResult {
  const target = findEntity(state, entityId);
  if (target?.health === undefined) {
    return { state, events: [] };
  }
  const existing = target.statuses ?? [];
  const already = existing.find((s) => s.id === status);
  const statuses: StatusInstance[] =
    already === undefined
      ? [...existing, { id: status, turnsLeft: turns }]
      : existing.map((s) =>
          s.id === status ? { ...s, turnsLeft: Math.max(s.turnsLeft, turns) } : s,
        );
  const next = updateEntity(state, entityId, (e) => ({ ...e, statuses }));
  const events: GameEvent[] =
    already === undefined ? [{ type: "status-applied", entityId, status }] : [];
  return { state: next, events };
}

/** Remove a status outright (for example when a potion cures poison). */
export function removeStatus(state: GameState, entityId: number, status: StatusId): StatusResult {
  const target = findEntity(state, entityId);
  if (target === undefined || !hasStatus(target, status)) {
    return { state, events: [] };
  }
  const next = updateEntity(state, entityId, (e) => ({
    ...e,
    statuses: (e.statuses ?? []).filter((s) => s.id !== status),
  }));
  return { state: next, events: [{ type: "status-expired", entityId, status }] };
}

/** Tick every status on one entity: apply per-turn effects, then count down and expire. */
export function tickStatuses(state: GameState, entityId: number): StatusResult {
  const entity = findEntity(state, entityId);
  if (entity?.statuses === undefined || entity.statuses.length === 0) {
    return { state, events: [] };
  }
  let next = state;
  const events: GameEvent[] = [];

  for (const instance of entity.statuses) {
    const def = STATUS_EFFECTS[instance.id];
    if (def.damagePerTurn !== undefined && def.damagePerTurn > 0) {
      next = applyDamage(next, entityId, def.damagePerTurn);
      events.push({
        type: "entity-damaged",
        entityId,
        amount: def.damagePerTurn,
        source: def.label,
      });
    }
  }

  const damaged = findEntity(next, entityId);
  if (damaged !== undefined && isDead(damaged)) {
    const death = resolveDeath(next, damaged, undefined);
    return { state: death.state, events: [...events, ...death.events] };
  }

  const remaining: StatusInstance[] = [];
  for (const instance of entity.statuses) {
    const turnsLeft = instance.turnsLeft - 1;
    if (turnsLeft <= 0) {
      events.push({ type: "status-expired", entityId, status: instance.id });
    } else {
      remaining.push({ ...instance, turnsLeft });
    }
  }
  next = updateEntity(next, entityId, (e) => {
    if (remaining.length === 0) {
      const { statuses, ...rest } = e;
      return rest;
    }
    return { ...e, statuses: remaining };
  });
  return { state: next, events };
}

/** Tick statuses for every living entity, in entity order. */
export function tickAllStatuses(state: GameState): StatusResult {
  let next = state;
  const events: GameEvent[] = [];
  const ids = state.entities
    .filter((e) => e.statuses !== undefined && e.statuses.length > 0)
    .map((e) => e.id);
  for (const id of ids) {
    const result = tickStatuses(next, id);
    next = result.state;
    events.push(...result.events);
  }
  return { state: next, events };
}

/** Whether the entity's chosen movement should be scrambled this turn. */
export function isMovementScrambled(entity: Entity): boolean {
  return (entity.statuses ?? []).some((s) => STATUS_EFFECTS[s.id].scramblesMovement === true);
}
