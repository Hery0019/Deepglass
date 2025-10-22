/**
 * Public API of the game core.
 *
 * Everything under src/core/ is pure logic: no DOM, no Canvas, no browser
 * globals. This module re-exports what the rest of the application needs.
 */

export * from "./rng";
export * from "./grid";
