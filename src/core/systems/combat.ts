/**
 * Combat system: melee attack resolution, damage, and death.
 *
 * Damage is a roll in the attacker's [min, max] range minus the defender's
 * defence, floored at 1 so every hit matters. Death removes the entity
 * (except the player, whose corpse stays for the death screen).
 */

import { removeEntity, updateEntity } from "../entity";
import { chebyshevDistance } from "../grid";
import { isVisibleAt } from "../map/dungeon";
import { type RngState, chance, nextInt } from "../rng";
import type { AttackComponent, Entity, GameEvent, GameState } from "../types";
import { hasLineOfSight } from "./fov";
import { effectiveAttack, effectiveDefence, effectiveRanged } from "./items";
import { applyStatus } from "./status";

export const MIN_DAMAGE = 1;

export type CombatResult = {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
};

/** Roll the damage for one hit. Pure: returns the value and the advanced RNG. */
export function rollDamage(
  rng: RngState,
  attacker: Entity,
  defender: Entity,
  attack: AttackComponent = effectiveAttack(attacker),
): { readonly rng: RngState; readonly damage: number } {
  const roll = nextInt(rng, attack.min, attack.max);
  const defence = effectiveDefence(defender);
  return { rng: roll.rng, damage: Math.max(MIN_DAMAGE, roll.value - defence) };
}

/** Apply damage to an entity. Does not remove dead entities; see `resolveDeath`. */
export function applyDamage(state: GameState, targetId: number, amount: number): GameState {
  return updateEntity(state, targetId, (e) => {
    if (e.health === undefined) {
      return e;
    }
    return { ...e, health: { ...e.health, current: Math.max(0, e.health.current - amount) } };
  });
}

export function isDead(entity: Entity): boolean {
  return entity.health !== undefined && entity.health.current <= 0;
}

/**
 * Handle an entity whose health has reached zero. Monsters are removed and
 * award experience to the player if the player was the killer. The player
 * is left in place and the game status becomes "dead".
 */
export function resolveDeath(
  state: GameState,
  victim: Entity,
  killerId: number | undefined,
): CombatResult {
  const events: GameEvent[] = [
    killerId === undefined
      ? { type: "entity-died", entityId: victim.id }
      : { type: "entity-died", entityId: victim.id, killerId },
  ];
  if (victim.id === state.playerId) {
    return { state: { ...state, status: "dead" }, events };
  }
  let next = removeEntity(state, victim.id);
  if (victim.isBoss === true) {
    next = { ...next, status: "won" };
    events.push({ type: "game-won" });
  }
  if (killerId === state.playerId) {
    next = { ...next, stats: { ...next.stats, kills: next.stats.kills + 1 } };
    const xp = victim.xpValue ?? 0;
    if (xp > 0) {
      next = updateEntity(next, state.playerId, (p) =>
        p.experience === undefined
          ? p
          : { ...p, experience: { ...p.experience, xp: p.experience.xp + xp } },
      );
    }
  }
  return { state: next, events };
}

function resolveAttack(
  state: GameState,
  attacker: Entity,
  defender: Entity,
  attack: AttackComponent,
  ranged: boolean,
): CombatResult {
  const hitRoll = chance(state.rng, attack.accuracy);
  let next: GameState = { ...state, rng: hitRoll.rng };
  if (!hitRoll.value) {
    return {
      state: next,
      events: [{ type: "attack-missed", attackerId: attacker.id, defenderId: defender.id, ranged }],
    };
  }

  const dmg = rollDamage(next.rng, attacker, defender, attack);
  next = applyDamage({ ...next, rng: dmg.rng }, defender.id, dmg.damage);
  const events: GameEvent[] = [
    {
      type: "attack-hit",
      attackerId: attacker.id,
      defenderId: defender.id,
      damage: dmg.damage,
      ranged,
    },
  ];

  const wounded = next.entities.find((e) => e.id === defender.id);
  if (wounded !== undefined && isDead(wounded)) {
    const death = resolveDeath(next, wounded, attacker.id);
    return { state: death.state, events: [...events, ...death.events] };
  }

  // Melee hits may carry a status (poison, confusion).
  if (!ranged && attacker.onHit !== undefined) {
    const roll = chance(next.rng, attacker.onHit.chance);
    next = { ...next, rng: roll.rng };
    if (roll.value) {
      const applied = applyStatus(next, defender.id, attacker.onHit.status, attacker.onHit.turns);
      next = applied.state;
      events.push(...applied.events);
    }
  }
  return { state: next, events };
}

/** Resolve one melee attack from attacker to defender, including a possible kill. */
export function meleeAttack(state: GameState, attacker: Entity, defender: Entity): CombatResult {
  return resolveAttack(state, attacker, defender, effectiveAttack(attacker), false);
}

/** Whether `shooter` can hit `target` with its readied bow: in range, in view, with a clear line. */
export function canShoot(state: GameState, shooter: Entity, target: Entity): boolean {
  const bow = effectiveRanged(shooter);
  if (bow === undefined || target.kind !== "monster") {
    return false;
  }
  if (chebyshevDistance(shooter.position, target.position) > bow.range) {
    return false;
  }
  return (
    isVisibleAt(state.map, target.position) &&
    hasLineOfSight(state.map, shooter.position, target.position)
  );
}

/** Shoot the readied bow. The caller checks `canShoot` first. */
export function shoot(state: GameState, shooter: Entity, target: Entity): CombatResult {
  const bow = effectiveRanged(shooter);
  if (bow === undefined) {
    return { state, events: [] };
  }
  return resolveAttack(state, shooter, target, bow, true);
}

/** Resolve one ranged attack. Falls back to the melee profile if the attacker has no ranged one. */
export function rangedAttack(state: GameState, attacker: Entity, defender: Entity): CombatResult {
  const attack = attacker.rangedAttack ?? attacker.attack ?? { min: 1, max: 1, accuracy: 1 };
  return resolveAttack(state, attacker, defender, attack, true);
}
