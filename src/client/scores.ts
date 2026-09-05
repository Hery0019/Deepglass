/**
 * Best runs, kept in the browser's local storage. The ranking is pure so
 * it can be tested; only `loadScores` and `saveScores` touch storage.
 */

import type { GameState } from "../core/index";
import { getPlayer } from "../core/index";

export type RunRecord = {
  readonly seed: number;
  readonly outcome: "won" | "dead";
  readonly depth: number;
  readonly turns: number;
  readonly kills: number;
  readonly level: number;
  /** What ended the run, for deaths. */
  readonly cause?: string;
  /** Milliseconds since the epoch when the run ended. */
  readonly endedAt: number;
};

export const MAX_SCORES = 10;
const STORAGE_KEY = "deepglass.scores";

/** Wins first, then deeper, then more kills, then fewer turns. */
export function compareRuns(a: RunRecord, b: RunRecord): number {
  if (a.outcome !== b.outcome) {
    return a.outcome === "won" ? -1 : 1;
  }
  if (a.depth !== b.depth) {
    return b.depth - a.depth;
  }
  if (a.kills !== b.kills) {
    return b.kills - a.kills;
  }
  return a.turns - b.turns;
}

/** The list with `run` added, ranked, and trimmed to the best entries. */
export function insertRun(scores: readonly RunRecord[], run: RunRecord): RunRecord[] {
  return [...scores, run].sort(compareRuns).slice(0, MAX_SCORES);
}

/** Build a record from a finished game. */
export function recordFromState(
  state: GameState,
  cause: string | undefined,
  endedAt: number,
): RunRecord {
  return {
    seed: state.seed,
    outcome: state.status === "won" ? "won" : "dead",
    depth: state.stats.maxDepth,
    turns: state.turn,
    kills: state.stats.kills,
    level: getPlayer(state).experience?.level ?? 1,
    ...(cause === undefined ? {} : { cause }),
    endedAt,
  };
}

function isRecord(value: unknown): value is RunRecord {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const r = value as Record<string, unknown>;
  return (
    typeof r.seed === "number" &&
    (r.outcome === "won" || r.outcome === "dead") &&
    typeof r.depth === "number" &&
    typeof r.turns === "number" &&
    typeof r.kills === "number" &&
    typeof r.level === "number" &&
    typeof r.endedAt === "number"
  );
}

/** Stored runs, or an empty list when storage is missing, blocked, or corrupt. */
export function loadScores(): RunRecord[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isRecord).sort(compareRuns) : [];
  } catch {
    return [];
  }
}

export function saveScores(scores: readonly RunRecord[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(scores));
  } catch {
    // Storage may be unavailable (private mode, quota); the game does not depend on it.
  }
}
