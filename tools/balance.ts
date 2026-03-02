/// <reference types="node" />
/**
 * Balance report: play many seeds with the scripted bot and summarize how
 * the runs end. Usage:
 *
 *   npm run balance -- [--seeds N] [--start S] [--style explore|dive]
 *
 * The numbers describe a cautious, unskilled player. Use them to compare
 * before and after a change, not as a target in themselves.
 */

import { type BotStyle, type RunOutcome, runBot } from "./bot";

type Options = {
  readonly seeds: number;
  readonly start: number;
  readonly style: BotStyle;
};

function parseArgs(argv: readonly string[]): Options {
  let seeds = 100;
  let start = 1;
  let style: BotStyle = "explore";
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = argv[i + 1];
    if (arg === "--seeds" && value !== undefined) {
      seeds = Number.parseInt(value, 10);
      i++;
    } else if (arg === "--start" && value !== undefined) {
      start = Number.parseInt(value, 10);
      i++;
    } else if (arg === "--style" && (value === "explore" || value === "dive")) {
      style = value;
      i++;
    }
  }
  return { seeds, start, style };
}

function percent(part: number, whole: number): string {
  return whole === 0
    ? "0%"
    : `${(100 * part) / whole < 10 ? " " : ""}${String(Math.round((100 * part) / whole))}%`;
}

function mean(values: readonly number[]): string {
  return values.length === 0 ? "-" : (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1);
}

function bar(count: number, max: number, width = 30): string {
  return "#".repeat(max === 0 ? 0 : Math.round((count / max) * width));
}

function report(outcomes: readonly RunOutcome[], options: Options): void {
  const wins = outcomes.filter((o) => o.status === "won");
  const deaths = outcomes.filter((o) => o.status === "dead");
  const stalled = outcomes.filter((o) => o.status === "stalled");
  const total = outcomes.length;

  console.log(
    `\n${String(total)} runs, seeds ${String(options.start)}-${String(options.start + total - 1)}, style ${options.style}\n`,
  );
  console.log(`  won      ${String(wins.length).padStart(4)}  ${percent(wins.length, total)}`);
  console.log(`  died     ${String(deaths.length).padStart(4)}  ${percent(deaths.length, total)}`);
  console.log(
    `  stalled  ${String(stalled.length).padStart(4)}  ${percent(stalled.length, total)}`,
  );
  console.log(
    `\n  mean turns ${mean(outcomes.map((o) => o.turns))}, mean depth ${mean(outcomes.map((o) => o.depth))}, mean level ${mean(outcomes.map((o) => o.level))}, mean kills ${mean(outcomes.map((o) => o.kills))}`,
  );

  console.log("\n  deaths by depth");
  const byDepth = new Map<number, number>();
  for (const o of deaths) {
    byDepth.set(o.depth, (byDepth.get(o.depth) ?? 0) + 1);
  }
  const maxDepthCount = Math.max(0, ...byDepth.values());
  for (let depth = 1; depth <= 9; depth++) {
    const count = byDepth.get(depth) ?? 0;
    console.log(`    ${String(depth)}  ${String(count).padStart(4)}  ${bar(count, maxDepthCount)}`);
  }

  console.log("\n  deaths by killer");
  const byKiller = new Map<string, number>();
  for (const o of deaths) {
    const name = o.killer ?? "unknown";
    byKiller.set(name, (byKiller.get(name) ?? 0) + 1);
  }
  const killers = [...byKiller.entries()].sort((a, b) => b[1] - a[1]);
  const maxKillerCount = killers[0]?.[1] ?? 0;
  for (const [name, count] of killers) {
    console.log(
      `    ${name.padEnd(26)}${String(count).padStart(4)}  ${bar(count, maxKillerCount)}`,
    );
  }

  if (stalled.length > 0) {
    console.log(`\n  stalled seeds: ${stalled.map((o) => String(o.seed)).join(", ")}`);
  }
  console.log("");
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const outcomes: RunOutcome[] = [];
  const started = Date.now();
  for (let i = 0; i < options.seeds; i++) {
    outcomes.push(runBot(options.start + i, options.style));
  }
  report(outcomes, options);
  console.log(`  ${((Date.now() - started) / 1000).toFixed(1)}s\n`);
}

main();
