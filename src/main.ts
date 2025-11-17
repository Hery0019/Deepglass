/**
 * Application entry point. Wiring only: creates the game state, the
 * renderer, and the keyboard listener, and connects them. Game logic lives
 * in src/core/; drawing lives in src/render/ and src/ui/.
 */

import { GRID_HEIGHT, GRID_WIDTH, type GameState, applyAction, createGame } from "./core/index";
import { keyToCommand } from "./input/keyboard";
import { HUD_ROWS, createRenderer, render } from "./render/renderer";
import { drawHud } from "./ui/hud";

function readSeed(): number {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("seed");
  if (raw !== null) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed)) {
      return parsed >>> 0;
    }
  }
  return Date.now() >>> 0;
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

function main(): void {
  const canvas = document.getElementById("game");
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("Canvas element #game not found.");
  }

  let state: GameState = createGame(readSeed());
  let renderer = (() => {
    const cell = computeCellSize();
    return createRenderer(canvas, GRID_WIDTH, GRID_HEIGHT, cell.width, cell.height);
  })();

  const draw = (): void => {
    render(renderer, state, drawHud);
  };

  window.addEventListener("resize", () => {
    const cell = computeCellSize();
    renderer = createRenderer(canvas, GRID_WIDTH, GRID_HEIGHT, cell.width, cell.height);
    draw();
  });

  window.addEventListener("keydown", (event) => {
    const command = keyToCommand(event.key);
    if (command === null) {
      return;
    }
    event.preventDefault();
    if (command.kind === "action") {
      const result = applyAction(state, command.action);
      state = result.state;
      draw();
    }
  });

  draw();
}

main();
