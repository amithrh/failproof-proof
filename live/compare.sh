#!/usr/bin/env bash
# Run one task once WITHOUT failproof and once WITH failproof, side by side.
# Prints the prompts used, how failproof is wired into Claude Code, every action failproof checked
# (and what it blocked), then both grades.
#   live/compare.sh <dir: demo|securityscan> <task id> [extra env for run.sh, e.g. TARGET=nodegoat]
set -uo pipefail
cd "$(dirname "$0")/.."
dir="$1"; task="$2"; shift 2
prompt="$(node -e 'const t=require("./"+process.argv[1]+"/tasks.json").find(x=>x.id===process.argv[2]);process.stdout.write(t.prompt)' "$dir" "$task")"
sysprompt="$([ "$dir" = demo ] && echo demo/AGENT_PROMPT.md || echo agent/AGENT_PROMPT.md)"
B="\033[1m"; R="\033[31m"; G="\033[32m"; Y="\033[33m"; C="\033[36m"; D="\033[2m"; X="\033[0m"
rule() { echo -e "${D}────────────────────────────────────────────────────────────────────────${X}"; }

rule
echo -e "${B}TASK${X}  $task"
echo -e "${B}USER PROMPT${X} (both runs get exactly this):"
echo -e "  ${C}\"$prompt\"${X}"
rule
echo -e "${B}RUN 1: WITHOUT failproof${X}"
echo -e "  ${D}claude -p \"<user prompt>\" --output-format json --allowedTools Read,Glob,Grep,Edit,Write,Bash${X}"
echo -e "  no system prompt, no hooks: nothing checks the agent's actions"
echo
echo -e "${B}RUN 2: WITH failproof${X}"
echo -e "  1. system prompt added: ${D}--append-system-prompt \"\$(cat $sysprompt)\"${X}"
sed 's/^/       /' "$sysprompt" | head -14 | sed "s/^/$(printf '\033[2m')/;s/$/$(printf '\033[0m')/"
echo -e "  2. failproof installed into the task repo:"
pol=".failproofai/policies/reliability-policies.mjs"; [ "$dir" = securityscan ] && pol=".failproofai/policies/all-policies.mjs"
echo -e "     ${Y}failproofai policies --install --custom $pol --scope project${X}"
echo -e "  3. that writes ${B}.claude/settings.json${X}, so Claude Code calls failproof on every event:"
echo -e "     ${D}PreToolUse${X} → ${Y}npx -y failproofai --hook PreToolUse${X}   ${D}(before every Bash/Edit/Write)${X}"
echo -e "     ${D}Stop${X}       → ${Y}npx -y failproofai --hook Stop${X}         ${D}(when the agent tries to finish)${X}"
echo -e "  4. failproof runs our policies on each call → ${G}allow${X} or ${R}deny(\"why + what to do instead\")${X}:"
for f in policies/reliability-policies.mjs $([ "$dir" = securityscan ] && echo securityscan/scan-policies.mjs); do
  grep -oE 'name: "[^"]+"' "$f" | cut -d'"' -f2 | tr '\n' ' ' | fold -s -w 66 | sed 's/^/       /'; echo
done
rule
echo -e "Running both now, in parallel ${D}(about 1-2 min for demo 2, longer for demo 3)${X}..."
out_dir="$(mktemp -d /tmp/compare-XXXX)"
start=$SECONDS
for m in baseline failproof; do
  ( cd "$dir" && env "$@" TASK_ID="$task" PROMPT="$prompt" MODE="$m" ./run.sh >"$out_dir/$m.json" 2>"$out_dir/$m.grade" ) &
done
wait
echo -e "${D}done in $((SECONDS - start))s${X}"

# Every tool call from the session transcript; failproof's denials are marked.
show_actions() {
  local m="$1" sid tx
  sid="$(node -e 'try{process.stdout.write(require("'$out_dir'/'$m'.json").session_id||"")}catch{}')"
  tx="$(ls ~/.claude/projects/*/"$sid".jsonl 2>/dev/null | head -1)"
  [ -z "$tx" ] && { echo -e "  ${D}(transcript not found)${X}"; return; }
  MODE="$m" node - "$tx" <<'JS'
const fs = require("fs");
const R = "\x1b[31m", G = "\x1b[32m", B = "\x1b[1m", D = "\x1b[2m", Y = "\x1b[33m", X = "\x1b[0m";
const fp = process.env.MODE === "failproof";
const uses = new Map(); let n = 0, blocked = 0;
for (const l of fs.readFileSync(process.argv[2], "utf8").split("\n")) {
  let r; try { r = JSON.parse(l); } catch { continue; }
  for (const b of Array.isArray(r?.message?.content) ? r.message.content : []) {
    if (b.type === "tool_use") uses.set(b.id, `${b.name} ${String(b.input.command ?? b.input.file_path ?? b.input.pattern ?? "").replace(/\s+/g, " ").slice(0, 80)}`);
    if (b.type === "tool_result") {
      n++;
      const txt = JSON.stringify(b.content);
      // A real failproof denial is an error result: "...hook error: Blocked <Tool> by failproofai because: <reason>"
      const m = /Blocked \w+ by failproofai because:\s*(.{0,160})/.exec(txt);
      if (fp && m && b.is_error) {
        blocked++;
        console.log(`  ${R}${B}BLOCKED${X} ${uses.get(b.tool_use_id)}\n          ${Y}${m[1].replace(/, as per the policy configured by the user.*/, "").replace(/\\n|\\"/g, " ")}${X}`);
      } else console.log(`  ${fp ? G + "checked ✓" : D + "unchecked"}${X} ${D}${uses.get(b.tool_use_id)}${X}`);
    }
  }
}
console.log(fp ? `  ${B}failproof checked ${n} actions, blocked ${blocked}${X}` : `  ${D}${n} actions, none checked${X}`);
JS
}

for m in baseline failproof; do
  rule
  label=$([ "$m" = baseline ] && echo "RUN 1: WITHOUT failproof" || echo "RUN 2: WITH failproof")
  echo -e "${B}${label}${X}: what the agent did"
  show_actions "$m"
done

rule
echo -e "${B}RESULT${X}"
for m in baseline failproof; do
  label=$([ "$m" = baseline ] && echo "WITHOUT failproof" || echo "WITH failproof   ")
  g="$(grep -o 'GRADE:[A-Z]*[^[]*' "$out_dir/$m.grade" | head -1)"
  cost="$(node -e 'try{const j=require("'$out_dir'/'$m'.json");process.stdout.write(`${j.num_turns} turns, $${(j.total_cost_usd||0).toFixed(3)}`)}catch{}')"
  if [[ "$g" == GRADE:PASS* ]]; then c=$G; else c=$R; fi
  echo -e "  ${B}${label}${X}  ${c}${B}${g:-no grade}${X}  ${D}${cost}${X}"
done
echo -e "\n${D}One run each, so results can vary. The saved 3-run results are in results/ and on the demo page.${X}\n"
