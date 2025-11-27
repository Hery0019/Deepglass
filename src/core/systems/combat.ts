/**
 * Combat system: melee attack resolution, damage, and death.
 *
 * Damage is a roll in the attacker's [min, max] range minus the defender's
 * defence, floored at 1 so every hit matters. Death removes the entity
 * (except the player, whose corpse stays for the death screen).
 */

import { removeEntity, updateEntity } from "../entity";
import { type RngState, chance, nextInt } from "../rng";
import type { Entity, GameEvent, GameState } from "../types";

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
): { readonly rng: RngState; readonly damage: number } {
  const attack = attacker.attack ?? { min: 1, max: 1, accuracy: 1 };
  const roll = nextInt(rng, attack.min, attack.max);
  const defence = defender.defence ?? 0;
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

/** Resolve one melee attack from attacker to defender, including a possible kill. */
export function meleeAttack(state: GameState, attacker: Entity, defender: Entity): CombatResult {
  const attack = attacker.attack ?? { min: 1, max: 1, accuracy: 1 };
  const hitRoll = chance(state.rng, attack.accuracy);
  let next: GameState = { ...state, rng: hitRoll.rng };
  if (!hitRoll.value) {
    return {
      state: next,
      events: [{ type: "attack-missed", attackerId: attacker.id, defenderId: defender.id }],
    };
  }

  const dmg = rollDamage(next.rng, attacker, defender);
  next = applyDamage({ ...next, rng: dmg.rng }, defender.id, dmg.damage);
  const events: GameEvent[] = [
    { type: "attack-hit", attackerId: attacker.id, defenderId: defender.id, damage: dmg.damage },
  ];

  const wounded = next.entities.find((e) => e.id === defender.id);
  if (wounded !== undefined && isDead(wounded)) {
    const death = resolveDeath(next, wounded, attacker.id);
    return { state: death.state, events: [...events, ...death.events] };
  }
  return { state: next, events };
}
