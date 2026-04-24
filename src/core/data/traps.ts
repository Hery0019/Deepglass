/**
 * Trap table. A trap is an entity hidden on a floor tile; stepping on it
 * fires the effect described here. Interpretation lives in systems/traps.ts.
 */

import type { StatusId } from "./effects";

export type TrapId = "spike" | "dart" | "teleport";

export type TrapEffect =
  | { readonly type: "damage"; readonly min: number; readonly max: number }
  | {
      readonly type: "damage-status";
      readonly min: number;
      readonly max: number;
      readonly status: StatusId;
      readonly turns: number;
    }
  | { readonly type: "teleport" };

export type TrapDef = {
  readonly id: TrapId;
  readonly name: string;
  readonly color: string;
  /** Shown by the examine command once the trap is known. */
  readonly description: string;
  /** Log line when the player steps on it. */
  readonly triggerText: string;
  readonly effect: TrapEffect;
  readonly minDepth: number;
  readonly weight: number;
};

export const TRAP_GLYPH = "^";

export const TRAPS: Readonly<Record<TrapId, TrapDef>> = {
  spike: {
    id: "spike",
    name: "spike trap",
    color: "#b0b0b0",
    description: "A pressure plate over a pit of iron spikes.",
    triggerText: "Spikes shoot up from the floor!",
    effect: { type: "damage", min: 3, max: 7 },
    minDepth: 1,
    weight: 10,
  },
  dart: {
    id: "dart",
    name: "poison dart trap",
    color: "#7fd17f",
    description: "A tripwire linked to a dart launcher in the wall.",
    triggerText: "A dart flies out of the wall!",
    effect: { type: "damage-status", min: 1, max: 3, status: "poison", turns: 5 },
    minDepth: 2,
    weight: 8,
  },
  teleport: {
    id: "teleport",
    name: "teleport trap",
    color: "#9a7fd1",
    description: "A rune that flings whoever steps on it elsewhere on the level.",
    triggerText: "The world lurches and you are somewhere else.",
    effect: { type: "teleport" },
    minDepth: 3,
    weight: 6,
  },
};

export const TRAP_LIST: readonly TrapDef[] = Object.values(TRAPS);
