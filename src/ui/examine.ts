/**
 * Examine mode: a cursor the player moves over the map to read what is
 * there. Draws the cursor and a short description box. Reads state only.
 */

import type { Entity, GameState, Point } from "../core/index";
import {
  ITEMS,
  canShoot,
  MONSTER_LIST,
  STATUS_EFFECTS,
  TILES,
  TRAPS,
  chebyshevDistance,
  entitiesAt,
  getPlayer,
  isExploredAt,
  isVisibleAt,
  tileAt,
} from "../core/index";
import { PALETTE } from "../render/palette";
import { type Renderer, drawGlyph, drawText } from "../render/renderer";
import { drawFrame } from "./overlay";

export type Examined = {
  readonly title: string;
  readonly detail: string;
  readonly color: string;
};

function describeMonster(state: GameState, id: number): Examined {
  const entity = state.entities.find((e) => e.id === id);
  if (entity === undefined) {
    return { title: "nothing", detail: "", color: PALETTE.hudDim };
  }
  const def = MONSTER_LIST.find((d) => d.name === entity.name);
  const hp =
    entity.health === undefined
      ? ""
      : ` (HP ${String(entity.health.current)}/${String(entity.health.max)})`;
  const statuses = (entity.statuses ?? [])
    .map((s) => `${STATUS_EFFECTS[s.id].label} ${String(s.turnsLeft)}`)
    .join(", ");
  const title = `${entity.name}${hp}${statuses === "" ? "" : `, ${statuses}`}`;
  return { title, detail: def?.description ?? "", color: entity.color };
}

/** What lies under the cursor, from the player's point of view. */
export function examineAt(state: GameState, cursor: Point): Examined {
  const { map } = state;
  if (!isExploredAt(map, cursor)) {
    return { title: "unexplored", detail: "You have not seen this place.", color: PALETTE.hudDim };
  }
  const player = getPlayer(state);
  if (cursor.x === player.position.x && cursor.y === player.position.y) {
    return { title: "you", detail: "That is you.", color: PALETTE.player };
  }
  const visible = isVisibleAt(map, cursor);
  if (visible) {
    const here = entitiesAt(state, cursor);
    const monster = here.find((e) => e.kind === "monster");
    if (monster !== undefined) {
      return describeMonster(state, monster.id);
    }
    const floorItem = here.find((e) => e.kind === "item");
    if (floorItem?.item !== undefined) {
      const def = ITEMS[floorItem.item.defId];
      return { title: def.name, detail: def.description, color: def.color };
    }
  }
  const trap = entitiesAt(state, cursor).find((e) => e.trap !== undefined && !e.trap.hidden);
  if (trap?.trap !== undefined) {
    const def = TRAPS[trap.trap.id];
    return { title: def.name, detail: def.description, color: def.color };
  }
  const tile = TILES[tileAt(map, cursor)];
  return {
    title: visible ? tile.description : `${tile.description} (remembered)`,
    detail: "",
    color: PALETTE.hudText,
  };
}

/** Visible monsters ordered by distance from the player, for cycling with Tab. */
export function examineTargets(state: GameState): Point[] {
  return targetsWhere(state, (e) => isVisibleAt(state.map, e.position));
}

/** Visible monsters the readied bow can reach, nearest first. */
export function fireTargets(state: GameState): Point[] {
  const player = getPlayer(state);
  return targetsWhere(state, (e) => canShoot(state, player, e));
}

function targetsWhere(state: GameState, accept: (e: Entity) => boolean): Point[] {
  const player = getPlayer(state);
  return state.entities
    .filter((e) => e.kind === "monster" && accept(e))
    .sort(
      (a, b) =>
        chebyshevDistance(player.position, a.position) -
        chebyshevDistance(player.position, b.position),
    )
    .map((e) => e.position);
}

const BOX_WIDTH = 64;
const BOX_HEIGHT = 4;

export function drawExamine(
  renderer: Renderer,
  state: GameState,
  cursor: Point,
  title = "Examine",
): void {
  const { cellWidth, cellHeight } = renderer.metrics;
  const { context } = renderer;

  // Highlight the cursor cell by inverting it.
  context.fillStyle = PALETTE.hudText;
  context.fillRect(cursor.x * cellWidth, cursor.y * cellHeight, cellWidth, cellHeight);
  const here = entitiesAt(state, cursor);
  const knownTrap = here.find((e) => e.trap !== undefined && !e.trap.hidden);
  const shown = isVisibleAt(state.map, cursor)
    ? (here.find((e) => e.kind === "player") ??
      here.find((e) => e.kind === "monster") ??
      here.find((e) => e.kind === "item") ??
      knownTrap)
    : knownTrap;
  const glyph =
    shown?.glyph ??
    (isExploredAt(state.map, cursor) ? TILES[tileAt(state.map, cursor)].glyph : " ");
  drawGlyph(renderer, cursor.x, cursor.y, glyph, PALETTE.background);

  // Describe it in a box placed on whichever half of the map the cursor is not in.
  const info = examineAt(state, cursor);
  const box = {
    col: Math.max(0, Math.floor((renderer.columns - BOX_WIDTH) / 2)),
    row: cursor.y < state.map.height / 2 ? state.map.height - BOX_HEIGHT - 1 : 1,
    width: BOX_WIDTH,
    height: BOX_HEIGHT,
  };
  drawFrame(renderer, box, title);
  drawText(renderer, box.col + 2, box.row + 1, info.title, info.color, box.width - 4);
  drawText(renderer, box.col + 2, box.row + 2, info.detail, PALETTE.hudDim, box.width - 4);
}
