import { describe, expect, it } from "vitest";
import { MONSTERS } from "../src/core/data/monsters";
import { getPlayer } from "../src/core/entity";
import { monsterFromDef } from "../src/core/level";
import { seedRng } from "../src/core/rng";
import {
  MIN_DAMAGE,
  applyDamage,
  meleeAttack,
  resolveDeath,
  rollDamage,
} from "../src/core/systems/combat";
import { createPlayer } from "../src/core/turn";
import type { Entity, GameState } from "../src/core/types";
import { stateFromStrings } from "./helpers";

const ARENA = ["#######", "#.....#", "#..@..#", "#.....#", "#######"];

function arena(monster?: Omit<Entity, "id">): GameState {
  return stateFromStrings(ARENA, monster === undefined ? [] : [monster]);
}

describe("combat arithmetic", () => {
  it("floors damage at MIN_DAMAGE when defence exceeds the roll", () => {
    const attacker: Entity = {
      ...createPlayer({ x: 0, y: 0 }),
      attack: { min: 1, max: 2, accuracy: 1 },
    };
    const defender: Entity = { ...createPlayer({ x: 1, y: 0 }), id: 2, defence: 50 };
    let rng = seedRng(3);
    for (let i = 0; i < 50; i++) {
      const r = rollDamage(rng, attacker, defender);
      rng = r.rng;
      expect(r.damage).toBe(MIN_DAMAGE);
    }
  });

  it("subtracts defence from the roll and stays within the attack range", () => {
    const attacker: Entity = {
      ...createPlayer({ x: 0, y: 0 }),
      attack: { min: 4, max: 6, accuracy: 1 },
    };
    const defender: Entity = { ...createPlayer({ x: 1, y: 0 }), id: 2, defence: 2 };
    let rng = seedRng(9);
    for (let i = 0; i < 100; i++) {
      const r = rollDamage(rng, attacker, defender);
      rng = r.rng;
      expect(r.damage).toBeGreaterThanOrEqual(2);
      expect(r.damage).toBeLessThanOrEqual(4);
    }
  });

  it("never reduces health below zero", () => {
    const state = arena();
    const hurt = applyDamage(state, state.playerId, 999);
    expect(getPlayer(hurt).health?.current).toBe(0);
  });

  it("removes a killed monster, counts the kill, and awards experience", () => {
    const rat = { ...monsterFromDef(MONSTERS.rat, { x: 4, y: 2 }), health: { current: 1, max: 5 } };
    const state = arena(rat);
    const sureHit: GameState = {
      ...state,
      entities: state.entities.map((e) =>
        e.id === state.playerId ? { ...e, attack: { min: 10, max: 10, accuracy: 1 } } : e,
      ),
    };
    const player = getPlayer(sureHit);
    const target = sureHit.entities.find((e) => e.id === 2);
    expect(target).toBeDefined();
    if (target === undefined) {
      return;
    }
    const result = meleeAttack(sureHit, player, target);
    expect(result.events.map((e) => e.type)).toEqual(["attack-hit", "entity-died"]);
    expect(result.state.entities.find((e) => e.id === 2)).toBeUndefined();
    expect(result.state.stats.kills).toBe(1);
    expect(getPlayer(result.state).experience?.xp).toBe(MONSTERS.rat.xpValue);
    expect(result.state.status).toBe("playing");
  });

  it("marks the game as dead when the player is killed but keeps the player entity", () => {
    const rat = {
      ...monsterFromDef(MONSTERS.rat, { x: 4, y: 2 }),
      attack: { min: 50, max: 50, accuracy: 1 },
    };
    const state = arena(rat);
    const monster = state.entities.find((e) => e.id === 2);
    if (monster === undefined) {
      throw new Error("monster missing");
    }
    const result = meleeAttack(state, monster, getPlayer(state));
    expect(result.state.status).toBe("dead");
    expect(getPlayer(result.state).health?.current).toBe(0);
    expect(
      result.events.some((e) => e.type === "entity-died" && e.entityId === state.playerId),
    ).toBe(true);
  });

  it("produces a miss event and advances the RNG when accuracy is zero", () => {
    const rat = {
      ...monsterFromDef(MONSTERS.rat, { x: 4, y: 2 }),
      attack: { min: 1, max: 1, accuracy: 0 },
    };
    const state = arena(rat);
    const monster = state.entities.find((e) => e.id === 2);
    if (monster === undefined) {
      throw new Error("monster missing");
    }
    const result = meleeAttack(state, monster, getPlayer(state));
    expect(result.events).toEqual([
      { type: "attack-missed", attackerId: 2, defenderId: 1, ranged: false },
    ]);
    expect(result.state.rng).not.toBe(state.rng);
    expect(getPlayer(result.state).health?.current).toBe(getPlayer(state).health?.current);
  });

  it("resolveDeath does not credit kills to monsters", () => {
    const rat = { ...monsterFromDef(MONSTERS.rat, { x: 4, y: 2 }), health: { current: 0, max: 5 } };
    const state = arena(rat);
    const victim = state.entities.find((e) => e.id === 2);
    if (victim === undefined) {
      throw new Error("monster missing");
    }
    const result = resolveDeath(state, victim, undefined);
    expect(result.state.stats.kills).toBe(0);
    expect(getPlayer(result.state).experience?.xp).toBe(0);
  });
});
