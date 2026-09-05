/**
 * Experience and levelling. Experience is granted when monsters die (see
 * combat.ts); this module converts accumulated experience into levels and
 * the stat growth that comes with them.
 */

import { getPlayer, updateEntity } from "../entity";
import type { GameEvent, GameState } from "../types";

export const MAX_LEVEL = 20;

/** Total experience required to reach `level`. Level 1 needs none. */
export function xpForLevel(level: number): number {
  if (level <= 1) {
    return 0;
  }
  // Quadratic curve: 10, 30, 60, 100, 150, ...
  return 5 * (level - 1) * level;
}

export const LEVEL_UP_GAINS = {
  maxHealth: 6,
  attackMin: 1,
  attackMax: 1,
  /** Defence rises every N levels. */
  defenceEvery: 3,
} as const;

/** Apply every level-up the player has earned. Emits one event per level gained. */
export function applyLevelUps(state: GameState): {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
} {
  const player = getPlayer(state);
  const xp = player.experience;
  if (xp === undefined) {
    return { state, events: [] };
  }
  let level = xp.level;
  const events: GameEvent[] = [];
  let next = state;
  while (level < MAX_LEVEL && xp.xp >= xpForLevel(level + 1)) {
    level++;
    const newLevel = level;
    next = updateEntity(next, player.id, (p) => {
      const health = p.health ?? { current: 1, max: 1 };
      const attack = p.attack ?? { min: 1, max: 1, accuracy: 1 };
      const defenceGain = newLevel % LEVEL_UP_GAINS.defenceEvery === 0 ? 1 : 0;
      return {
        ...p,
        experience: { level: newLevel, xp: xp.xp },
        health: {
          max: health.max + LEVEL_UP_GAINS.maxHealth,
          // Levelling up also restores the gained health.
          current: Math.min(
            health.max + LEVEL_UP_GAINS.maxHealth,
            health.current + LEVEL_UP_GAINS.maxHealth,
          ),
        },
        attack: {
          ...attack,
          min: attack.min + LEVEL_UP_GAINS.attackMin,
          max: attack.max + LEVEL_UP_GAINS.attackMax,
        },
        defence: (p.defence ?? 0) + defenceGain,
      };
    });
    events.push({ type: "player-levelled-up", level: newLevel });
  }
  return { state: next, events };
}
