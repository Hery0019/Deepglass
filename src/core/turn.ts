/**
 * The turn function. `applyAction(state, action)` is the whole game: it
 * resolves the player's action and then every other entity's response, and
 * returns the new state plus the events that describe what happened.
 *
 * It is pure and deterministic: identical inputs produce identical outputs.
 */

import { getPlayer } from "./entity";
import { generateMap } from "./map/generate";
import { type RngState, seedRng } from "./rng";
import { moveEntity } from "./systems/movement";
import type { Action, Entity, GameEvent, GameState, LogEntry, TurnResult } from "./types";

export const PLAYER_ID = 1;

export function createGame(seed: number): GameState {
  const rng: RngState = seedRng(seed);
  const generated = generateMap(rng);
  // Field of view arrives in a later phase; until then the whole level is revealed.
  const revealed = new Array<boolean>(generated.map.width * generated.map.height).fill(true);
  const map = { ...generated.map, visible: revealed, explored: revealed };
  const player: Entity = {
    id: PLAYER_ID,
    kind: "player",
    name: "you",
    glyph: "@",
    color: "#ffffff",
    position: map.spawn,
    blocksMovement: true,
    health: { current: 20, max: 20 },
  };
  return {
    seed,
    rng: generated.rng,
    turn: 0,
    depth: 1,
    map,
    entities: [player],
    playerId: PLAYER_ID,
    nextEntityId: PLAYER_ID + 1,
    log: [{ turn: 0, text: "You descend into the dungeon.", tone: "system" }],
    status: "playing",
  };
}

const MAX_LOG_ENTRIES = 200;

/** Append log entries derived from events. Only events with player-facing text produce a line. */
function appendLog(state: GameState, events: readonly GameEvent[]): GameState {
  const entries: LogEntry[] = [];
  for (const event of events) {
    if (event.type === "message") {
      entries.push({ turn: state.turn, text: event.text, tone: event.tone });
    }
  }
  if (entries.length === 0) {
    return state;
  }
  const log = [...state.log, ...entries];
  return { ...state, log: log.length > MAX_LOG_ENTRIES ? log.slice(-MAX_LOG_ENTRIES) : log };
}

function resolvePlayerAction(
  state: GameState,
  action: Action,
): {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
  readonly tookTurn: boolean;
} {
  const player = getPlayer(state);
  switch (action.type) {
    case "move": {
      const result = moveEntity(state, player, action.direction);
      const moved = result.events.some((e) => e.type === "entity-moved");
      return { state: result.state, events: result.events, tookTurn: moved };
    }
    case "wait":
      return {
        state,
        events: [{ type: "message", text: "You wait.", tone: "info" }],
        tookTurn: true,
      };
  }
}

export function applyAction(state: GameState, action: Action): TurnResult {
  if (state.status !== "playing") {
    return { state, events: [] };
  }

  const playerPhase = resolvePlayerAction(state, action);
  let next = playerPhase.state;
  const events: GameEvent[] = [...playerPhase.events];

  if (!playerPhase.tookTurn) {
    // Bumping into a wall costs no time.
    return { state: appendLog(next, events), events };
  }

  next = { ...next, turn: next.turn + 1 };
  return { state: appendLog(next, events), events };
}
