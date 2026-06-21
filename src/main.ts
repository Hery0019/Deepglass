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
import { insertRun, loadScores, recordFromState, saveScores } from "./client/scores";
import { drawEndScreen } from "./ui/endscreen";
import { drawExamine, examineTargets, fireTargets } from "./ui/examine";
import { drawHelp } from "./ui/help";
import { drawHud } from "./ui/hud";
import { drawInventory, inventorySlotAt } from "./ui/inventory";
import { type PointerCommand, tapToCommand } from "./input/pointer";
import { TOOLBAR_ROW, drawToolbar, toolbarKeyAt } from "./ui/toolbar";
import { drawMessageHistory, maxHistoryOffset } from "./ui/messages";

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

/**
 * Read the seed from `?seed=` if present, otherwise derive one from the
 * clock. Either way the URL is updated so the run can be shared or replayed.
 */
function resolveSeed(): number {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("seed");
  let seed: number | null = null;
  if (raw !== null) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed)) {
      seed = parsed >>> 0;
    }
  }
  seed ??= Date.now() >>> 0;
  params.set("seed", String(seed));
  const url = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState(null, "", url);
  return seed;
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

  let state: GameState = createGame(resolveSeed());
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
    if (touch) {
      drawToolbar(r);
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
    if (before.status === "playing" && state.status !== "playing") {
      scores = insertRun(scores, recordFromState(state, causeOfDeath(before, result), Date.now()));
      saveScores(scores);
    }
    return result;
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
    if (autoTimer !== null) {
      stopAuto();
      return;
    }
    if (state.status !== "playing") {
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
}

main();
