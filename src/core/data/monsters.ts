/**
 * Monster table. Adding a monster means adding an entry here; no system
 * code should need to change. Behaviours are implemented in systems/ai.ts
 * and parameterized by the optional fields below.
 */

import type { AiBehaviour, OnHitStatus } from "../types";

export type MonsterId =
  "rat" | "bat" | "kobold" | "goblin-archer" | "cave-spider" | "orc" | "wraith" | "ogre" | "warden";

export type MonsterDef = {
  readonly id: MonsterId;
  readonly name: string;
  readonly glyph: string;
  readonly color: string;
  /** One line shown by the examine command. Says what the monster does, not its numbers. */
  readonly description: string;
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
  /** Relative spawn weight within its depth range. 0 means never spawned randomly. */
  readonly weight: number;
  /** Ranged attack, for behaviours that shoot. */
  readonly ranged?: {
    readonly min: number;
    readonly max: number;
    readonly accuracy: number;
    readonly range: number;
  };
  /** Fraction of max health below which a "fleeing" monster retreats. */
  readonly fleeThreshold?: number;
  /** Distance a ranged attacker tries to keep from the player. */
  readonly preferredRange?: number;
  /** Probability per turn that an "erratic" monster moves randomly instead of acting. */
  readonly erraticChance?: number;
  /** Status inflicted when a melee hit lands. */
  readonly onHit?: OnHitStatus;
};

export const MONSTERS: Readonly<Record<MonsterId, MonsterDef>> = {
  rat: {
    id: "rat",
    name: "giant rat",
    glyph: "r",
    color: "#b08d5b",
    description: "A mangy rodent the size of a dog. It comes straight at you.",
    health: 5,
    attackMin: 1,
    attackMax: 3,
    accuracy: 0.75,
    defence: 0,
    behaviour: "chaser",
    sightRadius: 7,
    xpValue: 3,
    minDepth: 1,
    maxDepth: 3,
    weight: 12,
  },
  bat: {
    id: "bat",
    name: "cave bat",
    glyph: "b",
    color: "#9a7fd1",
    description: "It flits about at random; its bite can leave you confused.",
    health: 4,
    attackMin: 1,
    attackMax: 2,
    accuracy: 0.7,
    defence: 0,
    behaviour: "erratic",
    sightRadius: 8,
    xpValue: 2,
    minDepth: 1,
    maxDepth: 5,
    weight: 10,
    erraticChance: 0.6,
    onHit: { status: "confusion", turns: 3, chance: 0.25 },
  },
  kobold: {
    id: "kobold",
    name: "kobold",
    glyph: "k",
    color: "#d17f5c",
    description: "A cowardly scavenger. It runs when hurt, recovers, and comes back.",
    health: 8,
    attackMin: 2,
    attackMax: 4,
    accuracy: 0.75,
    defence: 0,
    behaviour: "fleeing",
    sightRadius: 8,
    xpValue: 5,
    minDepth: 2,
    maxDepth: 5,
    weight: 8,
    fleeThreshold: 0.4,
  },
  "goblin-archer": {
    id: "goblin-archer",
    name: "goblin archer",
    glyph: "g",
    color: "#7fbf5c",
    description: "Keeps its distance and shoots. Corner it to make it fight.",
    health: 7,
    attackMin: 1,
    attackMax: 3,
    accuracy: 0.7,
    defence: 0,
    behaviour: "ranged",
    sightRadius: 8,
    xpValue: 6,
    minDepth: 2,
    maxDepth: 7,
    weight: 8,
    ranged: { min: 2, max: 4, accuracy: 0.7, range: 6 },
    preferredRange: 4,
  },
  "cave-spider": {
    id: "cave-spider",
    name: "cave spider",
    glyph: "s",
    color: "#c9c9c9",
    description: "Lies still until you step beside it. Its bite is poisonous.",
    health: 9,
    attackMin: 2,
    attackMax: 5,
    accuracy: 0.85,
    defence: 1,
    behaviour: "ambusher",
    sightRadius: 6,
    xpValue: 8,
    minDepth: 3,
    maxDepth: 8,
    weight: 7,
    onHit: { status: "poison", turns: 5, chance: 0.6 },
  },
  orc: {
    id: "orc",
    name: "orc",
    glyph: "o",
    color: "#5f9e4a",
    description: "A brutish warrior that charges on sight and hits hard.",
    health: 16,
    attackMin: 3,
    attackMax: 7,
    accuracy: 0.8,
    defence: 1,
    behaviour: "chaser",
    sightRadius: 8,
    xpValue: 12,
    minDepth: 4,
    maxDepth: 9,
    weight: 10,
  },
  wraith: {
    id: "wraith",
    name: "wraith",
    glyph: "W",
    color: "#7fd1d1",
    description: "A drifting shade that drains you from afar and avoids your reach.",
    health: 14,
    attackMin: 3,
    attackMax: 6,
    accuracy: 0.8,
    defence: 2,
    behaviour: "ranged",
    sightRadius: 9,
    xpValue: 16,
    minDepth: 7,
    maxDepth: 9,
    weight: 6,
    ranged: { min: 3, max: 6, accuracy: 0.75, range: 5 },
    preferredRange: 3,
  },
  ogre: {
    id: "ogre",
    name: "ogre",
    glyph: "O",
    color: "#c97a3a",
    description: "Slow-witted and enormous. Every blow it lands is a bad one.",
    health: 26,
    attackMin: 4,
    attackMax: 9,
    accuracy: 0.7,
    defence: 2,
    behaviour: "chaser",
    sightRadius: 7,
    xpValue: 25,
    minDepth: 7,
    maxDepth: 9,
    weight: 5,
  },
  warden: {
    id: "warden",
    name: "Warden of the Deepglass",
    glyph: "D",
    color: "#e8d44d",
    description: "The keeper of the Deepglass. It hurls shards and never retreats.",
    health: 50,
    attackMin: 5,
    attackMax: 10,
    accuracy: 0.85,
    defence: 2,
    behaviour: "boss",
    sightRadius: 12,
    xpValue: 100,
    minDepth: 9,
    maxDepth: 9,
    weight: 0,
    ranged: { min: 3, max: 6, accuracy: 0.8, range: 5 },
  },
};

export const MONSTER_LIST: readonly MonsterDef[] = Object.values(MONSTERS);

/** The monster placed on the final level; the run is won when it dies. */
export const BOSS_ID: MonsterId = "warden";
