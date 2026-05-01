/**
 * Items system: pickup, drop, use, and equipment. Also derives effective
 * combat stats from base stats plus equipped gear.
 */

import { ITEMS, type ItemDef } from "../data/items";
import { entitiesAt, getPlayer, removeEntity, spawnEntity, updateEntity } from "../entity";
import { chebyshevDistance } from "../grid";
import { type RngState, nextInt } from "../rng";
import type {
  AttackComponent,
  Entity,
  GameEvent,
  GameState,
  Item,
  RangedAttackComponent,
} from "../types";
import { applyDamage, isDead, resolveDeath } from "./combat";
import { hasLineOfSight } from "./fov";
import { feed } from "./hunger";
import { applyStatus, removeStatus } from "./status";

export type ItemResult = {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
  /** False when the action was impossible and should not consume a turn. */
  readonly tookTurn: boolean;
};

export const INVENTORY_CAPACITY = 10;

export function itemDef(item: Item): ItemDef {
  return ITEMS[item.defId];
}

export function equippedWeapon(entity: Entity): Item | undefined {
  const id = entity.equipment?.weaponId;
  return id === undefined ? undefined : entity.inventory?.items.find((i) => i.id === id);
}

export function equippedArmour(entity: Entity): Item | undefined {
  const id = entity.equipment?.armourId;
  return id === undefined ? undefined : entity.inventory?.items.find((i) => i.id === id);
}

export function equippedBow(entity: Entity): Item | undefined {
  const id = entity.equipment?.bowId;
  return id === undefined ? undefined : entity.inventory?.items.find((i) => i.id === id);
}

export function isEquipped(entity: Entity, item: Item): boolean {
  const equipment = entity.equipment;
  return (
    equipment?.weaponId === item.id ||
    equipment?.armourId === item.id ||
    equipment?.bowId === item.id
  );
}

/** Ranged attack profile from the readied bow, or undefined without one. */
export function effectiveRanged(entity: Entity): RangedAttackComponent | undefined {
  const bow = equippedBow(entity);
  const stats = bow === undefined ? undefined : itemDef(bow).bow;
  if (stats === undefined) {
    return undefined;
  }
  const base = entity.attack ?? { min: 1, max: 1, accuracy: 1 };
  const armour = equippedArmour(entity);
  const penalty = armour === undefined ? 0 : (itemDef(armour).armour?.accuracyPenalty ?? 0);
  return {
    min: stats.min,
    max: stats.max,
    accuracy: Math.min(1, Math.max(0.05, base.accuracy + stats.accuracyBonus - penalty)),
    range: stats.range,
  };
}

/** Attack profile after applying the equipped weapon and armour penalty. */
export function effectiveAttack(entity: Entity): AttackComponent {
  const base = entity.attack ?? { min: 1, max: 1, accuracy: 1 };
  const weapon = equippedWeapon(entity);
  const armour = equippedArmour(entity);
  const weaponStats = weapon === undefined ? undefined : itemDef(weapon).weapon;
  const armourStats = armour === undefined ? undefined : itemDef(armour).armour;
  const accuracy =
    base.accuracy + (weaponStats?.accuracyBonus ?? 0) - (armourStats?.accuracyPenalty ?? 0);
  return {
    min: weaponStats?.min ?? base.min,
    max: weaponStats?.max ?? base.max,
    accuracy: Math.min(1, Math.max(0.05, accuracy)),
  };
}

/** Defence after applying equipped armour. */
export function effectiveDefence(entity: Entity): number {
  const armour = equippedArmour(entity);
  const bonus = armour === undefined ? 0 : (itemDef(armour).armour?.defence ?? 0);
  return (entity.defence ?? 0) + bonus;
}

/** Pick up the first item on the player's tile. */
export function pickUp(state: GameState): ItemResult {
  const player = getPlayer(state);
  const floorItem = entitiesAt(state, player.position).find((e) => e.kind === "item");
  if (floorItem?.item === undefined) {
    return { state, events: [{ type: "nothing-here", entityId: player.id }], tookTurn: false };
  }
  const inventory = player.inventory ?? { items: [], capacity: INVENTORY_CAPACITY };
  if (inventory.items.length >= inventory.capacity) {
    return { state, events: [{ type: "inventory-full", entityId: player.id }], tookTurn: false };
  }
  const item = floorItem.item;
  let next = removeEntity(state, floorItem.id);
  next = updateEntity(next, player.id, (p) => ({
    ...p,
    inventory: { ...inventory, items: [...inventory.items, item] },
  }));
  return {
    state: next,
    events: [{ type: "item-picked-up", entityId: player.id, item }],
    tookTurn: true,
  };
}

function slotItem(player: Entity, slot: number): Item | undefined {
  return player.inventory?.items[slot];
}

/** Drop the item in a slot onto the player's tile, unequipping it first if needed. */
export function dropItem(state: GameState, slot: number): ItemResult {
  const player = getPlayer(state);
  const item = slotItem(player, slot);
  if (item === undefined || player.inventory === undefined) {
    return { state, events: [], tookTurn: false };
  }
  const events: GameEvent[] = [];
  let next = state;
  if (isEquipped(player, item)) {
    next = unequip(next, player.id, item);
    events.push({ type: "item-unequipped", entityId: player.id, item });
  }
  next = updateEntity(next, player.id, (p) => ({
    ...p,
    inventory: {
      ...(p.inventory ?? { items: [], capacity: INVENTORY_CAPACITY }),
      items: (p.inventory?.items ?? []).filter((i) => i.id !== item.id),
    },
  }));
  const def = itemDef(item);
  next = spawnEntity(next, {
    kind: "item",
    name: def.name,
    glyph: def.glyph,
    color: def.color,
    position: player.position,
    blocksMovement: false,
    item,
  }).state;
  events.push({ type: "item-dropped", entityId: player.id, item });
  return { state: next, events, tookTurn: true };
}

function unequip(state: GameState, entityId: number, item: Item): GameState {
  return updateEntity(state, entityId, (e) => {
    const equipment = { ...(e.equipment ?? {}) };
    if (equipment.weaponId === item.id) {
      delete equipment.weaponId;
    }
    if (equipment.armourId === item.id) {
      delete equipment.armourId;
    }
    if (equipment.bowId === item.id) {
      delete equipment.bowId;
    }
    return { ...e, equipment };
  });
}

function equip(state: GameState, entityId: number, item: Item): GameState {
  const def = itemDef(item);
  return updateEntity(state, entityId, (e) => {
    const equipment = { ...(e.equipment ?? {}) };
    if (def.category === "weapon") {
      equipment.weaponId = item.id;
    } else if (def.category === "armour") {
      equipment.armourId = item.id;
    } else if (def.category === "bow") {
      equipment.bowId = item.id;
    }
    return { ...e, equipment };
  });
}

/** Use the item in a slot: consumables are consumed, equipment is toggled. */
export function useItem(state: GameState, slot: number): ItemResult {
  const player = getPlayer(state);
  const item = slotItem(player, slot);
  if (item === undefined) {
    return { state, events: [], tookTurn: false };
  }
  const def = itemDef(item);

  if (def.category === "weapon" || def.category === "armour" || def.category === "bow") {
    if (isEquipped(player, item)) {
      return {
        state: unequip(state, player.id, item),
        events: [{ type: "item-unequipped", entityId: player.id, item }],
        tookTurn: true,
      };
    }
    return {
      state: equip(state, player.id, item),
      events: [{ type: "item-equipped", entityId: player.id, item }],
      tookTurn: true,
    };
  }

  if (def.effect === undefined) {
    return { state, events: [], tookTurn: false };
  }
  const consumed = updateEntity(state, player.id, (p) => ({
    ...p,
    inventory: {
      ...(p.inventory ?? { items: [], capacity: INVENTORY_CAPACITY }),
      items: (p.inventory?.items ?? []).filter((i) => i.id !== item.id),
    },
  }));
  const events: GameEvent[] = [{ type: "item-used", entityId: player.id, item }];
  const applied = applyEffect(consumed, player.id, def);
  return { state: applied.state, events: [...events, ...applied.events], tookTurn: true };
}

type EffectResult = { readonly state: GameState; readonly events: readonly GameEvent[] };

/** Monsters within `radius` of the user that the user can see. */
function creaturesInBlast(state: GameState, user: Entity, radius: number): Entity[] {
  return state.entities.filter(
    (e) =>
      e.kind === "monster" &&
      e.health !== undefined &&
      chebyshevDistance(e.position, user.position) <= radius &&
      hasLineOfSight(state.map, user.position, e.position),
  );
}

function applyEffect(state: GameState, userId: number, def: ItemDef): EffectResult {
  const effect = def.effect;
  const user = state.entities.find((e) => e.id === userId);
  if (effect === undefined || user === undefined) {
    return { state, events: [] };
  }
  switch (effect.type) {
    case "feed":
      return feed(state, userId, effect.amount);
    case "heal": {
      let next = state;
      const events: GameEvent[] = [];
      const health = user.health;
      if (health !== undefined) {
        const healed = Math.min(effect.amount, health.max - health.current);
        next = updateEntity(next, userId, (e) =>
          e.health === undefined
            ? e
            : { ...e, health: { ...e.health, current: e.health.current + healed } },
        );
        events.push({ type: "entity-healed", entityId: userId, amount: healed });
      }
      for (const status of effect.cures) {
        const cured = removeStatus(next, userId, status);
        next = cured.state;
        events.push(...cured.events);
      }
      return { state: next, events };
    }
    case "area-damage": {
      let next = state;
      let rng: RngState = state.rng;
      const events: GameEvent[] = [];
      for (const victim of creaturesInBlast(state, user, effect.radius)) {
        const roll = nextInt(rng, effect.min, effect.max);
        rng = roll.rng;
        next = applyDamage(next, victim.id, roll.value);
        events.push({
          type: "entity-damaged",
          entityId: victim.id,
          amount: roll.value,
          source: def.name,
        });
        const wounded = next.entities.find((e) => e.id === victim.id);
        if (wounded !== undefined && isDead(wounded)) {
          const death = resolveDeath(next, wounded, userId);
          next = death.state;
          events.push(...death.events);
        }
      }
      return { state: { ...next, rng }, events };
    }
    case "area-status": {
      let next = state;
      const events: GameEvent[] = [];
      for (const victim of creaturesInBlast(state, user, effect.radius)) {
        const applied = applyStatus(next, victim.id, effect.status, effect.turns);
        next = applied.state;
        events.push(...applied.events);
      }
      return { state: next, events };
    }
  }
}
