#!/usr/bin/env node
// triage — label every failed run in a pass3 result with failure categories,
// so you fix the biggest category first (CHEATSHEET §3).
//
//   node eval/triage.mjs results/baseline.json
//   node eval/triage.mjs results/baseline.json --transcripts ~/.claude/projects
//
// Reads the Claude Code transcript of each failed run (found by session id
// under --transcripts, default ~/.claude/projects) and applies heuristics.
// Labels are hints: open the transcript of the top category and confirm.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { history, isError, sameArgs, short } from "../lib/kit.mjs";

const argv = process.argv.slice(2);
const file = argv.find((a) => !a.startsWith("--"));
if (!file) {
  console.error("usage: node eval/triage.mjs results/<label>.json [--transcripts <dir>]");
  process.exit(2);
}
const ti = argv.indexOf("--transcripts");
const root = ti >= 0 ? argv[ti + 1] : join(homedir(), ".claude", "projects");
const result = JSON.parse(readFileSync(file, "utf8").replace(/^﻿/, ""));

const EDIT_TOOLS = new Set(["Write", "Edit", "MultiEdit", "apply_patch"]);
const PROTECTED = /(^|[\s/"'=])(tests?|__tests__|evals?|fixtures|spec|\.github)\/|\.(test|spec)\.[jt]sx?$|_test\.(py|go)$/i;
const INJECTION = /\b(ignore (all |any )?(previous|prior|above) instructions|you are now|new instructions:|system prompt:|disregard (the|your) (task|instructions))/i;
const ARG_ERROR = /\b(invalid|required|missing|must be|expected|not found|unknown|no such|does not exist|malformed|validation)\b/i;
const CLAIMS_DONE = /\b(done|completed?|successfully|i have (updated|created|fixed|sent|refunded|closed)|all tests pass)\b/i;

// Session id -> transcript path, built once.
const index = new Map();
if (existsSync(root))
  for (const proj of readdirSync(root, { withFileTypes: true }))
    if (proj.isDirectory())
      for (const f of readdirSync(join(root, proj.name)))
        if (f.endsWith(".jsonl")) index.set(f.slice(0, -6), join(root, proj.name, f));

function labels(run) {
  const why = run.why.join("; ");
  const out = new Set();
  if (/time limit|timed out|token limit|turn limit|turns >/.test(why)) out.add("budget");
  const path = run.sessionId && index.get(run.sessionId);
  const calls = path ? history({ session: { transcriptPath: path } }) : [];
  if (calls.length) {
    const maxSame = Math.max(...calls.map((c) => calls.filter((d) => sameArgs(c, d)).length));
    if (maxSame >= 3) out.add("loop");
    const errs = calls.filter(isError);
    if (errs.some((c) => ARG_ERROR.test(short(c.result, 2000)))) out.add("bad tool args");
    for (let i = 1; i < calls.length; i++)
      if (isError(calls[i - 1]) && isError(calls[i]) && sameArgs(calls[i - 1], calls[i])) out.add("ignored error");
    if (calls.some((c) => /budget/i.test(short(c.result, 2000)) && c.error)) out.add("budget");
    if (calls.some((c) => INJECTION.test(short(c.result, 20_000)))) out.add("prompt injection");
    if (calls.some((c) => EDIT_TOOLS.has(c.name) && PROTECTED.test(String(c.args.file_path ?? "")))) out.add("test tampering");
  }
  const checkFailed = /missing "|no match|check cmd failed|contains "/.test(why);
  if (checkFailed && CLAIMS_DONE.test(run.answer ?? "")) out.add("false done");
  if (checkFailed && /no match|check cmd failed/.test(why) && !out.size) out.add("output format");
  if (!out.size) out.add(path ? "unclear: read transcript" : "no transcript found");
  return [...out];
}

const counts = new Map();
const bump = (k, id) => counts.set(k, [...(counts.get(k) ?? []), id]);
console.log(`triage of ${file} (${result.label}, k=${result.k})\n`);
for (const row of result.rows) {
  const failed = row.runs.filter((r) => !r.pass);
  if (!failed.length) continue;
  if (failed.length < row.runs.length) bump("variance (flaky)", row.id);
  console.log(`${row.id}  ${row.passes}/${result.k}`);
  for (const r of failed) {
    const l = labels(r);
    for (const k of l) bump(k, row.id);
    console.log(`  #${r.n}  ${l.join(", ").padEnd(32)} ${r.why.join("; ").slice(0, 100)}`);
    if (r.sessionId && index.has(r.sessionId)) console.log(`       ${index.get(r.sessionId)}`);
  }
}

console.log("\nfix in this order (runs affected):");
for (const [k, ids] of [...counts].sort((a, b) => b[1].length - a[1].length))
  console.log(`  ${String(ids.length).padStart(3)}  ${k.padEnd(26)} ${[...new Set(ids)].join(", ")}`);
