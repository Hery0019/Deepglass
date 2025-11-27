/**
 * Core type definitions: game state, entities, actions, and events.
 *
 * The state is immutable and serializable. Entities are plain records with
 * optional component fields; behaviour lives in systems under systems/.
 */

import type { Point } from "./grid";
import type { DungeonMap } from "./map/dungeon";
import type { RngState } from "./rng";

export type EntityId = number;

export type EntityKind = "player" | "monster" | "item";

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

/** How a monster decides what to do each turn. Implemented in systems/ai.ts. */
export type AiBehaviour = "chaser";

export type AiComponent = {
  readonly behaviour: AiBehaviour;
  /** Where the monster last saw the player; it heads there when it loses sight. */
  readonly lastKnownPlayerPosition?: Point;
};

export type ExperienceComponent = {
  readonly level: number;
  readonly xp: number;
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
  readonly defence?: number;
  readonly ai?: AiComponent;
  /** Experience awarded to the player for killing this entity. */
  readonly xpValue?: number;
  readonly experience?: ExperienceComponent;
  /** Sight radius for creatures that look for the player. */
  readonly sightRadius?: number;
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
  readonly log: readonly LogEntry[];
  readonly status: GameStatus;
  readonly stats: RunStats;
};

/** Something the player wants to do. Produced by the input layer. */
export type Action =
  { readonly type: "move"; readonly direction: Point } | { readonly type: "wait" };

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
    }
  | { readonly type: "attack-missed"; readonly attackerId: EntityId; readonly defenderId: EntityId }
  | { readonly type: "entity-died"; readonly entityId: EntityId; readonly killerId?: EntityId }
  | { readonly type: "message"; readonly text: string; readonly tone: LogTone };

export type TurnResult = {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
};
