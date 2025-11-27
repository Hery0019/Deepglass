/**
 * Public API of the game core.
 *
 * Everything under src/core/ is pure logic: no DOM, no Canvas, no browser
 * globals. This module re-exports what the rest of the application needs.
 */

export * from "./rng";
export * from "./grid";
export * from "./types";
export * from "./entity";
export * from "./map/tiles";
export * from "./map/dungeon";
export * from "./map/generate";
export * from "./data/monsters";
export * from "./systems/movement";
export * from "./systems/fov";
export * from "./systems/combat";
export * from "./systems/ai";
export * from "./messages";
export * from "./level";
export * from "./turn";
