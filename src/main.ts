/**
 * Application entry point. Wiring only: creates the game state, the
 * renderer, and the keyboard listener, and connects them. Game logic lives
 * in src/core/; drawing lives in src/render/ and src/ui/.
 */

import { GRID_HEIGHT, GRID_WIDTH, type GameState, applyAction, createGame } from "./core/index";
import { type UiMode, keyToCommand } from "./input/keyboard";
import { HUD_ROWS, type Renderer, createRenderer, render } from "./render/renderer";
import { drawEndScreen } from "./ui/endscreen";
import { drawHelp } from "./ui/help";
import { drawHud } from "./ui/hud";
import { drawInventory } from "./ui/inventory";

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

function computeCellSize(): { readonly width: number; readonly height: number } {
  const totalRows = GRID_HEIGHT + HUD_ROWS;
  const cellHeight = Math.max(10, Math.floor(window.innerHeight / totalRows));
  const cellWidth = Math.max(
    6,
    Math.min(Math.floor(cellHeight * 0.6), Math.floor(window.innerWidth / GRID_WIDTH)),
  );
  return { width: cellWidth, height: Math.min(cellHeight, Math.floor(cellWidth / 0.6)) };
}

function buildRenderer(canvas: HTMLCanvasElement): Renderer {
  const cell = computeCellSize();
  return createRenderer(canvas, GRID_WIDTH, GRID_HEIGHT, cell.width, cell.height);
}

function main(): void {
  const canvas = document.getElementById("game");
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("Canvas element #game not found.");
  }

  let state: GameState = createGame(resolveSeed());
  let mode: UiMode = "play";
  let renderer = buildRenderer(canvas);

  const drawOverlay = (r: Renderer, s: GameState): void => {
    drawHud(r, s);
    if (mode === "inventory" || mode === "drop") {
      drawInventory(r, s, mode === "drop");
    } else if (mode === "help") {
      drawHelp(r);
    }
    drawEndScreen(r, s);
  };

  const draw = (): void => {
    render(renderer, state, drawOverlay);
  };

  window.addEventListener("resize", () => {
    renderer = buildRenderer(canvas);
    draw();
  });

  window.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    const command = keyToCommand(event.key, mode);
    if (command === null) {
      return;
    }
    event.preventDefault();
    if (command.kind === "ui") {
      mode = command.command.type === "open" ? command.command.mode : "play";
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
