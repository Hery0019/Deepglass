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
};

export type LogTone = "info" | "combat" | "good" | "bad" | "system";

export type LogEntry = {
  readonly turn: number;
  readonly text: string;
  readonly tone: LogTone;
};

export type GameStatus = "playing" | "dead" | "won";

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
  | { readonly type: "message"; readonly text: string; readonly tone: LogTone };

export type TurnResult = {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
};
