/**
 * Unidentified items. Potions and scrolls look different every run: a
 * potion is known only by its colour and a scroll by its label until one
 * of that kind has been used. Appearances are rolled from the seed when
 * the game starts and live in the state, so replays see the same ones.
 */

import { ITEMS, ITEM_LIST, type ItemDef, type ItemId } from "../data/items";
import { type RngState, nextInt } from "../rng";
import type { GameState, Item } from "../types";

const POTION_LOOKS: readonly string[] = [
  "murky",
  "bubbling",
  "glowing",
  "smoky",
  "viscous",
  "crimson",
  "azure",
  "milky",
  "oily",
  "fizzing",
];

const SCROLL_LABELS: readonly string[] = [
  "XORTH",
  "VELUM KA",
  "ZINTA",
  "OCULI",
  "NEMOS",
  "ABRAX",
  "TUR VOLETH",
  "SIGRA",
  "MOR DUN",
  "ELIPH",
];

/** Categories whose items are unknown until used. */
export function hidesIdentity(def: ItemDef): boolean {
  return def.category === "potion" || def.category === "scroll";
}

function shuffle(rng: RngState, values: readonly string[]): { rng: RngState; values: string[] } {
  const out = [...values];
  let state = rng;
  for (let i = out.length - 1; i > 0; i--) {
    const roll = nextInt(state, 0, i);
    state = roll.rng;
    const a = out[i];
    const b = out[roll.value];
    if (a !== undefined && b !== undefined) {
      out[i] = b;
      out[roll.value] = a;
    }
  }
  return { rng: state, values: out };
}

/** Assign every potion a look and every scroll a label, at random. */
export function rollAppearances(rng: RngState): {
  readonly rng: RngState;
  readonly appearances: Readonly<Partial<Record<ItemId, string>>>;
} {
  const looks = shuffle(rng, POTION_LOOKS);
  const labels = shuffle(looks.rng, SCROLL_LABELS);
  const appearances: Partial<Record<ItemId, string>> = {};
  let potion = 0;
  let scroll = 0;
  for (const def of ITEM_LIST) {
    if (def.category === "potion") {
      appearances[def.id] = `${looks.values[potion] ?? "strange"} potion`;
      potion++;
    } else if (def.category === "scroll") {
      appearances[def.id] = `scroll labelled ${labels.values[scroll] ?? "?????"}`;
      scroll++;
    }
  }
  return { rng: labels.rng, appearances };
}

export function isIdentified(state: GameState, defId: ItemId): boolean {
  return !hidesIdentity(ITEMS[defId]) || state.identified.includes(defId);
}

/** Mark a kind of item as known. */
export function identify(state: GameState, defId: ItemId): GameState {
  return isIdentified(state, defId)
    ? state
    : { ...state, identified: [...state.identified, defId] };
}

/** The name the player knows an item by. */
export function itemName(state: GameState, item: Item): string {
  const def = ITEMS[item.defId];
  return isIdentified(state, item.defId) ? def.name : (state.appearances[item.defId] ?? def.name);
}

/** What the player knows about an item. */
export function itemDescription(state: GameState, item: Item): string {
  const def = ITEMS[item.defId];
  if (isIdentified(state, item.defId)) {
    return def.description;
  }
  return def.category === "potion"
    ? "You do not know what drinking it would do."
    : "You do not know what reading it would do.";
}
