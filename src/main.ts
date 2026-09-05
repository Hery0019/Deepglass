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
  entitiesAt,
  autoContinues,
  createGame,
  effectiveRanged,
  getPlayer,
  inBounds,
  isOnStairs,
} from "./core/index";
import { type UiMode, keyToCommand } from "./input/keyboard";
import { HUD_ROWS, type Renderer, createRenderer, render } from "./render/renderer";
import { drawEndScreen } from "./ui/endscreen";
import { drawExamine, examineTargets, fireTargets } from "./ui/examine";
import { drawHelp } from "./ui/help";
import { drawHud } from "./ui/hud";
import { drawInventory } from "./ui/inventory";
import { drawMessageHistory, maxHistoryOffset } from "./ui/messages";

/** Glyph cells never shrink below this, so small windows scroll instead of becoming unreadable. */
const MIN_CELL_HEIGHT = 14;
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

function buildRenderer(canvas: HTMLCanvasElement, zoom: number): Renderer {
  const cell = computeCellSize(zoom);
  return createRenderer(canvas, GRID_WIDTH, GRID_HEIGHT, cell.width, cell.height);
}

/** When the canvas is larger than the window, scroll so the player stays centred. */
function scrollToPlayer(canvas: HTMLCanvasElement, renderer: Renderer, state: GameState): void {
  if (canvas.width <= window.innerWidth && canvas.height <= window.innerHeight) {
    return;
  }
  const player = getPlayer(state);
  const { cellWidth, cellHeight } = renderer.metrics;
  const x = canvas.offsetLeft + (player.position.x + 0.5) * cellWidth;
  const y = canvas.offsetTop + (player.position.y + 0.5) * cellHeight;
  window.scrollTo(x - window.innerWidth / 2, y - window.innerHeight / 2);
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
    drawEndScreen(r, s);
  };

  const draw = (): void => {
    render(renderer, state, drawOverlay);
    scrollToPlayer(canvas, renderer, state);
  };

  const rebuild = (): void => {
    renderer = buildRenderer(canvas, ZOOM_LEVELS[zoomIndex] ?? 1);
    draw();
  };

  window.addEventListener("resize", rebuild);

  const stopAuto = (): void => {
    if (autoTimer !== null) {
      window.clearTimeout(autoTimer);
      autoTimer = null;
    }
  };

  /** Apply `action` once, then keep applying it on a timer until the core says to stop. */
  const runAuto = (action: Action): void => {
    const before = state;
    const result = applyAction(state, action);
    state = result.state;
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
    const command = keyToCommand(event.key, mode);
    if (command === null) {
      return;
    }
    event.preventDefault();
    if (command.kind === "auto") {
      runAuto(command.action);
      return;
    }
    if (command.kind === "fire-at-cursor") {
      const target = entitiesAt(state, cursor).find((e) => e.kind === "monster");
      state = applyAction(state, { type: "fire", targetId: target?.id ?? -1 }).state;
      mode = "play";
      draw();
      return;
    }
    if (command.kind === "stairs") {
      if (isOnStairs(state)) {
        state = applyAction(state, { type: "descend" }).state;
        draw();
      } else {
        runAuto({ type: "travel-to-stairs" });
      }
      return;
    }
    if (command.kind === "ui") {
      const ui = command.command;
      switch (ui.type) {
        case "open":
          if (ui.mode === "target" && effectiveRanged(getPlayer(state)) === undefined) {
            // Say so at once instead of opening a cursor with nothing to shoot.
            state = applyAction(state, { type: "fire", targetId: -1 }).state;
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
          return;
      }
    } else {
      const result = applyAction(state, command.action);
      state = result.state;
      // Any action taken from an overlay closes it.
      mode = "play";
    }
    draw();
  });

  draw();
}

main();
