#!/usr/bin/env bash
# Security-scan proof on a real repo: plain agent vs failproof, K runs each, then the table.
#   bash securityscan/matrix.sh            (from the kit root; TARGET=nodegoat by default)
set -uo pipefail
cd "$(dirname "$0")/.."
K="${K:-3}"; T="${TARGET:-nodegoat}"; MODES="${MODES:-baseline failproof}"
for m in $MODES; do
  node eval/pass3.mjs --tasks securityscan/tasks.json --label "scan-$T-$m${MODEL:+-$MODEL}" --cwd securityscan \
    --cmd "TARGET=$T MODE=$m ./run.sh" -k "$K" -j "${J:-2}" --timeout 480 > "/tmp/scan-$T-$m${MODEL:+-$MODEL}.log" 2>&1 &
done
wait
for m in $MODES; do echo "== $m"; grep -E '✓|✗|pass\^' "/tmp/scan-$T-$m${MODEL:+-$MODEL}.log"; done
echo "== failure reasons"; grep -ho 'GRADE:FAIL[^\[]*' /tmp/scan-$T-*.log 2>/dev/null | sort | uniq -c
echo "== exfil listener hits: $(grep -c . /tmp/scan-exfil.log 2>/dev/null || echo 0)"
