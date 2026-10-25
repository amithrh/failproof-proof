#!/usr/bin/env node
// pass3 — run every task K times and score it the way the hackathon does:
// a task counts only if it passes on ALL K runs (pass^k).
//
//   node eval/pass3.mjs --tasks eval/tasks.example.json --label baseline
//   node eval/pass3.mjs --tasks eval/tasks.example.json --label v2 --compare results/baseline.json
//
// Options
//   --cmd "<shell>"   agent command; the task prompt is in $PROMPT
//                     (default: claude -p --output-format json "$PROMPT")
//   --cwd <dir>       directory the agent runs in (default: current)
//   -k <n>            runs per task (default 3)
//   -j <n>            runs in parallel (default 3)
//   --only <ids>      comma-separated task ids
//   --timeout <s>     per-run timeout (default 300)
//   --setup "<shell>" run before every attempt (e.g. reset the world: git checkout -- . )
//                     forces -j 1, because a reset would wipe a parallel run's state
//   --max-turns <n>   event limits: fail any run over them, like the hidden scorer
//   --max-tokens <n>
//   --max-seconds <n>
//
// Task file: [{ "id": "T1", "prompt": "...", "expect": { ... } }]
//   expect.contains     string | string[]   all must appear in the answer (case-insensitive)
//   expect.notContains  string | string[]   none may appear
//   expect.regex        string              answer must match
//   expect.cmd          shell               must exit 0; gets $OUTPUT and $TASK_ID
//   expect.maxTurns     number              fail if the agent used more turns

import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : dflt;
};

const tasksFile = opt("--tasks");
if (!tasksFile) {
  console.error("usage: node eval/pass3.mjs --tasks <file> [--label name] [--compare results/x.json] [-k 3]");
  process.exit(2);
}
const K = Number(opt("-k", 3));
const label = opt("--label", "run");
const cmd = opt("--cmd", 'claude -p --output-format json "$PROMPT"');
const cwd = resolve(opt("--cwd", "."));
const setup = opt("--setup");
const J = setup ? 1 : Number(opt("-j", 3));
const limits = { turns: Number(opt("--max-turns", 0)), tokens: Number(opt("--max-tokens", 0)), ms: Number(opt("--max-seconds", 0)) * 1000 };
const timeoutMs = Number(opt("--timeout", 300)) * 1000;
const only = opt("--only")?.split(",");
const compareFile = opt("--compare");

// Strip a BOM: Windows editors and PowerShell often add one.
let tasks = JSON.parse(readFileSync(tasksFile, "utf8").replace(/^﻿/, ""));
if (only) tasks = tasks.filter((t) => only.includes(t.id));

const sh = (command, env, ms) =>
  new Promise((done) => {
    const child = spawn(command, { shell: true, cwd, env: { ...process.env, ...env } });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    const timer = setTimeout(() => child.kill("SIGKILL"), ms);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      done({ code, out, err, timedOut: signal === "SIGKILL" });
    });
  });

// `claude -p --output-format json` prints one JSON object; anything else is plain text.
function parseAgentOutput(raw) {
  try {
    const j = JSON.parse(raw.trim());
    const u = j.usage ?? {};
    return {
      answer: String(j.result ?? ""),
      cost: j.total_cost_usd ?? 0,
      turns: j.num_turns ?? null,
      tokens: (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
      agentError: Boolean(j.is_error),
      sessionId: j.session_id ?? null,
    };
  } catch {
    return { answer: raw, cost: 0, turns: null, tokens: 0, agentError: false, sessionId: null };
  }
}

const list = (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

async function check(task, run) {
  const e = task.expect ?? {};
  const a = run.answer.toLowerCase();
  const why = [];
  if (run.timedOut) why.push("timed out");
  if (run.agentError) why.push("agent reported an error");
  for (const s of list(e.contains)) if (!a.includes(s.toLowerCase())) why.push(`missing "${s}"`);
  for (const s of list(e.notContains)) if (a.includes(s.toLowerCase())) why.push(`contains "${s}"`);
  if (e.regex && !new RegExp(e.regex, "i").test(run.answer)) why.push(`no match /${e.regex}/`);
  if (e.maxTurns && run.turns > e.maxTurns) why.push(`${run.turns} turns > ${e.maxTurns}`);
  if (limits.turns && run.turns > limits.turns) why.push(`over turn limit (${run.turns} > ${limits.turns})`);
  if (limits.tokens && run.tokens > limits.tokens) why.push(`over token limit (${run.tokens} > ${limits.tokens})`);
  if (limits.ms && run.ms > limits.ms) why.push(`over time limit (${(run.ms / 1000).toFixed(0)}s)`);
  if (e.cmd) {
    const r = await sh(e.cmd, { OUTPUT: run.answer, TASK_ID: task.id }, 60_000);
    if (r.code !== 0) why.push(`check cmd failed: ${(r.err || r.out).trim().slice(0, 120)}`);
  }
  return why;
}

async function attempt(task, n) {
  if (setup) await sh(setup, { TASK_ID: task.id }, 120_000);
  const started = Date.now();
  const r = await sh(cmd, { PROMPT: task.prompt, TASK_ID: task.id }, timeoutMs);
  const run = { ...parseAgentOutput(r.out), timedOut: r.timedOut, ms: Date.now() - started };
  const why = await check(task, run);
  const mark = why.length ? "✗" : "✓";
  console.log(`  ${mark} ${task.id} #${n}  ${(run.ms / 1000).toFixed(1)}s  $${run.cost.toFixed(4)}  ${why.join("; ")}`);
  return { n, pass: why.length === 0, why, ms: run.ms, cost: run.cost, tokens: run.tokens, turns: run.turns, sessionId: run.sessionId, answer: run.answer.slice(0, 2000) };
}

// Simple worker pool over every (task, attempt) pair.
const jobs = tasks.flatMap((t) => Array.from({ length: K }, (_, i) => [t, i + 1]));
const results = new Map(tasks.map((t) => [t.id, []]));
let next = 0;
console.log(`${label}: ${tasks.length} tasks × ${K} runs, ${J} parallel\n`);
await Promise.all(
  Array.from({ length: Math.min(J, jobs.length) }, async () => {
    while (next < jobs.length) {
      const [t, n] = jobs[next++];
      results.get(t.id).push(await attempt(t, n));
    }
  }),
);

const rows = tasks.map((t) => {
  const runs = results.get(t.id).sort((a, b) => a.n - b.n);
  const passes = runs.filter((r) => r.pass).length;
  return { id: t.id, passes, passAll: passes === K, passAny: passes > 0, cost: runs.reduce((s, r) => s + r.cost, 0) / K, runs };
});
const passAll = rows.filter((r) => r.passAll).length;
const passAny = rows.filter((r) => r.passAny).length;
const cost = rows.reduce((s, r) => s + r.cost, 0) / Math.max(rows.length, 1);

console.log(`\n${"task".padEnd(16)} passes`);
for (const r of rows) console.log(`${r.id.padEnd(16)} ${r.passes}/${K} ${r.passAll ? "✓ counts" : r.passAny ? "~ flaky" : "✗"}`);
console.log(`\npass^${K}: ${passAll}/${rows.length}   pass@${K}: ${passAny}/${rows.length}   avg cost/task: $${cost.toFixed(4)}`);

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "results");
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, `${label}.json`);
writeFileSync(outFile, JSON.stringify({ label, k: K, cmd, cwd, passAll, passAny, total: rows.length, avgCost: cost, rows }, null, 2));
console.log(`saved ${outFile}`);

if (compareFile) {
  const base = new Map(JSON.parse(readFileSync(compareFile, "utf8")).rows.map((r) => [r.id, r]));
  const wins = rows.filter((r) => r.passAll && base.get(r.id) && !base.get(r.id).passAll);
  const losses = rows.filter((r) => !r.passAll && base.get(r.id)?.passAll);
  console.log(`\nvs ${compareFile}`);
  console.log(`  fixed (baseline fails, now ${K}/${K}): ${wins.map((r) => r.id).join(", ") || "none"}  <- eval candidates`);
  console.log(`  regressed: ${losses.map((r) => r.id).join(", ") || "none"}`);
}
