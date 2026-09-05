/**
 * Core type definitions: game state, entities, actions, and events.
 *
 * The state is immutable and serializable. Entities are plain records with
 * optional component fields; behaviour lives in systems under systems/.
 */

import type { StatusId } from "./data/effects";
import type { TrapId } from "./data/traps";
import type { ItemId } from "./data/items";
import type { Point } from "./grid";
import type { DungeonMap } from "./map/dungeon";
import type { RngState } from "./rng";
import type { HungerLevel } from "./systems/hunger";

export type EntityId = number;

export type EntityKind = "player" | "monster" | "item" | "trap";

export type HealthComponent = {
  readonly current: number;
  readonly max: number;
};

export type AttackComponent = {
  /** Inclusive damage range before the defender's defence is subtracted. */
  readonly min: number;
  readonly max: number;
  /** Probability in [0, 1] that a swing connects. */
  readonly accuracy: number;
};

export type RangedAttackComponent = AttackComponent & {
  /** Maximum Chebyshev distance at which the attack can be used. */
  readonly range: number;
};

/** How a monster decides what to do each turn. Implemented in systems/ai.ts. */
export type AiBehaviour = "chaser" | "ranged" | "erratic" | "ambusher" | "fleeing" | "boss";

export type AiComponent = {
  readonly behaviour: AiBehaviour;
  /** Where the monster last saw the player; it heads there when it loses sight. */
  readonly lastKnownPlayerPosition?: Point;
  /** Set once an ambusher has been triggered. */
  readonly alerted?: boolean;
  /** Set while a fleeing monster is retreating. */
  readonly fleeing?: boolean;
  /** Set on the turn a ranged monster backed away, so it stands and shoots on the next. */
  readonly backedOff?: boolean;
};

/** Nutrition points; see systems/hunger.ts for what the thresholds mean. */
export type HungerComponent = {
  readonly current: number;
  readonly max: number;
};

export type ExperienceComponent = {
  readonly level: number;
  readonly xp: number;
};

export type TrapComponent = {
  readonly id: TrapId;
  readonly hidden: boolean;
};

/** An item instance. Items on the floor are entities carrying one of these. */
export type Item = {
  /** Unique across the run so equipment can reference a specific instance. */
  readonly id: number;
  readonly defId: ItemId;
};

export type InventoryComponent = {
  readonly items: readonly Item[];
  readonly capacity: number;
};

export type EquipmentComponent = {
  /** Inventory item ids of the equipped pieces. */
  readonly weaponId?: number;
  readonly armourId?: number;
  readonly bowId?: number;
};

export type StatusInstance = {
  readonly id: StatusId;
  readonly turnsLeft: number;
};

/** A status a monster may inflict when its melee attack lands. */
export type OnHitStatus = {
  readonly status: StatusId;
  readonly turns: number;
  readonly chance: number;
};

export type Entity = {
  readonly id: EntityId;
  readonly kind: EntityKind;
  readonly name: string;
  readonly glyph: string;
  readonly color: string;
  readonly position: Point;
  /** Whether other creatures may not enter this entity's tile. */
  readonly blocksMovement: boolean;
  readonly health?: HealthComponent;
  readonly attack?: AttackComponent;
  readonly rangedAttack?: RangedAttackComponent;
  readonly defence?: number;
  readonly ai?: AiComponent;
  /** Behaviour tuning for "fleeing" monsters: fraction of max health that triggers retreat. */
  readonly fleeThreshold?: number;
  /** Behaviour tuning for "ranged" monsters: distance they try to keep. */
  readonly preferredRange?: number;
  /** Behaviour tuning for "erratic" monsters: probability of a random move. */
  readonly erraticChance?: number;
  /** Killing this entity wins the game. */
  readonly isBoss?: boolean;
  /** Experience awarded to the player for killing this entity. */
  readonly xpValue?: number;
  /** Item left behind when this entity dies. */
  readonly drop?: ItemId;
  readonly experience?: ExperienceComponent;
  readonly hunger?: HungerComponent;
  /** Sight radius for creatures that look for the player. */
  readonly sightRadius?: number;
  /** Present on floor items. */
  readonly item?: Item;
  /** Present on traps. Hidden traps are neither drawn nor avoided until found. */
  readonly trap?: TrapComponent;
  readonly inventory?: InventoryComponent;
  readonly equipment?: EquipmentComponent;
  readonly statuses?: readonly StatusInstance[];
  readonly onHit?: OnHitStatus;
};

export type LogTone = "info" | "combat" | "good" | "bad" | "system";

export type LogEntry = {
  readonly turn: number;
  readonly text: string;
  readonly tone: LogTone;
};

export type GameStatus = "playing" | "dead" | "won";

export type RunStats = {
  readonly kills: number;
  /** Deepest level reached during the run. */
  readonly maxDepth: number;
};

export type GameState = {
  readonly seed: number;
  readonly rng: RngState;
  readonly turn: number;
  readonly depth: number;
  readonly map: DungeonMap;
  readonly entities: readonly Entity[];
  readonly playerId: EntityId;
  readonly nextEntityId: EntityId;
  /** Counter used to allocate unique item ids across the run. */
  readonly nextItemId: number;
  readonly log: readonly LogEntry[];
  readonly status: GameStatus;
  readonly stats: RunStats;
  /** Kinds of potion and scroll the player has learned to recognize. */
  readonly identified: readonly ItemId[];
  /** What each unidentified kind looks like this run. */
  readonly appearances: Readonly<Partial<Record<ItemId, string>>>;
};

/** Something the player wants to do. Produced by the input layer. */
export type Action =
  | { readonly type: "move"; readonly direction: Point }
  | { readonly type: "wait" }
  | { readonly type: "descend" }
  | { readonly type: "pick-up" }
  /** Use a consumable or toggle equipment in the given inventory slot. */
  | { readonly type: "use-item"; readonly slot: number }
  | { readonly type: "drop-item"; readonly slot: number }
  /** Shoot the readied bow at a visible monster. */
  | { readonly type: "fire"; readonly targetId: EntityId }
  /** One step toward the nearest unexplored tile. Repeated by the client. */
  | { readonly type: "explore" }
  /** One step toward the known down staircase. Repeated by the client. */
  | { readonly type: "travel-to-stairs" }
  /** One step toward a chosen known tile. Repeated by the client. */
  | { readonly type: "travel"; readonly goal: Point }
  /** Wait one turn to recover health. Repeated by the client. */
  | { readonly type: "rest" };

/** Why a shot could not be taken. */
export type FireRefusal = "no-bow" | "no-target";

/** Why an automatic action (explore, travel, rest) could not start. */
export type AutoRefusal =
  | "monster-in-view"
  | "nothing-to-explore"
  | "stairs-unknown"
  | "no-route"
  | "already-there"
  | "full-health"
  | "poisoned";

/** Something that happened during a turn. Consumed by the renderer and message log. */
export type GameEvent =
  | {
      readonly type: "entity-moved";
      readonly entityId: EntityId;
      readonly from: Point;
      readonly to: Point;
    }
  | { readonly type: "entity-blocked"; readonly entityId: EntityId; readonly at: Point }
  | {
      readonly type: "attack-hit";
      readonly attackerId: EntityId;
      readonly defenderId: EntityId;
      readonly damage: number;
      readonly ranged: boolean;
    }
  | {
      readonly type: "attack-missed";
      readonly attackerId: EntityId;
      readonly defenderId: EntityId;
      readonly ranged: boolean;
    }
  | { readonly type: "entity-died"; readonly entityId: EntityId; readonly killerId?: EntityId }
  /** Damage from a non-attack source such as poison or a scroll. */
  | {
      readonly type: "entity-damaged";
      readonly entityId: EntityId;
      readonly amount: number;
      readonly source: string;
    }
  | { readonly type: "entity-healed"; readonly entityId: EntityId; readonly amount: number }
  | { readonly type: "item-picked-up"; readonly entityId: EntityId; readonly item: Item }
  | { readonly type: "item-dropped"; readonly entityId: EntityId; readonly item: Item }
  | { readonly type: "item-used"; readonly entityId: EntityId; readonly item: Item }
  /** Using an unknown kind of item revealed what it is. */
  | { readonly type: "item-identified"; readonly item: Item }
  | { readonly type: "level-mapped" }
  | { readonly type: "item-equipped"; readonly entityId: EntityId; readonly item: Item }
  | { readonly type: "item-unequipped"; readonly entityId: EntityId; readonly item: Item }
  | { readonly type: "inventory-full"; readonly entityId: EntityId }
  | { readonly type: "nothing-here"; readonly entityId: EntityId }
  | { readonly type: "status-applied"; readonly entityId: EntityId; readonly status: StatusId }
  | { readonly type: "status-expired"; readonly entityId: EntityId; readonly status: StatusId }
  | { readonly type: "hunger-changed"; readonly entityId: EntityId; readonly level: HungerLevel }
  | { readonly type: "door-opened"; readonly entityId: EntityId; readonly at: Point }
  | {
      readonly type: "trap-triggered";
      readonly entityId: EntityId;
      readonly trap: TrapId;
      readonly at: Point;
    }
  | { readonly type: "trap-found"; readonly trap: TrapId; readonly at: Point }
  | { readonly type: "entity-teleported"; readonly entityId: EntityId; readonly to: Point }
  | { readonly type: "level-descended"; readonly depth: number }
  | { readonly type: "no-stairs-here" }
  | { readonly type: "auto-refused"; readonly reason: AutoRefusal; readonly entityId?: EntityId }
  | { readonly type: "fire-refused"; readonly reason: FireRefusal }
  | { readonly type: "player-levelled-up"; readonly level: number }
  | { readonly type: "game-won" }
  | { readonly type: "message"; readonly text: string; readonly tone: LogTone };

export type TurnResult = {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
};
