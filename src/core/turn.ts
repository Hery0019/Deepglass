/**
 * The turn function. `applyAction(state, action)` is the whole game: it
 * resolves the player's action and then every other entity's response, and
 * returns the new state plus the events that describe what happened.
 *
 * It is pure and deterministic: identical inputs produce identical outputs.
 */

import { blockingEntityAt, getPlayer, spawnEntity, updateEntity } from "./entity";
import { DIRECTIONS_8, addPoints, pointsEqual } from "./grid";
import { FINAL_DEPTH, createLevel } from "./level";
import { describeEvent } from "./messages";
import { type RngState, pick, seedRng } from "./rng";
import { runMonsterTurn } from "./systems/ai";
import { meleeAttack } from "./systems/combat";
import { PLAYER_SIGHT_RADIUS, updateVisibility } from "./systems/fov";
import { HUNGER_MAX, HUNGER_START, hungerBlocksRegen, tickHunger } from "./systems/hunger";
import { INVENTORY_CAPACITY, dropItem, pickUp, useItem } from "./systems/items";
import {
  exploreStep,
  isOnStairs,
  stairsKnown,
  travelStep,
  visibleMonsters,
} from "./systems/explore";
import { moveEntity } from "./systems/movement";
import { applyLevelUps } from "./systems/progression";
import { hasStatus, isMovementScrambled, tickAllStatuses } from "./systems/status";
import { searchForTraps, triggerTrapUnderPlayer } from "./systems/traps";
import type {
  Action,
  AutoRefusal,
  Entity,
  GameEvent,
  GameState,
  LogEntry,
  TurnResult,
} from "./types";

export const PLAYER_ID = 1;

export const PLAYER_BASE = {
  health: 30,
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
    hunger: { current: HUNGER_START, max: HUNGER_MAX },
    sightRadius: PLAYER_SIGHT_RADIUS,
    inventory: { items: [], capacity: INVENTORY_CAPACITY },
    equipment: {},
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
    nextItemId: level.nextItemId,
    log: [{ turn: 0, text: "You descend into the dungeon.", tone: "system" }],
    status: "playing",
    stats: { kills: 0, maxDepth: 1 },
  };
  for (const monster of level.monsters) {
    state = spawnEntity(state, monster).state;
  }
  for (const item of level.items) {
    state = spawnEntity(state, item).state;
  }
  for (const trap of level.traps) {
    state = spawnEntity(state, trap).state;
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

function resolveMove(state: GameState, requested: Entity["position"]): PhaseResult {
  const player = getPlayer(state);
  let current = state;
  let direction = requested;
  const scrambled = isMovementScrambled(player);
  if (scrambled) {
    const roll = pick(current.rng, DIRECTIONS_8);
    current = { ...current, rng: roll.rng };
    direction = roll.value;
  }
  const target = addPoints(player.position, direction);
  const blocker = blockingEntityAt(current, target);
  if (blocker?.kind === "monster") {
    const combat = meleeAttack(current, player, blocker);
    return { state: combat.state, events: combat.events, tookTurn: true };
  }
  const result = moveEntity(current, player, direction);
  const moved = result.events.some((e) => e.type === "entity-moved");
  const opened = result.events.some((e) => e.type === "door-opened");
  if (!moved) {
    // Bumping into a wall costs no time, but opening a door or a confused stumble does.
    return { state: result.state, events: result.events, tookTurn: opened || scrambled };
  }
  const trap = triggerTrapUnderPlayer(result.state);
  return { state: trap.state, events: [...result.events, ...trap.events], tookTurn: true };
}

/**
 * Take the stairs. Builds the next level from the current RNG, carries the
 * player over with pack and wounds intact, and discards everything else.
 */
export function descend(state: GameState): PhaseResult {
  const player = getPlayer(state);
  const stairs = state.map.stairsDown;
  if (stairs === undefined || !pointsEqual(player.position, stairs)) {
    return { state, events: [{ type: "no-stairs-here" }], tookTurn: false };
  }
  const depth = Math.min(FINAL_DEPTH, state.depth + 1);
  const level = createLevel(state.rng, depth, state.nextItemId);
  const map = updateVisibility(level.map, level.map.spawn, PLAYER_SIGHT_RADIUS);
  let next: GameState = {
    ...state,
    rng: level.rng,
    depth,
    map,
    entities: [{ ...player, position: map.spawn }],
    nextItemId: level.nextItemId,
    stats: { ...state.stats, maxDepth: Math.max(state.stats.maxDepth, depth) },
  };
  for (const monster of level.monsters) {
    next = spawnEntity(next, monster).state;
  }
  for (const item of level.items) {
    next = spawnEntity(next, item).state;
  }
  for (const trap of level.traps) {
    next = spawnEntity(next, trap).state;
  }
  return { state: next, events: [{ type: "level-descended", depth }], tookTurn: true };
}

function refuse(state: GameState, reason: AutoRefusal, entityId?: number): PhaseResult {
  const event: GameEvent =
    entityId === undefined
      ? { type: "auto-refused", reason }
      : { type: "auto-refused", reason, entityId };
  return { state, events: [event], tookTurn: false };
}

/** Automatic actions never start with a monster in view; the player must deal with it first. */
function monsterInView(state: GameState): PhaseResult | null {
  const monster = visibleMonsters(state)[0];
  return monster === undefined ? null : refuse(state, "monster-in-view", monster.id);
}

function resolveExplore(state: GameState): PhaseResult {
  const refusal = monsterInView(state);
  if (refusal !== null) {
    return refusal;
  }
  const step = exploreStep(state);
  if (step === null) {
    return refuse(state, "nothing-to-explore");
  }
  return resolveMove(state, step.direction);
}

function resolveTravelToStairs(state: GameState): PhaseResult {
  const refusal = monsterInView(state);
  if (refusal !== null) {
    return refusal;
  }
  const stairs = state.map.stairsDown;
  if (stairs === undefined || !stairsKnown(state)) {
    return refuse(state, "stairs-unknown");
  }
  if (isOnStairs(state)) {
    return refuse(state, "already-there");
  }
  const step = travelStep(state, stairs);
  if (step === null) {
    return refuse(state, "stairs-unknown");
  }
  return resolveMove(state, step.direction);
}

function resolveRest(state: GameState): PhaseResult {
  const refusal = monsterInView(state);
  if (refusal !== null) {
    return refusal;
  }
  const player = getPlayer(state);
  if (hasStatus(player, "poison")) {
    return refuse(state, "poisoned");
  }
  if (player.health === undefined || player.health.current >= player.health.max) {
    return refuse(state, "full-health");
  }
  return { state, events: [], tookTurn: true };
}

function resolvePlayerAction(state: GameState, action: Action): PhaseResult {
  switch (action.type) {
    case "move":
      return resolveMove(state, action.direction);
    case "wait":
      return { state, events: [], tookTurn: true };
    case "descend":
      return descend(state);
    case "pick-up":
      return pickUp(state);
    case "use-item":
      return useItem(state, action.slot);
    case "drop-item":
      return dropItem(state, action.slot);
    case "explore":
      return resolveExplore(state);
    case "travel-to-stairs":
      return resolveTravelToStairs(state);
    case "rest":
      return resolveRest(state);
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

/** Turns between each point of natural healing. Poison suspends it. */
export const REGEN_INTERVAL = 8;

/** Slow natural healing so a cautious player can recover between fights. */
function regenerate(state: GameState): GameState {
  if ((state.turn + 1) % REGEN_INTERVAL !== 0) {
    return state;
  }
  const player = getPlayer(state);
  if (player.health === undefined || player.health.current >= player.health.max) {
    return state;
  }
  if (player.statuses?.some((s) => s.id === "poison") === true || hungerBlocksRegen(player)) {
    return state;
  }
  return updateEntity(state, player.id, (p) =>
    p.health === undefined
      ? p
      : { ...p, health: { ...p.health, current: Math.min(p.health.max, p.health.current + 1) } },
  );
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
    return { state: appendLog(state, next, events), events };
  }

  if (next.status === "playing") {
    const monsterPhase = resolveMonsterPhase(next);
    next = monsterPhase.state;
    events.push(...monsterPhase.events);
  }

  if (next.status === "playing") {
    const statusPhase = tickAllStatuses(next);
    next = statusPhase.state;
    events.push(...statusPhase.events);
  }

  if (next.status === "playing") {
    const search = searchForTraps(next);
    next = search.state;
    events.push(...search.events);
  }

  if (next.status === "playing") {
    const hungerPhase = tickHunger(next, next.playerId);
    next = hungerPhase.state;
    events.push(...hungerPhase.events);
  }

  if (next.status === "playing") {
    next = regenerate(next);
  }

  // Experience earned this turn may raise the player's level, even on the winning blow.
  if (next.status !== "dead") {
    const levelled = applyLevelUps(next);
    next = levelled.state;
    events.push(...levelled.events);
  }

  next = { ...next, turn: next.turn + 1 };
  next = refreshPlayerVision(next);
  return { state: appendLog(state, next, events), events };
}
