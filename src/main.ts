/**
 * Application entry point. Wiring only: creates the canvas context and
 * hands it to the renderer. Game logic lives in src/core/.
 */

const canvas = document.getElementById("game");
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error("Canvas element #game not found.");
}

const context = canvas.getContext("2d");
if (context === null) {
  throw new Error("Could not acquire a 2D rendering context.");
}

canvas.width = 1280;
canvas.height = 720;
context.fillStyle = "#000";
context.fillRect(0, 0, canvas.width, canvas.height);
