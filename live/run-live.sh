#!/usr/bin/env bash
# Live agent demo: Claude Code + failproofai on the hidden-injection task.
# Shows every tool call, highlights the moment failproof blocks, then the grade.
#   bash live/run-live.sh            (from the kit root, in WSL)
#   TASK_ID=tamper-tests bash live/run-live.sh
set -uo pipefail
cd "$(dirname "$0")/.."
TASK_ID="${TASK_ID:-injection}"; MODE="${MODE:-failproof}"
PROMPT="$(node -e 'const t=require("./demo/tasks.json").find(x=>x.id===process.argv[1]);process.stdout.write(t.prompt)' "$TASK_ID")"
echo -e "\n\033[1mTask:\033[0m $TASK_ID   \033[1mMode:\033[0m $MODE\n\033[1mPrompt:\033[0m $PROMPT\n"
echo "running the agent (about 1-2 min)..."
out="$(cd demo && TASK_ID=$TASK_ID PROMPT="$PROMPT" MODE=$MODE ./run.sh 2>/tmp/live-grade.txt)"
sid="$(OUT="$out" node -e 'try{process.stdout.write(JSON.parse(process.env.OUT).session_id||"")}catch{}')"
tx="$(ls ~/.claude/projects/*/"$sid".jsonl 2>/dev/null | head -1)"
[ -n "$tx" ] && node - "$tx" <<'JS'
const fs = require("fs");
const R = "\x1b[31m", G = "\x1b[32m", B = "\x1b[1m", D = "\x1b[2m", X = "\x1b[0m";
const uses = new Map();
for (const l of fs.readFileSync(process.argv[2], "utf8").split("\n")) {
  let r; try { r = JSON.parse(l); } catch { continue; }
  for (const b of Array.isArray(r?.message?.content) ? r.message.content : []) {
    if (b.type === "tool_use") uses.set(b.id, `${b.name} ${(b.input.command ?? b.input.file_path ?? "").toString().replace(/\s+/g, " ").slice(0, 90)}`);
    if (b.type === "tool_result") {
      const txt = JSON.stringify(b.content);
      const m = /by failproofai because: (.{0,160})/.exec(txt);
      if (m) console.log(`  ${R}${B}BLOCKED by failproofai${X} ${uses.get(b.tool_use_id)}\n      ${D}${m[1].replace(/\n/g, " ")}${X}`);
      else console.log(`  ${G}ok${X}  ${D}${uses.get(b.tool_use_id)}${X}`);
    }
  }
}
JS
echo; OUT="$out" node -e 'const j=JSON.parse(process.env.OUT);console.log(`\x1b[1mturns\x1b[0m ${j.num_turns}   \x1b[1mcost\x1b[0m $${j.total_cost_usd.toFixed(3)}   \x1b[1mblocked\x1b[0m ${j.permission_denials.length}`);console.log("\n\x1b[1mAgent answer:\x1b[0m\n"+String(j.result).split("\n").slice(1).join("\n").slice(0,700))' 2>/dev/null
echo -e "\n\033[1mGrade:\033[0m $(cat /tmp/live-grade.txt)"
