/**
 * Monster AI. Each behaviour is a function from (state, monster) to a new
 * state and events. `runMonsterTurn` dispatches on the behaviour name.
 *
 * Shared rules: a monster only pursues while it has line of sight to the
 * player. When it loses sight it heads for the last known position, then
 * idles. Pathfinding treats other creatures as obstacles.
 */

import { blockingEntityAt, getPlayer, updateEntity } from "../entity";
import {
  DIRECTIONS_8,
  type Point,
  addPoints,
  chebyshevDistance,
  directionToward,
  isAdjacent,
  pointsEqual,
} from "../grid";
import { isWalkableAt } from "../map/dungeon";
import { chance, pick } from "../rng";
import type { AiBehaviour, AiComponent, Entity, GameEvent, GameState } from "../types";
import { meleeAttack, rangedAttack } from "./combat";
import { hasLineOfSight } from "./fov";
import { tryMove } from "./movement";
import { findPath } from "./pathfinding";
import { isMovementScrambled } from "./status";

export type AiResult = {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
};

const DEFAULT_SIGHT = 7;
const IDLE: (state: GameState) => AiResult = (state) => ({ state, events: [] });

/** Whether the monster can currently see the player. */
export function canSeePlayer(state: GameState, monster: Entity): boolean {
  const player = getPlayer(state);
  const radius = monster.sightRadius ?? DEFAULT_SIGHT;
  if (chebyshevDistance(monster.position, player.position) > radius) {
    return false;
  }
  return hasLineOfSight(state.map, monster.position, player.position);
}

function setAi(
  state: GameState,
  monsterId: number,
  update: (ai: AiComponent) => AiComponent,
): GameState {
  return updateEntity(state, monsterId, (e) =>
    e.ai === undefined ? e : { ...e, ai: update(e.ai) },
  );
}

function rememberPlayer(state: GameState, monster: Entity, position: Point): GameState {
  return setAi(state, monster.id, (ai) => ({ ...ai, lastKnownPlayerPosition: position }));
}

function forgetPlayer(state: GameState, monster: Entity): GameState {
  return setAi(state, monster.id, (ai) => {
    const { lastKnownPlayerPosition, ...rest } = ai;
    return rest;
  });
}

function movedEvent(monster: Entity, to: Point): GameEvent {
  return { type: "entity-moved", entityId: monster.id, from: monster.position, to };
}

/** A tile is passable for pathing if walkable and not occupied by another blocking creature. */
function passableFor(state: GameState, monster: Entity): (p: Point) => boolean {
  return (p) => {
    if (!isWalkableAt(state.map, p)) {
      return false;
    }
    const blocker = blockingEntityAt(state, p);
    return blocker === undefined || blocker.id === monster.id;
  };
}

/**
 * Step toward a target using A*. Falls back to a greedy step (diagonal, then
 * each cardinal component) if no path is found within the search budget.
 */
function stepToward(state: GameState, monster: Entity, target: Point): AiResult {
  const path = findPath(monster.position, target, passableFor(state, monster), {
    width: state.map.width,
    height: state.map.height,
    maxExpansions: 600,
  });
  const candidates: Point[] = [];
  const first = path?.[0];
  if (first !== undefined) {
    candidates.push(directionToward(monster.position, first));
  }
  const direct = directionToward(monster.position, target);
  candidates.push(direct);
  if (direct.x !== 0 && direct.y !== 0) {
    candidates.push({ x: direct.x, y: 0 }, { x: 0, y: direct.y });
  }
  for (const direction of candidates) {
    if (direction.x === 0 && direction.y === 0) {
      continue;
    }
    const outcome = tryMove(state, monster, direction);
    if (outcome.kind === "moved") {
      return { state: outcome.state, events: [movedEvent(monster, outcome.to)] };
    }
  }
  return IDLE(state);
}

/** Step to the reachable neighbour that maximizes distance from `threat`. */
function stepAway(state: GameState, monster: Entity, threat: Point): AiResult {
  let best: Point | null = null;
  let bestDistance = chebyshevDistance(monster.position, threat);
  const passable = passableFor(state, monster);
  for (const direction of DIRECTIONS_8) {
    const candidate = addPoints(monster.position, direction);
    if (!passable(candidate) || pointsEqual(candidate, threat)) {
      continue;
    }
    const d = chebyshevDistance(candidate, threat);
    if (d > bestDistance) {
      bestDistance = d;
      best = direction;
    }
  }
  if (best === null) {
    return IDLE(state);
  }
  const outcome = tryMove(state, monster, best);
  if (outcome.kind !== "moved") {
    return IDLE(state);
  }
  return { state: outcome.state, events: [movedEvent(monster, outcome.to)] };
}

/** Move one random step, or stay put if the chosen tile is blocked. */
function stepRandomly(state: GameState, monster: Entity): AiResult {
  const roll = pick(state.rng, DIRECTIONS_8);
  const next: GameState = { ...state, rng: roll.rng };
  const outcome = tryMove(next, monster, roll.value);
  if (outcome.kind !== "moved") {
    return IDLE(next);
  }
  return { state: outcome.state, events: [movedEvent(monster, outcome.to)] };
}

/** Head for the last known player position; forget it on arrival or when stuck. */
function followMemory(state: GameState, monster: Entity): AiResult {
  const memory = monster.ai?.lastKnownPlayerPosition;
  if (memory === undefined) {
    return IDLE(state);
  }
  if (pointsEqual(memory, monster.position)) {
    return IDLE(forgetPlayer(state, monster));
  }
  const moved = stepToward(state, monster, memory);
  if (moved.events.length === 0) {
    return IDLE(forgetPlayer(state, monster));
  }
  return moved;
}

/** Melee chaser: attack if adjacent, otherwise approach; follow memory when blind. */
function chaser(state: GameState, monster: Entity): AiResult {
  const player = getPlayer(state);
  if (!canSeePlayer(state, monster)) {
    return followMemory(state, monster);
  }
  const seen = rememberPlayer(state, monster, player.position);
  if (isAdjacent(monster.position, player.position)) {
    return meleeAttack(seen, monster, player);
  }
  return stepToward(seen, monster, player.position);
}

/** Ranged attacker: keeps its preferred distance and shoots when in range with line of sight. */
function ranged(state: GameState, monster: Entity): AiResult {
  const player = getPlayer(state);
  if (!canSeePlayer(state, monster)) {
    return followMemory(state, monster);
  }
  const seen = rememberPlayer(state, monster, player.position);
  const distance = chebyshevDistance(monster.position, player.position);
  const weapon = monster.rangedAttack;
  const preferred = monster.preferredRange ?? 3;

  if (weapon === undefined) {
    return chaser(state, monster);
  }
  if (distance < preferred) {
    // Back away only every other turn. A monster that retreated every time
    // the player stepped closer could never be caught in a long corridor.
    if (monster.ai?.backedOff !== true) {
      const retreat = stepAway(seen, monster, player.position);
      if (retreat.events.length > 0) {
        return {
          ...retreat,
          state: setAi(retreat.state, monster.id, (ai) => ({ ...ai, backedOff: true })),
        };
      }
    }
    const standing = setAi(seen, monster.id, (ai) => ({ ...ai, backedOff: false }));
    // Hold ground, or cornered: fight with whatever is available.
    return isAdjacent(monster.position, player.position)
      ? meleeAttack(standing, monster, player)
      : rangedAttack(standing, monster, player);
  }
  const rested = setAi(seen, monster.id, (ai) => ({ ...ai, backedOff: false }));
  if (distance <= weapon.range) {
    return rangedAttack(rested, monster, player);
  }
  return stepToward(rested, monster, player.position);
}

/** Erratic: with `erraticChance` it wanders randomly; otherwise it behaves like a chaser. */
function erratic(state: GameState, monster: Entity): AiResult {
  const roll = chance(state.rng, monster.erraticChance ?? 0.5);
  const next: GameState = { ...state, rng: roll.rng };
  if (roll.value) {
    return stepRandomly(next, monster);
  }
  return chaser(next, monster);
}

/** Ambusher: stays perfectly still until the player is adjacent, then fights like a chaser. */
function ambusher(state: GameState, monster: Entity): AiResult {
  const player = getPlayer(state);
  if (monster.ai?.alerted === true) {
    return chaser(state, monster);
  }
  if (isAdjacent(monster.position, player.position)) {
    const alerted = setAi(state, monster.id, (ai) => ({ ...ai, alerted: true }));
    return meleeAttack(alerted, monster, player);
  }
  return IDLE(state);
}

/**
 * Fleeing: fights like a chaser until health drops below the threshold,
 * then retreats. While out of the player's sight it recovers one health per
 * turn and returns to the fight once back above the threshold.
 */
function fleeing(state: GameState, monster: Entity): AiResult {
  const player = getPlayer(state);
  const health = monster.health;
  const threshold = monster.fleeThreshold ?? 0.3;
  if (health === undefined) {
    return chaser(state, monster);
  }
  const scared = health.current < health.max * threshold;
  const sees = canSeePlayer(state, monster);

  if (scared) {
    const flagged = setAi(state, monster.id, (ai) => ({ ...ai, fleeing: true }));
    if (sees) {
      const retreat = stepAway(flagged, monster, player.position);
      if (retreat.events.length > 0) {
        return retreat;
      }
      // Cornered: fight back.
      return isAdjacent(monster.position, player.position)
        ? meleeAttack(flagged, monster, player)
        : IDLE(flagged);
    }
    const healed = updateEntity(flagged, monster.id, (e) =>
      e.health === undefined
        ? e
        : { ...e, health: { ...e.health, current: Math.min(e.health.max, e.health.current + 1) } },
    );
    return IDLE(healed);
  }

  if (monster.ai?.fleeing === true) {
    const recovered = setAi(state, monster.id, (ai) => {
      const { fleeing, ...rest } = ai;
      return rest;
    });
    return chaser(recovered, monster);
  }
  return chaser(state, monster);
}

/**
 * Boss: a chaser that, when it has line of sight but is not adjacent,
 * has an even chance of hurling a ranged attack instead of closing in.
 */
function boss(state: GameState, monster: Entity): AiResult {
  const player = getPlayer(state);
  if (!canSeePlayer(state, monster)) {
    return followMemory(state, monster);
  }
  const seen = rememberPlayer(state, monster, player.position);
  if (isAdjacent(monster.position, player.position)) {
    return meleeAttack(seen, monster, player);
  }
  const weapon = monster.rangedAttack;
  const distance = chebyshevDistance(monster.position, player.position);
  if (weapon !== undefined && distance <= weapon.range) {
    const roll = chance(seen.rng, 0.5);
    const next: GameState = { ...seen, rng: roll.rng };
    if (roll.value) {
      return rangedAttack(next, monster, player);
    }
    return stepToward(next, monster, player.position);
  }
  return stepToward(seen, monster, player.position);
}

const BEHAVIOURS: Readonly<Record<AiBehaviour, (state: GameState, monster: Entity) => AiResult>> = {
  chaser,
  ranged,
  erratic,
  ambusher,
  fleeing,
  boss,
};

export function runMonsterTurn(state: GameState, monster: Entity): AiResult {
  if (monster.ai === undefined) {
    return IDLE(state);
  }
  if (isMovementScrambled(monster)) {
    return stepRandomly(state, monster);
  }
  return BEHAVIOURS[monster.ai.behaviour](state, monster);
}
