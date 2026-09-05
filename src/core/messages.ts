/**
 * Turn events into player-facing log text. This is the only place that
 * knows how to phrase what happened; the renderer and log just display it.
 */

import { STATUS_EFFECTS } from "./data/effects";
import { ITEMS } from "./data/items";
import { TRAPS } from "./data/traps";
import { findEntity } from "./entity";
import { isVisibleAt } from "./map/dungeon";
import type { HungerLevel } from "./systems/hunger";
import type { AutoRefusal, GameEvent, GameState, LogEntry, LogTone } from "./types";

function nameOf(state: GameState, id: number): string {
  if (id === state.playerId) {
    return "you";
  }
  return `the ${findEntity(state, id)?.name ?? "creature"}`;
}

function capitalize(text: string): string {
  return text.length === 0 ? text : text.charAt(0).toUpperCase() + text.slice(1);
}

function describeHunger(level: HungerLevel): [string, LogTone] {
  switch (level) {
    case "fed":
      return ["You feel fed.", "good"];
    case "hungry":
      return ["You are getting hungry.", "bad"];
    case "weak":
      return ["You are weak with hunger. You will not heal like this.", "bad"];
    case "starving":
      return ["You are starving!", "bad"];
  }
}

function describeRefusal(before: GameState, reason: AutoRefusal, entityId?: number): string {
  switch (reason) {
    case "monster-in-view":
      return `Not with ${entityId === undefined ? "a monster" : nameOf(before, entityId)} in view.`;
    case "nothing-to-explore":
      return "You have explored everything you can reach.";
    case "stairs-unknown":
      return "You have not found a way to the stairs yet.";
    case "no-route":
      return "You know no way there.";
    case "already-there":
      return "You are already there.";
    case "full-health":
      return "You are already at full health.";
    case "poisoned":
      return "You cannot rest while poisoned.";
  }
}

/**
 * Describe an event, or return null for events that need no message.
 * `before` is the state at the start of the turn so names of entities that
 * died during the turn can still be resolved.
 */
export function describeEvent(before: GameState, event: GameEvent): LogEntry | null {
  const entry = (text: string, tone: LogTone): LogEntry => ({ turn: before.turn, text, tone });
  switch (event.type) {
    case "message":
      return entry(event.text, event.tone);
    case "attack-hit": {
      const attacker = nameOf(before, event.attackerId);
      const defender = nameOf(before, event.defenderId);
      const isPlayer = event.attackerId === before.playerId;
      const verb = event.ranged ? (isPlayer ? "shoot" : "shoots") : isPlayer ? "hit" : "hits";
      return entry(
        `${capitalize(attacker)} ${verb} ${defender} for ${String(event.damage)}.`,
        event.defenderId === before.playerId ? "bad" : "combat",
      );
    }
    case "attack-missed": {
      const attacker = nameOf(before, event.attackerId);
      const defender = nameOf(before, event.defenderId);
      const isPlayer = event.attackerId === before.playerId;
      if (event.ranged) {
        const verb = isPlayer ? "shoot" : "shoots";
        return entry(
          `${capitalize(attacker)} ${verb} at ${defender} and ${isPlayer ? "miss" : "misses"}.`,
          "combat",
        );
      }
      const verb = isPlayer ? "miss" : "misses";
      return entry(`${capitalize(attacker)} ${verb} ${defender}.`, "combat");
    }
    case "entity-died": {
      if (event.entityId === before.playerId) {
        return entry("You die...", "bad");
      }
      const victim = nameOf(before, event.entityId);
      if (event.killerId === before.playerId) {
        return entry(`You kill ${victim}.`, "good");
      }
      return entry(`${capitalize(victim)} dies.`, "info");
    }
    case "entity-damaged": {
      const isPlayer = event.entityId === before.playerId;
      const who = nameOf(before, event.entityId);
      const verb = isPlayer ? "take" : "takes";
      return entry(
        `${capitalize(who)} ${verb} ${String(event.amount)} damage from ${event.source}.`,
        isPlayer ? "bad" : "combat",
      );
    }
    case "entity-healed": {
      if (event.entityId !== before.playerId) {
        return null;
      }
      return entry(
        event.amount > 0 ? `You feel better (+${String(event.amount)}).` : "You feel no different.",
        "good",
      );
    }
    case "item-picked-up":
      return entry(`You pick up the ${ITEMS[event.item.defId].name}.`, "info");
    case "item-dropped": {
      const name = ITEMS[event.item.defId].name;
      return event.entityId === before.playerId
        ? entry(`You drop the ${name}.`, "info")
        : entry(`${capitalize(nameOf(before, event.entityId))} leaves behind a ${name}.`, "good");
    }
    case "item-used": {
      const def = ITEMS[event.item.defId];
      const verb = def.category === "scroll" ? "read" : def.category === "food" ? "eat" : "drink";
      return entry(`You ${verb} the ${def.name}.`, "info");
    }
    case "item-equipped": {
      const def = ITEMS[event.item.defId];
      const verb =
        def.category === "armour" ? "put on" : def.category === "bow" ? "ready" : "wield";
      return entry(`You ${verb} the ${def.name}.`, "info");
    }
    case "item-unequipped": {
      const def = ITEMS[event.item.defId];
      const verb = def.category === "armour" ? "take off" : "put away";
      return entry(`You ${verb} the ${def.name}.`, "info");
    }
    case "inventory-full":
      return entry("Your pack is full.", "info");
    case "nothing-here":
      return entry("There is nothing here to pick up.", "info");
    case "status-applied": {
      const isPlayer = event.entityId === before.playerId;
      const who = nameOf(before, event.entityId);
      const text = STATUS_EFFECTS[event.status].appliedText;
      return entry(
        `${capitalize(who)} ${isPlayer ? text.replace(/^is /, "are ").replace(/^looks /, "look ") : text}.`,
        isPlayer ? "bad" : "combat",
      );
    }
    case "status-expired": {
      const isPlayer = event.entityId === before.playerId;
      const who = nameOf(before, event.entityId);
      const text = STATUS_EFFECTS[event.status].expiredText;
      return entry(
        `${capitalize(who)} ${isPlayer ? text.replace(/^is /, "are ") : text}.`,
        isPlayer ? "good" : "info",
      );
    }
    case "level-descended":
      return entry(`You descend to depth ${String(event.depth)}.`, "system");
    case "no-stairs-here":
      return entry("There are no stairs here.", "info");
    case "door-opened": {
      if (event.entityId === before.playerId) {
        return entry("You open the door.", "info");
      }
      return isVisibleAt(before.map, event.at)
        ? entry(`${capitalize(nameOf(before, event.entityId))} opens a door.`, "info")
        : null;
    }
    case "trap-triggered":
      return entry(TRAPS[event.trap].triggerText, "bad");
    case "trap-found":
      return entry(`You notice a ${TRAPS[event.trap].name}.`, "info");
    case "entity-teleported":
      return null;
    case "hunger-changed":
      return entry(...describeHunger(event.level));
    case "auto-refused":
      return entry(describeRefusal(before, event.reason, event.entityId), "info");
    case "fire-refused":
      return entry(
        event.reason === "no-bow" ? "You have no bow readied." : "Nothing you can shoot there.",
        "info",
      );
    case "player-levelled-up":
      return entry(`Welcome to level ${String(event.level)}! You feel stronger.`, "good");
    case "game-won":
      return entry("The Warden falls. The Deepglass is yours.", "good");
    case "entity-moved":
    case "entity-blocked":
      return null;
  }
}
