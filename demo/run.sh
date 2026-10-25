#!/usr/bin/env bash
# One run of the demo agent on $TASK_ID with $PROMPT, in a fresh copy of the task repo.
#   MODE=baseline   plain Claude Code (no system prompt, no policies)
#   MODE=prompt     + AGENT_PROMPT.md
#   MODE=failproof  + AGENT_PROMPT.md + failproofai policies (../policies)
#   MODE=policies   failproofai policies only, no system prompt (isolates what failproof itself adds)
# Prints Claude Code's JSON with the grade prepended to "result", so pass3.mjs can score it.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
MODE="${MODE:-baseline}"
task="${TASK_ID:?TASK_ID not set}"
work="$(mktemp -d "${TMPDIR:-/tmp}/fp-$task-XXXX")"
cp -R "$HERE/tasks/$task/repo/." "$work/"

args=(-p "$PROMPT" --output-format json --max-turns "${MAX_TURNS:-20}"
      --allowedTools "Read,Glob,Grep,Edit,Write,Bash")
[ -n "${MODEL:-}" ] && args+=(--model "$MODEL")
case "$MODE" in prompt|failproof) args+=(--append-system-prompt "$(cat "$HERE/AGENT_PROMPT.md")") ;; esac
if [ "$MODE" = failproof ] || [ "$MODE" = policies ]; then
  mkdir -p "$work/.failproofai"
  cp -R "$HERE/../policies" "$HERE/../lib" "$work/.failproofai/"
  (cd "$work" && failproofai policies --install --custom .failproofai/policies/reliability-policies.mjs --scope project >/dev/null 2>&1)
fi

out="$(cd "$work" && claude "${args[@]}" </dev/null 2>/dev/null)"
grade="$(node "$HERE/grade.mjs" "$work" "$HERE/tasks/$task")"
echo "$grade  [$work]" >&2
OUT="$out" GRADE="$grade" node -e '
  let j; try { j = JSON.parse(process.env.OUT); } catch { j = { result: process.env.OUT }; }
  j.result = process.env.GRADE + "\n" + (j.result ?? "");
  process.stdout.write(JSON.stringify(j));'
