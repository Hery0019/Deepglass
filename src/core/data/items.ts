/**
 * Item table. Adding an item means adding an entry here. Effects are
 * described as data and interpreted by systems/items.ts; a new item that
 * reuses an existing effect type needs no code change.
 */

import type { StatusId } from "./effects";

export type ItemId =
  | "health-potion"
  | "scroll-of-flame"
  | "scroll-of-bewilderment"
  | "food-ration"
  | "dagger"
  | "sword"
  | "war-axe"
  | "leather-armour"
  | "chain-mail"
  | "plate-armour";

export type ItemCategory = "potion" | "scroll" | "food" | "weapon" | "armour";

/** What happens when a consumable is used. */
export type ItemEffect =
  | { readonly type: "heal"; readonly amount: number; readonly cures: readonly StatusId[] }
  | { readonly type: "feed"; readonly amount: number }
  | {
      readonly type: "area-damage";
      readonly radius: number;
      readonly min: number;
      readonly max: number;
    }
  | {
      readonly type: "area-status";
      readonly radius: number;
      readonly status: StatusId;
      readonly turns: number;
    };

export type WeaponStats = {
  readonly min: number;
  readonly max: number;
  /** Added to the wielder's base accuracy; may be negative. */
  readonly accuracyBonus: number;
};

export type ArmourStats = {
  readonly defence: number;
  /** Subtracted from the wearer's accuracy; heavier armour is clumsier. */
  readonly accuracyPenalty: number;
};

export type ItemDef = {
  readonly id: ItemId;
  readonly name: string;
  readonly glyph: string;
  readonly color: string;
  readonly category: ItemCategory;
  readonly description: string;
  readonly effect?: ItemEffect;
  readonly weapon?: WeaponStats;
  readonly armour?: ArmourStats;
  readonly minDepth: number;
  readonly maxDepth: number;
  readonly weight: number;
};

export const ITEMS: Readonly<Record<ItemId, ItemDef>> = {
  "health-potion": {
    id: "health-potion",
    name: "health potion",
    glyph: "!",
    color: "#e06060",
    category: "potion",
    description: "Restores 12 health and cures poison.",
    effect: { type: "heal", amount: 12, cures: ["poison"] },
    minDepth: 1,
    maxDepth: 9,
    weight: 22,
  },
  "food-ration": {
    id: "food-ration",
    name: "food ration",
    glyph: "%",
    color: "#c8a165",
    category: "food",
    description: "Dried meat and hard bread. Restores 800 nutrition.",
    effect: { type: "feed", amount: 800 },
    minDepth: 1,
    maxDepth: 9,
    weight: 16,
  },
  "scroll-of-flame": {
    id: "scroll-of-flame",
    name: "scroll of flame",
    glyph: "?",
    color: "#e0a458",
    category: "scroll",
    description: "Burns all creatures within 3 tiles for 6-12.",
    effect: { type: "area-damage", radius: 3, min: 6, max: 12 },
    minDepth: 2,
    maxDepth: 9,
    weight: 6,
  },
  "scroll-of-bewilderment": {
    id: "scroll-of-bewilderment",
    name: "scroll of bewilderment",
    glyph: "?",
    color: "#d17fd1",
    category: "scroll",
    description: "Confuses creatures within 4 tiles for 8 turns.",
    effect: { type: "area-status", radius: 4, status: "confusion", turns: 8 },
    minDepth: 1,
    maxDepth: 9,
    weight: 6,
  },
  dagger: {
    id: "dagger",
    name: "dagger",
    glyph: ")",
    color: "#c9c9c9",
    category: "weapon",
    description: "Light and precise. 2-4 damage, +10% accuracy.",
    weapon: { min: 2, max: 4, accuracyBonus: 0.1 },
    minDepth: 1,
    maxDepth: 4,
    weight: 6,
  },
  sword: {
    id: "sword",
    name: "sword",
    glyph: ")",
    color: "#dcdcf0",
    category: "weapon",
    description: "A balanced blade. 3-7 damage.",
    weapon: { min: 3, max: 7, accuracyBonus: 0 },
    minDepth: 2,
    maxDepth: 9,
    weight: 5,
  },
  "war-axe": {
    id: "war-axe",
    name: "war axe",
    glyph: ")",
    color: "#c97a3a",
    category: "weapon",
    description: "Heavy and slow. 5-11 damage, -15% accuracy.",
    weapon: { min: 5, max: 11, accuracyBonus: -0.15 },
    minDepth: 4,
    maxDepth: 9,
    weight: 4,
  },
  "leather-armour": {
    id: "leather-armour",
    name: "leather armour",
    glyph: "[",
    color: "#b08d5b",
    category: "armour",
    description: "Supple hide. +1 defence.",
    armour: { defence: 1, accuracyPenalty: 0 },
    minDepth: 1,
    maxDepth: 5,
    weight: 6,
  },
  "chain-mail": {
    id: "chain-mail",
    name: "chain mail",
    glyph: "[",
    color: "#a8a8b8",
    category: "armour",
    description: "Linked steel. +3 defence, -5% accuracy.",
    armour: { defence: 3, accuracyPenalty: 0.05 },
    minDepth: 3,
    maxDepth: 9,
    weight: 5,
  },
  "plate-armour": {
    id: "plate-armour",
    name: "plate armour",
    glyph: "[",
    color: "#e8e8f8",
    category: "armour",
    description: "Full plate. +5 defence, -15% accuracy.",
    armour: { defence: 5, accuracyPenalty: 0.15 },
    minDepth: 6,
    maxDepth: 9,
    weight: 3,
  },
};

export const ITEM_LIST: readonly ItemDef[] = Object.values(ITEMS);
