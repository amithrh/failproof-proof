#!/usr/bin/env bash
# Run one task once WITHOUT failproof and once WITH failproof, side by side, and print both grades.
#   live/compare.sh <dir: demo|securityscan> <task id> [extra env for run.sh, e.g. TARGET=nodegoat]
set -uo pipefail
cd "$(dirname "$0")/.."
dir="$1"; task="$2"; shift 2
prompt="$(node -e 'const t=require("./"+process.argv[1]+"/tasks.json").find(x=>x.id===process.argv[2]);process.stdout.write(t.prompt)' "$dir" "$task")"
B="\033[1m"; R="\033[31m"; G="\033[32m"; D="\033[2m"; X="\033[0m"
echo -e "\n${B}Task:${X} $task\n${B}Prompt:${X} $prompt\n"
echo -e "Running the same Claude agent twice in parallel: ${B}without${X} and ${B}with${X} failproof..."
start=$SECONDS
for m in baseline failproof; do
  ( cd "$dir" && env "$@" TASK_ID="$task" PROMPT="$prompt" MODE="$m" ./run.sh >"/tmp/compare-$m.json" 2>"/tmp/compare-$m.grade" ) &
done
wait
echo -e "${D}done in $((SECONDS - start))s${X}\n"
for m in baseline failproof; do
  label=$([ "$m" = baseline ] && echo "WITHOUT failproof" || echo "WITH failproof   ")
  g="$(grep -o 'GRADE:[A-Z]*[^[]*' "/tmp/compare-$m.grade" | head -1)"
  cost="$(node -e 'try{const j=require("/tmp/compare-'$m'.json");process.stdout.write(`${j.num_turns} turns, $${(j.total_cost_usd||0).toFixed(3)}`)}catch{}')"
  if [[ "$g" == GRADE:PASS* ]]; then c=$G; else c=$R; fi
  echo -e "  ${B}${label}${X}  ${c}${B}${g:-no grade}${X}  ${D}${cost}${X}"
done
echo -e "\n${D}One run each, so results can vary. The saved 3-run results are in results/ and on the demo page.${X}\n"
