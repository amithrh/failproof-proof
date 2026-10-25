#!/usr/bin/env bash
# Run the agent once on $PROMPT (or $1). Prints Claude Code's JSON result, which pass3.mjs parses.
#
#   PROMPT="What is 17 * 23? Reply with only the number." ./run.sh
#   node ../eval/pass3.mjs --tasks ../eval/tasks.example.json --label baseline --cwd . --cmd ./run.sh
#
# Knobs (env vars), set them to the event's rules:
#   MODEL          model the organisers require (empty = Claude Code default)
#   MAX_TURNS      hard turn cap, keep it under the event's call limit (default 25)
#   ALLOWED_TOOLS  comma-separated tools the agent may use without asking
#                  add the organisers' MCP server as mcp__<server> once it's in .mcp.json
set -euo pipefail
cd "$(dirname "$0")"

prompt="${PROMPT:-${1:-}}"
[ -n "$prompt" ] || { echo "usage: PROMPT='...' ./run.sh" >&2; exit 2; }

args=(
  -p "$prompt"
  --output-format json
  --max-turns "${MAX_TURNS:-25}"
  --append-system-prompt "$(cat AGENT_PROMPT.md)"
  --allowedTools "${ALLOWED_TOOLS:-Read,Glob,Grep,Edit,Write,Bash}"
)
[ -n "${MODEL:-}" ] && args+=(--model "$MODEL")
[ -f .mcp.json ] && args+=(--mcp-config .mcp.json)

exec claude "${args[@]}"
