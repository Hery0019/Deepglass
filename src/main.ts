/**
 * Application entry point. Wiring only: creates the game state, the
 * renderer, and the keyboard listener, and connects them. Game logic lives
 * in src/core/; drawing lives in src/render/ and src/ui/.
 */

import {
  type Action,
  GRID_HEIGHT,
  GRID_WIDTH,
  type GameState,
  type Point,
  addPoints,
  applyAction,
  causeOfDeath,
  entitiesAt,
  autoContinues,
  createGame,
  effectiveRanged,
  getPlayer,
  inBounds,
  isOnStairs,
} from "./core/index";
import { type UiMode, keyToCommand } from "./input/keyboard";
import {
  HUD_ROWS,
  type Renderer,
  createRenderer,
  onMapScreen,
  render,
  toGrid,
} from "./render/renderer";
import { decodeActions, encodeActions } from "./client/replay";
import { insertRun, loadScores, recordFromState, saveScores } from "./client/scores";
import { drawBanner } from "./ui/hud";
import { drawEndScreen } from "./ui/endscreen";
import { drawExamine, examineTargets, fireTargets } from "./ui/examine";
import { drawHelp } from "./ui/help";
import { drawHud } from "./ui/hud";
import { drawInventory, inventorySlotAt } from "./ui/inventory";
import { type PointerCommand, tapToCommand } from "./input/pointer";
import { TOOLBAR_ROW, drawToolbar, toolbarKeyAt } from "./ui/toolbar";
import { drawMessageHistory, maxHistoryOffset } from "./ui/messages";
import { drawTitle } from "./ui/title";

/** Glyph cells never shrink below this; a small window shows a window onto the map instead. */
const MIN_CELL_HEIGHT = 14;
/** The map area never shrinks below this many rows, whatever the window. */
const MIN_MAP_ROWS = 12;
/** Width-to-height ratio of a monospace cell. */
const CELL_ASPECT = 0.6;
/** Zoom multipliers applied on top of the fit-to-window size; index 1 is the default. */
const ZOOM_LEVELS: readonly number[] = [0.75, 1, 1.25, 1.5, 2, 2.5, 3];
const DEFAULT_ZOOM_INDEX = 1;
/** Delay between steps of an automatic action (explore, travel, rest), so the run is visible. */
const AUTO_STEP_MS = 30;
/** Delay between actions when watching a replay. */
const REPLAY_STEP_MS = 12;
/** How often at most the URL is rewritten with the run so far; browsers throttle history updates. */
const URL_UPDATE_MS = 3000;

/**
 * Read the seed from `?seed=` if present, otherwise derive one from the
 * clock. Either way the URL is updated so the run can be shared or replayed.
 * A `?replay=` parameter carries the actions of a run to watch.
 */
function resolveSeed(): { readonly seed: number; readonly replay: Action[] } {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("seed");
  let seed: number | null = null;
  if (raw !== null) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed)) {
      seed = parsed >>> 0;
    }
  }
  const replay = seed === null ? [] : decodeActions(params.get("replay") ?? "");
  seed ??= Date.now() >>> 0;
  params.set("seed", String(seed));
  params.delete("replay");
  window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  return { seed, replay };
}

/** Put the run so far into the URL so the address bar is always a shareable replay. */
function writeReplayUrl(seed: number, actions: readonly Action[]): void {
  const params = new URLSearchParams({ seed: String(seed) });
  if (actions.length > 0) {
    params.set("replay", encodeActions(actions));
  }
  try {
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  } catch {
    // Some browsers throttle history updates; the next attempt will catch up.
  }
}

/** Cell size that fits the whole grid in the window, scaled by the zoom level and floored at the minimum. */
function computeCellSize(zoom: number): { readonly width: number; readonly height: number } {
  const totalRows = GRID_HEIGHT + HUD_ROWS;
  const fitHeight = Math.min(
    window.innerHeight / totalRows,
    window.innerWidth / (GRID_WIDTH * CELL_ASPECT),
  );
  const height = Math.max(MIN_CELL_HEIGHT, Math.round(fitHeight * zoom));
  return { width: Math.round(height * CELL_ASPECT), height };
}

/** Show as much of the grid as fits the window at this cell size; the camera follows the player for the rest. */
function buildRenderer(canvas: HTMLCanvasElement, zoom: number): Renderer {
  const cell = computeCellSize(zoom);
  const columns = Math.max(1, Math.min(GRID_WIDTH, Math.floor(window.innerWidth / cell.width)));
  const mapRows = Math.max(
    MIN_MAP_ROWS,
    Math.min(GRID_HEIGHT, Math.floor(window.innerHeight / cell.height) - HUD_ROWS),
  );
  return createRenderer(canvas, columns, mapRows, cell.width, cell.height);
}

function main(): void {
  const canvas = document.getElementById("game");
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("Canvas element #game not found.");
  }

  const start = resolveSeed();
  let state: GameState = createGame(start.seed);
  /** Every action applied so far, in order: with the seed, the whole run. */
  const actions: Action[] = [];
  let urlDirty = false;
  /** Set while a shared run is being replayed, and afterwards: replays are watched, not continued. */
  let replaying = start.replay.length > 0;
  /** The title screen covers the map until the first key or tap; replays skip it. */
  let title = !replaying;
  const replayTotal = start.replay.length;
  let mode: UiMode = "play";
  let zoomIndex = DEFAULT_ZOOM_INDEX;
  let renderer = buildRenderer(canvas, ZOOM_LEVELS[zoomIndex] ?? 1);
  let cursor: Point = getPlayer(state).position;
  let historyOffset = 0;
  let autoTimer: number | null = null;
  let scores = loadScores();
  // The toolbar appears once a finger touches the screen; mouse users keep the keys.
  let touch = window.matchMedia("(pointer: coarse)").matches;

  const drawOverlay = (r: Renderer, s: GameState): void => {
    if (mode === "examine") {
      drawExamine(r, s, cursor);
    } else if (mode === "target") {
      drawExamine(r, s, cursor, "Fire at");
    }
    drawHud(r, s);
    if (mode === "inventory" || mode === "drop") {
      drawInventory(r, s, mode === "drop");
    } else if (mode === "help") {
      drawHelp(r);
    } else if (mode === "messages") {
      drawMessageHistory(r, s, historyOffset);
    }
    drawEndScreen(r, s, scores);
    if (replayTotal > 0) {
      drawBanner(
        r,
        replaying
          ? `Replay of seed ${String(start.seed)}: ${String(actions.length)}/${String(replayTotal)} actions. Any key skips to the end.`
          : `Replay of seed ${String(start.seed)} finished. Press n for a new run.`,
      );
    }
    if (touch) {
      drawToolbar(r);
    }
    if (notice !== null) {
      drawBanner(r, notice);
    }
    if (title) {
      drawTitle(r, start.seed);
    }
  };

  const draw = (): void => {
    render(renderer, state, drawOverlay);
  };

  const rebuild = (): void => {
    renderer = buildRenderer(canvas, ZOOM_LEVELS[zoomIndex] ?? 1);
    draw();
  };

  window.addEventListener("resize", rebuild);

  /** Apply an action, and when it ends the run, remember how the run went. */
  const step = (action: Action): ReturnType<typeof applyAction> => {
    const before = state;
    const result = applyAction(state, action);
    state = result.state;
    actions.push(action);
    urlDirty = true;
    if (before.status === "playing" && state.status !== "playing") {
      if (replayTotal === 0) {
        scores = insertRun(
          scores,
          recordFromState(state, causeOfDeath(before, result), Date.now()),
        );
        saveScores(scores);
      }
      writeReplayUrl(start.seed, actions);
      urlDirty = false;
    }
    return result;
  };

  window.setInterval(() => {
    if (urlDirty) {
      writeReplayUrl(start.seed, actions);
      urlDirty = false;
    }
  }, URL_UPDATE_MS);

  /** Play back the shared run one action at a time; `skip` finishes it at once. */
  const runReplay = (skip: boolean): void => {
    while (replaying && actions.length < start.replay.length) {
      const next = start.replay[actions.length];
      if (next === undefined) {
        break;
      }
      step(next);
      if (!skip) {
        break;
      }
    }
    if (actions.length >= start.replay.length) {
      replaying = false;
      draw();
      return;
    }
    draw();
    window.setTimeout(() => {
      runReplay(false);
    }, REPLAY_STEP_MS);
  };

  /** A short client-side notice drawn as a banner, for things the log does not know about. */
  let notice: string | null = null;
  const showNotice = (text: string): void => {
    notice = text;
    draw();
    window.setTimeout(() => {
      notice = null;
      draw();
    }, 2000);
  };

  /** Put the full replay link on the clipboard. */
  const copyReplayLink = (): void => {
    writeReplayUrl(start.seed, actions);
    navigator.clipboard.writeText(window.location.href).then(
      () => {
        showNotice("Replay link copied to the clipboard.");
      },
      () => {
        showNotice("Could not copy; copy the address bar instead.");
      },
    );
  };

  /** Start over with a fresh seed. */
  const newRun = (): void => {
    const url = new URL(window.location.href);
    url.searchParams.delete("seed");
    window.location.assign(url.toString());
  };

  const stopAuto = (): void => {
    if (autoTimer !== null) {
      window.clearTimeout(autoTimer);
      autoTimer = null;
    }
  };

  /** Apply `action` once, then keep applying it on a timer until the core says to stop. */
  const runAuto = (action: Action): void => {
    const before = state;
    const result = step(action);
    draw();
    if (autoContinues(action, before, result)) {
      autoTimer = window.setTimeout(() => {
        runAuto(action);
      }, AUTO_STEP_MS);
    } else {
      autoTimer = null;
    }
  };

  const moveCursor = (direction: Point): void => {
    const next = addPoints(cursor, direction);
    if (inBounds(next, state.map.width, state.map.height)) {
      cursor = next;
    }
  };

  const cycleCursor = (): void => {
    const targets = mode === "target" ? fireTargets(state) : examineTargets(state);
    if (targets.length === 0) {
      return;
    }
    const current = targets.findIndex((p) => p.x === cursor.x && p.y === cursor.y);
    cursor = targets[(current + 1) % targets.length] ?? cursor;
  };

  /** Carry out a command from either the keyboard or a tap. Returns false if it was unbound. */
  const handle = (command: PointerCommand | null): boolean => {
    if (command === null) {
      return false;
    }
    if (command.kind === "key") {
      return handle(keyToCommand(command.key, mode));
    }
    if (command.kind === "cursor-set") {
      cursor = command.cell;
      draw();
      return true;
    }
    if (command.kind === "auto") {
      runAuto(command.action);
      return true;
    }
    if (command.kind === "fire-at-cursor") {
      const target = entitiesAt(state, cursor).find((e) => e.kind === "monster");
      step({ type: "fire", targetId: target?.id ?? -1 });
      mode = "play";
      draw();
      return true;
    }
    if (command.kind === "stairs") {
      if (isOnStairs(state)) {
        step({ type: "descend" });
        draw();
      } else {
        runAuto({ type: "travel-to-stairs" });
      }
      return true;
    }
    if (command.kind === "ui") {
      const ui = command.command;
      switch (ui.type) {
        case "open":
          if (ui.mode === "target" && effectiveRanged(getPlayer(state)) === undefined) {
            // Say so at once instead of opening a cursor with nothing to shoot.
            step({ type: "fire", targetId: -1 });
            break;
          }
          mode = ui.mode;
          if (mode === "examine") {
            cursor = getPlayer(state).position;
          } else if (mode === "target") {
            cursor = fireTargets(state)[0] ?? getPlayer(state).position;
          }
          historyOffset = 0;
          break;
        case "close":
          mode = "play";
          break;
        case "cursor":
          moveCursor(ui.direction);
          break;
        case "cursor-next":
          cycleCursor();
          break;
        case "scroll":
          historyOffset = Math.min(maxHistoryOffset(state), Math.max(0, historyOffset + ui.delta));
          break;
        case "zoom":
          if (ui.direction === "reset") {
            zoomIndex = DEFAULT_ZOOM_INDEX;
          } else {
            const step = ui.direction === "in" ? 1 : -1;
            zoomIndex = Math.min(ZOOM_LEVELS.length - 1, Math.max(0, zoomIndex + step));
          }
          rebuild();
          return true;
      }
    } else {
      step(command.action);
      // Any action taken from an overlay closes it.
      mode = "play";
    }
    draw();
    return true;
  };

  window.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    if (title) {
      title = false;
      event.preventDefault();
      draw();
      return;
    }
    if (replaying) {
      runReplay(true);
      return;
    }
    if (replayTotal > 0) {
      // A finished replay is watched, not continued.
      if (event.key === "n" || event.key === "Enter") {
        newRun();
      } else if (event.key === "c") {
        copyReplayLink();
      }
      return;
    }
    if (state.status !== "playing" && event.key === "c") {
      copyReplayLink();
      return;
    }
    if (autoTimer !== null) {
      // Any key interrupts an automatic run and is otherwise ignored.
      stopAuto();
      event.preventDefault();
      return;
    }
    if (state.status !== "playing" && (event.key === "n" || event.key === "Enter")) {
      newRun();
      return;
    }
    if (handle(keyToCommand(event.key, mode))) {
      event.preventDefault();
    }
  });

  canvas.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "touch" && !touch) {
      touch = true;
      draw();
    }
    if (title) {
      title = false;
      draw();
      return;
    }
    if (autoTimer !== null) {
      stopAuto();
      return;
    }
    if (replaying) {
      runReplay(true);
      return;
    }
    if (state.status !== "playing" || replayTotal > 0) {
      newRun();
      return;
    }
    const { cellWidth, cellHeight } = renderer.metrics;
    const screen = {
      x: Math.floor(event.offsetX / cellWidth),
      y: Math.floor(event.offsetY / cellHeight),
    };
    if (touch && screen.y === TOOLBAR_ROW) {
      const key = toolbarKeyAt(screen.x);
      if (key !== null) {
        handle({ kind: "key", key });
        return;
      }
    }
    // Overlays are laid out in screen cells; the map is addressed in grid cells.
    const slot =
      mode === "inventory" || mode === "drop" ? inventorySlotAt(renderer, state, screen) : null;
    const cell = onMapScreen(renderer, screen)
      ? toGrid(renderer, screen)
      : { x: screen.x, y: state.map.height };
    handle(tapToCommand(state, mode, cell, cursor, slot));
  });

  draw();
  if (replaying) {
    runReplay(false);
  }
}

main();
