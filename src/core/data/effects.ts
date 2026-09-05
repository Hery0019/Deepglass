/**
 * Status effect table. Each entry describes what a status does per turn;
 * the interpretation lives in systems/status.ts.
 */

export type StatusId = "poison" | "confusion";

export type StatusDef = {
  readonly id: StatusId;
  /** Adjective shown in the status bar, e.g. "poisoned". */
  readonly label: string;
  readonly color: string;
  /** Damage dealt to the bearer at the end of each turn. */
  readonly damagePerTurn?: number;
  /** Whether the bearer's movement direction is randomized. */
  readonly scramblesMovement?: boolean;
  readonly appliedText: string;
  readonly expiredText: string;
};

export const STATUS_EFFECTS: Readonly<Record<StatusId, StatusDef>> = {
  poison: {
    id: "poison",
    label: "poisoned",
    color: "#7fd17f",
    damagePerTurn: 1,
    appliedText: "is poisoned",
    expiredText: "is no longer poisoned",
  },
  confusion: {
    id: "confusion",
    label: "confused",
    color: "#d17fd1",
    scramblesMovement: true,
    appliedText: "looks confused",
    expiredText: "is no longer confused",
  },
};
