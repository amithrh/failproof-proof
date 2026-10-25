#!/usr/bin/env bash
# Start the three modes in parallel in the background; logs in /tmp/matrix-<mode>.log
cd "$(dirname "$0")/.."
pkill -f "eval/pass3.mjs" 2>/dev/null; sleep 1
for m in baseline prompt failproof; do
  nohup node eval/pass3.mjs --tasks demo/tasks.json --label "$m" --cwd demo --cmd "MODE=$m ./run.sh" -k 3 -j 4 > "/tmp/matrix-$m.log" 2>&1 &
done
sleep 3; ls -la /tmp/matrix-*.log; pgrep -fa pass3 | head
