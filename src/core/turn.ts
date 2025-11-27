/**
 * The turn function. `applyAction(state, action)` is the whole game: it
 * resolves the player's action and then every other entity's response, and
 * returns the new state plus the events that describe what happened.
 *
 * It is pure and deterministic: identical inputs produce identical outputs.
 */

import { blockingEntityAt, getPlayer, spawnEntity } from "./entity";
import { addPoints } from "./grid";
import { createLevel } from "./level";
import { describeEvent } from "./messages";
import { type RngState, seedRng } from "./rng";
import { runMonsterTurn } from "./systems/ai";
import { meleeAttack } from "./systems/combat";
import { PLAYER_SIGHT_RADIUS, updateVisibility } from "./systems/fov";
import { moveEntity } from "./systems/movement";
import type { Action, Entity, GameEvent, GameState, LogEntry, TurnResult } from "./types";

export const PLAYER_ID = 1;

export const PLAYER_BASE = {
  health: 20,
  attackMin: 2,
  attackMax: 5,
  accuracy: 0.85,
  defence: 0,
} as const;

export function createPlayer(position: Entity["position"]): Entity {
  return {
    id: PLAYER_ID,
    kind: "player",
    name: "you",
    glyph: "@",
    color: "#ffffff",
    position,
    blocksMovement: true,
    health: { current: PLAYER_BASE.health, max: PLAYER_BASE.health },
    attack: {
      min: PLAYER_BASE.attackMin,
      max: PLAYER_BASE.attackMax,
      accuracy: PLAYER_BASE.accuracy,
    },
    defence: PLAYER_BASE.defence,
    experience: { level: 1, xp: 0 },
    sightRadius: PLAYER_SIGHT_RADIUS,
  };
}

export function createGame(seed: number): GameState {
  const rng: RngState = seedRng(seed);
  const level = createLevel(rng, 1);
  const map = updateVisibility(level.map, level.map.spawn, PLAYER_SIGHT_RADIUS);
  let state: GameState = {
    seed,
    rng: level.rng,
    turn: 0,
    depth: 1,
    map,
    entities: [createPlayer(map.spawn)],
    playerId: PLAYER_ID,
    nextEntityId: PLAYER_ID + 1,
    log: [{ turn: 0, text: "You descend into the dungeon.", tone: "system" }],
    status: "playing",
    stats: { kills: 0 },
  };
  for (const monster of level.monsters) {
    state = spawnEntity(state, monster).state;
  }
  return state;
}

const MAX_LOG_ENTRIES = 200;

/** Append log entries derived from events, using `before` to name entities that died. */
function appendLog(before: GameState, state: GameState, events: readonly GameEvent[]): GameState {
  const entries: LogEntry[] = [];
  for (const event of events) {
    const entry = describeEvent(before, event);
    if (entry !== null) {
      entries.push(entry);
    }
  }
  if (entries.length === 0) {
    return state;
  }
  const log = [...state.log, ...entries];
  return { ...state, log: log.length > MAX_LOG_ENTRIES ? log.slice(-MAX_LOG_ENTRIES) : log };
}

type PhaseResult = {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
  readonly tookTurn: boolean;
};

function resolvePlayerAction(state: GameState, action: Action): PhaseResult {
  const player = getPlayer(state);
  switch (action.type) {
    case "move": {
      const target = addPoints(player.position, action.direction);
      const blocker = blockingEntityAt(state, target);
      if (blocker?.kind === "monster") {
        const combat = meleeAttack(state, player, blocker);
        return { state: combat.state, events: combat.events, tookTurn: true };
      }
      const result = moveEntity(state, player, action.direction);
      const moved = result.events.some((e) => e.type === "entity-moved");
      return { state: result.state, events: result.events, tookTurn: moved };
    }
    case "wait":
      return { state, events: [], tookTurn: true };
  }
}

/** Every monster acts once, in id order. Monsters killed earlier in the phase do not act. */
function resolveMonsterPhase(state: GameState): PhaseResult {
  let next = state;
  const events: GameEvent[] = [];
  const monsterIds = state.entities.filter((e) => e.kind === "monster").map((e) => e.id);
  for (const id of monsterIds) {
    if (next.status !== "playing") {
      break;
    }
    const monster = next.entities.find((e) => e.id === id);
    if (monster === undefined) {
      continue;
    }
    const result = runMonsterTurn(next, monster);
    next = result.state;
    events.push(...result.events);
  }
  return { state: next, events, tookTurn: true };
}

/** Recompute the player's field of view after everything has moved. */
function refreshPlayerVision(state: GameState): GameState {
  const player = getPlayer(state);
  return { ...state, map: updateVisibility(state.map, player.position, PLAYER_SIGHT_RADIUS) };
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
    return { state: appendLog(state, next, events), events };
  }

  if (next.status === "playing") {
    const monsterPhase = resolveMonsterPhase(next);
    next = monsterPhase.state;
    events.push(...monsterPhase.events);
  }

  next = { ...next, turn: next.turn + 1 };
  next = refreshPlayerVision(next);
  return { state: appendLog(state, next, events), events };
}
