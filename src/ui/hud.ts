/**
 * Heads-up display: two status rows and the message log drawn below the
 * map. Reads state only.
 */

import type { GameState, LogTone } from "../core/index";
import {
  ITEMS,
  STATUS_EFFECTS,
  effectiveAttack,
  effectiveDefence,
  equippedArmour,
  equippedBow,
  equippedWeapon,
  getPlayer,
  hungerLevel,
} from "../core/index";
import { PALETTE } from "../render/palette";
import { type Renderer, drawText } from "../render/renderer";

const STATUS_ROWS = 2;

function toneColor(tone: LogTone): string {
  switch (tone) {
    case "info":
      return PALETTE.logInfo;
    case "combat":
      return PALETTE.logCombat;
    case "good":
      return PALETTE.logGood;
    case "bad":
      return PALETTE.logBad;
    case "system":
      return PALETTE.logSystem;
  }
}

function healthColor(current: number, max: number): string {
  const ratio = max === 0 ? 0 : current / max;
  if (ratio > 0.6) {
    return PALETTE.logGood;
  }
  if (ratio > 0.3) {
    return PALETTE.logCombat;
  }
  return PALETTE.logBad;
}

/** A one-line notice across the top of the map, for replays. */
export function drawBanner(renderer: Renderer, text: string): void {
  const { cellWidth, cellHeight } = renderer.metrics;
  renderer.context.fillStyle = PALETTE.hudFrame;
  renderer.context.fillRect(0, cellHeight, renderer.columns * cellWidth, cellHeight);
  drawText(renderer, 1, 1, text, PALETTE.hudText, renderer.columns - 2);
}

export function drawHud(renderer: Renderer, state: GameState): void {
  const mapRows = renderer.mapRows;
  const player = getPlayer(state);

  // Row 1: vitals.
  const hp = player.health ?? { current: 0, max: 0 };
  const hpText = `HP ${String(hp.current)}/${String(hp.max)}`;
  drawText(renderer, 1, mapRows, hpText, healthColor(hp.current, hp.max));
  const xp = player.experience;
  const levelText = xp === undefined ? "" : `Lvl ${String(xp.level)} (${String(xp.xp)} xp)`;
  const attack = effectiveAttack(player);
  const statsText = `Atk ${String(attack.min)}-${String(attack.max)}  Def ${String(effectiveDefence(player))}`;
  const middle = `${levelText}  ${statsText}  Depth ${String(state.depth)}  Turn ${String(state.turn)}`;
  const seedText = `Seed ${String(state.seed)}`;
  // On a narrow screen the seed gives way to the vitals.
  const seedCol = renderer.columns - seedText.length - 1;
  const middleCol = hpText.length + 3;
  const roomForSeed = seedCol - middleCol - middle.length >= 2;
  drawText(renderer, middleCol, mapRows, middle, PALETTE.hudText, renderer.columns - middleCol - 1);
  if (roomForSeed) {
    drawText(renderer, seedCol, mapRows, seedText, PALETTE.hudDim);
  }

  // Row 2: equipment and statuses.
  const weapon = equippedWeapon(player);
  const armour = equippedArmour(player);
  const bow = equippedBow(player);
  const gear = `Weapon: ${weapon === undefined ? "fists" : ITEMS[weapon.defId].name}  Armour: ${
    armour === undefined ? "none" : ITEMS[armour.defId].name
  }${bow === undefined ? "" : `  Bow: ${ITEMS[bow.defId].name}`}`;
  drawText(renderer, 1, mapRows + 1, gear, PALETTE.hudDim);
  let col = gear.length + 3;
  const hunger = hungerLevel(player);
  if (hunger !== "fed") {
    const label = hunger.charAt(0).toUpperCase() + hunger.slice(1);
    drawText(
      renderer,
      col,
      mapRows + 1,
      label,
      hunger === "hungry" ? PALETTE.logCombat : PALETTE.logBad,
    );
    col += label.length + 2;
  }
  for (const status of player.statuses ?? []) {
    const def = STATUS_EFFECTS[status.id];
    const label = `${def.label} (${String(status.turnsLeft)})`;
    drawText(renderer, col, mapRows + 1, label, def.color);
    col += label.length + 2;
  }

  // Message log: the most recent entries, newest at the bottom.
  const logRows = renderer.metrics.hudRows - STATUS_ROWS;
  const recent = state.log.slice(-logRows);
  const firstRow = mapRows + STATUS_ROWS + (logRows - recent.length);
  recent.forEach((entry, i) => {
    const isRecent = entry.turn >= state.turn - 1;
    const color = isRecent ? toneColor(entry.tone) : PALETTE.hudDim;
    drawText(renderer, 1, firstRow + i, entry.text, color, renderer.columns - 2);
  });
}
