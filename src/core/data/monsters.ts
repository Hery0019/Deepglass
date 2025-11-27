/**
 * Monster table. Adding a monster means adding an entry here; no system
 * code should need to change.
 */

import type { AiBehaviour } from "../types";

export type MonsterId = "rat";

export type MonsterDef = {
  readonly id: MonsterId;
  readonly name: string;
  readonly glyph: string;
  readonly color: string;
  readonly health: number;
  readonly attackMin: number;
  readonly attackMax: number;
  readonly accuracy: number;
  readonly defence: number;
  readonly behaviour: AiBehaviour;
  readonly sightRadius: number;
  readonly xpValue: number;
  /** Depth range (inclusive) in which this monster can appear. */
  readonly minDepth: number;
  readonly maxDepth: number;
  /** Relative spawn weight within its depth range. */
  readonly weight: number;
};

export const MONSTERS: Readonly<Record<MonsterId, MonsterDef>> = {
  rat: {
    id: "rat",
    name: "giant rat",
    glyph: "r",
    color: "#b08d5b",
    health: 5,
    attackMin: 1,
    attackMax: 3,
    accuracy: 0.75,
    defence: 0,
    behaviour: "chaser",
    sightRadius: 7,
    xpValue: 3,
    minDepth: 1,
    maxDepth: 9,
    weight: 10,
  },
};

export const MONSTER_LIST: readonly MonsterDef[] = Object.values(MONSTERS);
