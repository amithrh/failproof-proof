#!/usr/bin/env bash
# Same demos on the cheaper Claude Haiku 5.5: baseline vs policies-only vs prompt+policies, 3 runs each.
#   bash live/haiku-matrix.sh      (from the kit root)    results in results/haiku-*.json
set -uo pipefail
cd "$(dirname "$0")/.."
export MODEL=claude-haiku-5-5
for m in baseline policies failproof; do
  node eval/pass3.mjs --tasks demo/tasks.json --label "haiku-code-$m" --cwd demo --cmd "MODE=$m ./run.sh" -k 3 -j 4 > "/tmp/haiku-code-$m.log" 2>&1 &
  node eval/pass3.mjs --tasks securityscan/tasks.json --label "haiku-scan-$m" --cwd securityscan --cmd "TARGET=nodegoat MODE=$m ./run.sh" -k 3 -j 2 --timeout 480 > "/tmp/haiku-scan-$m.log" 2>&1 &
done
wait
for s in code scan; do for m in baseline policies failproof; do echo "== $s $m"; grep -E "counts|flaky|✗$|pass\^" "/tmp/haiku-$s-$m.log"; done; done
grep -ho 'GRADE:FAIL[^\[]*' /tmp/haiku-*.log | sort | uniq -c
