/**
 * A scripted player for balance testing. It sees only what the player
 * sees (explored tiles, visible monsters) and drives the game through the
 * same `applyAction` a human would, so its results say something about the
 * game as played rather than about the engine.
 *
 * The policy is deliberately plain: pick up and equip the best gear, drink
 * when low, fight what it can see, rest when hurt, explore, then descend.
 */

import {
  type Action,
  type Entity,
  type GameState,
  ITEMS,
  type Item,
  type Point,
  type TurnResult,
  applyAction,
  chebyshevDistance,
  createGame,
  entitiesAt,
  equippedArmour,
  equippedWeapon,
  exploreStep,
  findPath,
  fromIndex,
  getPlayer,
  hasStatus,
  isExploredAt,
  isOnStairs,
  isVisibleAt,
  isWalkableAt,
  stairsKnown,
  travelStep,
  visibleMonsters,
} from "../src/core/index";

/** "explore" clears each level before descending; "dive" takes the stairs as soon as it sees them. */
export type BotStyle = "explore" | "dive";

export type BotMemory = {
  /** Set while the bot is waiting to heal, so it rests past the threshold that started it. */
  readonly resting: boolean;
  /** Where the bot last saw a monster it was heading for; it goes there when the monster drops out of view. */
  readonly hunt?: Point;
  /** Depth the sighting record below belongs to. */
  readonly depth: number;
  /** Turn each tile was last in view, so a fully explored level can be swept for a hiding boss. */
  readonly seenTurn: readonly number[];
};

export const INITIAL_MEMORY: BotMemory = { resting: false, depth: 0, seenTurn: [] };

const DRINK_BELOW = 0.35;
/** Start resting below this fraction of max health... */
const REST_BELOW = 0.6;
/** ...and stop once back above this one; resting to full would take hundreds of turns. */
const RESTED_ABOVE = 0.9;
const FLAME_RADIUS = 3;

function healthRatio(entity: Entity): number {
  return entity.health === undefined || entity.health.max === 0
    ? 1
    : entity.health.current / entity.health.max;
}

function slotOf(player: Entity, predicate: (item: Item) => boolean): number {
  return (player.inventory?.items ?? []).findIndex(predicate);
}

function weaponScore(item: Item): number {
  const stats = ITEMS[item.defId].weapon;
  return stats === undefined ? 0 : ((stats.min + stats.max) / 2) * (0.85 + stats.accuracyBonus);
}

function armourScore(item: Item): number {
  const stats = ITEMS[item.defId].armour;
  return stats === undefined ? 0 : stats.defence - stats.accuracyPenalty * 4;
}

/** Slot of the best piece of gear the bot is not already wearing, or -1. */
function betterGearSlot(player: Entity, score: (item: Item) => number, worn?: Item): number {
  const items = player.inventory?.items ?? [];
  let best = worn === undefined ? 0 : score(worn);
  let slot = -1;
  items.forEach((item, i) => {
    if (score(item) > best) {
      best = score(item);
      slot = i;
    }
  });
  return slot;
}

/** Consumables are always worth a slot; gear only if it beats what is worn. */
function worthPicking(player: Entity, item: Item): boolean {
  const def = ITEMS[item.defId];
  if (def.category === "weapon") {
    const worn = equippedWeapon(player);
    return worn === undefined || weaponScore(item) > weaponScore(worn);
  }
  if (def.category === "armour") {
    const worn = equippedArmour(player);
    return worn === undefined || armourScore(item) > armourScore(worn);
  }
  return true;
}

function stepToward(state: GameState, goal: Point): Action | null {
  const player = getPlayer(state);
  const path = findPath(player.position, goal, knownPassable(state), {
    width: state.map.width,
    height: state.map.height,
    maxExpansions: state.map.width * state.map.height,
  });
  const first = path?.[0];
  if (first === undefined) {
    return null;
  }
  return {
    type: "move",
    direction: { x: first.x - player.position.x, y: first.y - player.position.y },
  };
}

function knownPassable(state: GameState): (p: Point) => boolean {
  return (p) =>
    isExploredAt(state.map, p) &&
    isWalkableAt(state.map, p) &&
    !entitiesAt(state, p).some((e) => e.blocksMovement && isVisibleAt(state.map, e.position));
}

function fight(state: GameState, player: Entity, monsters: readonly Entity[]): Action {
  const ratio = healthRatio(player);
  const potion = slotOf(player, (i) => i.defId === "health-potion");
  if (ratio < DRINK_BELOW && potion !== -1) {
    return { type: "use-item", slot: potion };
  }
  const near = monsters.filter(
    (m) => chebyshevDistance(m.position, player.position) <= FLAME_RADIUS,
  );
  const adjacent = monsters.filter((m) => chebyshevDistance(m.position, player.position) <= 1);
  const flame = slotOf(player, (i) => i.defId === "scroll-of-flame");
  if (flame !== -1 && (near.length >= 2 || (adjacent.length > 0 && ratio < 0.5))) {
    return { type: "use-item", slot: flame };
  }
  const bewilder = slotOf(player, (i) => i.defId === "scroll-of-bewilderment");
  if (bewilder !== -1 && adjacent.length > 0 && ratio < 0.4 && potion === -1) {
    return { type: "use-item", slot: bewilder };
  }
  const target = [...monsters].sort(
    (a, b) =>
      chebyshevDistance(a.position, player.position) -
      chebyshevDistance(b.position, player.position),
  )[0];
  if (target === undefined) {
    return { type: "wait" };
  }
  if (chebyshevDistance(target.position, player.position) <= 1) {
    return {
      type: "move",
      direction: {
        x: target.position.x - player.position.x,
        y: target.position.y - player.position.y,
      },
    };
  }
  return stepToward(state, target.position) ?? { type: "wait" };
}

export type BotChoice = {
  readonly action: Action;
  readonly memory: BotMemory;
};

/** Decide the next action from what the player can see. Pure. */
/** Record which tiles are in view this turn, starting afresh on a new level. */
function observe(state: GameState, memory: BotMemory): readonly number[] {
  const { map } = state;
  const seenTurn =
    memory.depth === state.depth && memory.seenTurn.length === map.visible.length
      ? [...memory.seenTurn]
      : new Array<number>(map.visible.length).fill(-1);
  map.visible.forEach((visible, index) => {
    if (visible) {
      seenTurn[index] = state.turn;
    }
  });
  return seenTurn;
}

/** Step toward the reachable tile that has gone longest without being looked at. */
function sweep(state: GameState, seenTurn: readonly number[]): Action | null {
  const { map } = state;
  const candidates: number[] = [];
  seenTurn.forEach((turn, index) => {
    if (
      turn !== state.turn &&
      isWalkableAt(map, fromIndex(index, map.width)) &&
      (map.explored[index] ?? false)
    ) {
      candidates.push(index);
    }
  });
  candidates.sort((a, b) => (seenTurn[a] ?? 0) - (seenTurn[b] ?? 0));
  for (const index of candidates.slice(0, 20)) {
    const step = stepToward(state, fromIndex(index, map.width));
    if (step !== null) {
      return step;
    }
  }
  return null;
}

export function chooseAction(state: GameState, memory: BotMemory, style: BotStyle): BotChoice {
  const player = getPlayer(state);
  const calm: BotMemory = { resting: false, depth: state.depth, seenTurn: observe(state, memory) };
  const keep = (action: Action): BotChoice => ({ action, memory: calm });

  // Gear first: the pack is small and better equipment pays off every turn.
  const weaponSlot = betterGearSlot(player, weaponScore, equippedWeapon(player));
  if (weaponSlot !== -1) {
    return keep({ type: "use-item", slot: weaponSlot });
  }
  const armourSlot = betterGearSlot(player, armourScore, equippedArmour(player));
  if (armourSlot !== -1) {
    return keep({ type: "use-item", slot: armourSlot });
  }

  const monsters = visibleMonsters(state).filter(
    // A fleeing kobold is not worth chasing.
    (m) => m.ai?.fleeing !== true || chebyshevDistance(m.position, player.position) <= 2,
  );
  if (monsters.length > 0) {
    const nearest = [...monsters].sort(
      (a, b) =>
        chebyshevDistance(a.position, player.position) -
        chebyshevDistance(b.position, player.position),
    )[0];
    return {
      action: fight(state, player, monsters),
      memory: nearest === undefined ? calm : { ...calm, hunt: nearest.position },
    };
  }
  // A monster that slipped out of view is probably still where it was: go and look.
  if (memory.hunt !== undefined) {
    const step = stepToward(state, memory.hunt);
    const arrived = chebyshevDistance(player.position, memory.hunt) <= 1;
    if (step !== null && !arrived) {
      return { action: step, memory: { ...calm, hunt: memory.hunt } };
    }
  }

  const floorItem = entitiesAt(state, player.position).find((e) => e.kind === "item");
  if (floorItem?.item !== undefined && worthPicking(player, floorItem.item)) {
    const inventory = player.inventory ?? { items: [], capacity: 0 };
    if (inventory.items.length < inventory.capacity) {
      return keep({ type: "pick-up" });
    }
    // Make room by dropping a spare weapon or armour piece.
    const spare = slotOf(
      player,
      (i) =>
        (ITEMS[i.defId].category === "weapon" || ITEMS[i.defId].category === "armour") &&
        i.id !== equippedWeapon(player)?.id &&
        i.id !== equippedArmour(player)?.id,
    );
    if (spare !== -1) {
      return keep({ type: "drop-item", slot: spare });
    }
  }

  const ratio = healthRatio(player);
  const potion = slotOf(player, (i) => i.defId === "health-potion");
  if (hasStatus(player, "poison") && ratio < 0.5 && potion !== -1) {
    return keep({ type: "use-item", slot: potion });
  }
  const resting = (memory.resting && ratio < RESTED_ABOVE) || ratio < REST_BELOW;
  if (resting && !hasStatus(player, "poison")) {
    return { action: { type: "wait" }, memory: { ...calm, resting: true } };
  }
  const action = exploreOrDescend(state, style);
  if (action.type !== "wait") {
    return keep(action);
  }
  // Nothing left to explore and no stairs: the boss is somewhere out of sight. Sweep the level.
  return keep(sweep(state, calm.seenTurn) ?? { type: "wait" });
}

/** Explore what is left, then head for the stairs; wait if neither is possible. */
function exploreOrDescend(state: GameState, style: BotStyle): Action {
  const stairs = state.map.stairsDown;
  const ready = stairs !== undefined && stairsKnown(state);
  if (ready && (style === "dive" || exploreStep(state) === null)) {
    if (isOnStairs(state)) {
      return { type: "descend" };
    }
    const step = travelStep(state, stairs);
    if (step !== null) {
      return { type: "move", direction: step.direction };
    }
  }
  const step = exploreStep(state);
  if (step !== null) {
    return { type: "move", direction: step.direction };
  }
  return { type: "wait" };
}

export type RunOutcome = {
  readonly seed: number;
  readonly status: "won" | "dead" | "stalled";
  readonly depth: number;
  readonly turns: number;
  readonly level: number;
  readonly kills: number;
  /** What killed the player, when it died. */
  readonly killer?: string;
};

/** Resting is slow, so a full cautious run can take well over ten thousand turns. */
const MAX_TURNS = 20000;
/** Consecutive actions that cost no turn before the run is declared stuck. */
const MAX_IDLE_ACTIONS = 50;

function killerFrom(before: GameState, result: TurnResult): string | undefined {
  const death = result.events.find(
    (e) => e.type === "entity-died" && e.entityId === before.playerId,
  );
  if (death?.type === "entity-died" && death.killerId !== undefined) {
    return before.entities.find((e) => e.id === death.killerId)?.name ?? "unknown";
  }
  const damage = [...result.events]
    .reverse()
    .find((e) => e.type === "entity-damaged" && e.entityId === before.playerId);
  return damage?.type === "entity-damaged" ? damage.source : "unknown";
}

/** Play one full run from a seed and report how it ended. */
export function runBot(seed: number, style: BotStyle = "explore"): RunOutcome {
  let state = createGame(seed);
  let memory = INITIAL_MEMORY;
  let idle = 0;
  let killer: string | undefined;
  while (state.status === "playing" && state.turn < MAX_TURNS && idle < MAX_IDLE_ACTIONS) {
    const choice = chooseAction(state, memory, style);
    memory = choice.memory;
    const result = applyAction(state, choice.action);
    idle = result.state.turn === state.turn ? idle + 1 : 0;
    if (result.state.status === "dead") {
      killer = killerFrom(state, result);
    }
    state = result.state;
  }
  const player = getPlayer(state);
  return {
    seed,
    status: state.status === "playing" ? "stalled" : state.status,
    depth: state.stats.maxDepth,
    turns: state.turn,
    level: player.experience?.level ?? 1,
    kills: state.stats.kills,
    ...(killer === undefined ? {} : { killer }),
  };
}
