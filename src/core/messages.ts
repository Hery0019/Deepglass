/**
 * Turn events into player-facing log text. This is the only place that
 * knows how to phrase what happened; the renderer and log just display it.
 */

import { findEntity } from "./entity";
import type { GameEvent, GameState, LogEntry, LogTone } from "./types";

function nameOf(state: GameState, id: number): string {
  if (id === state.playerId) {
    return "you";
  }
  return `the ${findEntity(state, id)?.name ?? "creature"}`;
}

function capitalize(text: string): string {
  return text.length === 0 ? text : text.charAt(0).toUpperCase() + text.slice(1);
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
    case "entity-moved":
    case "entity-blocked":
      return null;
  }
}
