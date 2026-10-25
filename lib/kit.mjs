// kit — small helpers for failproofai policies. Works for Claude Code and Codex.
//
//   import { callOf, history, sameArgs, isError, short, sessionState } from "../lib/kit.mjs";

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ---- the call being decided -------------------------------------------------

/** `{ name, server, tool, args }`. server/tool are split for MCP names (mcp__srv__tool). */
export function callOf(ctx) {
  const name = ctx?.toolName ?? "";
  const m = /^mcp__(.+?)__(.+)$/.exec(name);
  return { name, server: m?.[1] ?? null, tool: m?.[2] ?? name, args: ctx?.toolInput ?? {} };
}

// ---- transcript ---------------------------------------------------------------

const MAX_BYTES = 8 * 1024 * 1024;

function readJsonl(path) {
  if (!path || !existsSync(path)) return [];
  let text = readFileSync(path, "utf8");
  if (statSync(path).size > MAX_BYTES) text = text.slice(-MAX_BYTES);
  const rows = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      // partially written last line
    }
  }
  return rows;
}

const textOf = (c) =>
  typeof c === "string" ? c
  : Array.isArray(c) ? c.map((x) => (typeof x === "string" ? x : x?.text ?? "")).join("\n")
  : c && typeof c === "object" ? textOf(c.content ?? c.text ?? "")
  : "";

const tryJson = (s) => {
  if (typeof s !== "string") return s ?? null;
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
};

export const transcriptPath = (ctx) => ctx?.session?.transcriptPath ?? ctx?.payload?.transcript_path;

/**
 * Every earlier tool call in the session, oldest first:
 * `[{ name, server, tool, args, result, error }]`. `result` is the parsed tool
 * output (null while pending or if blocked); `error` is true when the harness
 * flagged the result as an error.
 */
export function history(ctx) {
  const calls = [];
  const byId = new Map();
  const add = (id, name, args) => {
    const m = /^mcp__(.+?)__(.+)$/.exec(name ?? "");
    const c = { name, server: m?.[1] ?? null, tool: m?.[2] ?? name, args: args ?? {}, result: null, error: false };
    calls.push(c);
    if (id) byId.set(id, c);
  };
  const settle = (id, content, error) => {
    const c = byId.get(id);
    if (!c) return;
    c.result = tryJson(textOf(content));
    c.error = Boolean(error);
  };
  for (const r of readJsonl(transcriptPath(ctx))) {
    // Claude Code
    const content = r?.message?.content;
    if (Array.isArray(content)) {
      for (const b of content) {
        if (b.type === "tool_use") add(b.id, b.name, b.input);
        if (b.type === "tool_result") settle(b.tool_use_id, b.content, b.is_error);
      }
    }
    // Codex rollout
    const p = r?.type === "response_item" ? r.payload : null;
    if (p?.type === "function_call" || p?.type === "custom_tool_call")
      add(p.call_id, p.namespace ? `${p.namespace}__${p.name}` : p.name, tryJson(p.arguments));
    if (p?.type === "function_call_output" || p?.type === "custom_tool_call_output") settle(p.call_id, p.output, false);
  }
  return calls;
}

// ---- comparisons --------------------------------------------------------------

const stable = (v) =>
  Array.isArray(v) ? `[${v.map(stable).join(",")}]`
  : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}`
  : JSON.stringify(v);

/** Same tool and deep-equal args (key order ignored). */
export const sameArgs = (a, b) => a.name === b.name && stable(a.args) === stable(b.args);

/** Heuristic: did this earlier call fail? */
export function isError(call) {
  if (call.error) return true;
  const r = call.result;
  if (r && typeof r === "object") return Boolean(r.error || r.isError || r.ok === false || r.success === false);
  return typeof r === "string" && /^\s*(error|traceback|exception)\b/i.test(r);
}

/** One-line preview of any value, for deny reasons. */
export function short(v, max = 240) {
  const s = (typeof v === "string" ? v : JSON.stringify(v) ?? "").replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

// ---- per-session state (counters that must survive across hook calls) ---------

/** `{ get(key, dflt), set(key, value) }` backed by a JSON file per session. */
export function sessionState(ctx) {
  const id = String(ctx?.session?.sessionId ?? ctx?.payload?.session_id ?? "no-session").replace(/[^\w.-]/g, "_");
  const dir = join(tmpdir(), "fp-kit");
  const file = join(dir, `${id}.json`);
  const load = () => {
    try {
      return JSON.parse(readFileSync(file, "utf8"));
    } catch {
      return {};
    }
  };
  return {
    get: (k, dflt) => load()[k] ?? dflt,
    set: (k, v) => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(file, JSON.stringify({ ...load(), [k]: v }));
    },
  };
}
