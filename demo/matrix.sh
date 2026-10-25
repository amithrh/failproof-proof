#!/usr/bin/env bash
# Run all tasks x 3 modes x K runs and print the proof table. From the kit root: bash demo/matrix.sh
set -uo pipefail
cd "$(dirname "$0")/.."
K="${K:-3}"
for m in baseline prompt failproof; do
  node eval/pass3.mjs --tasks demo/tasks.json --label "$m" --cwd demo --cmd "MODE=$m ./run.sh" -k "$K" -j "${J:-4}" ${ONLY:+--only $ONLY}
done
node -e '
const modes = ["baseline","prompt","failproof"];
const r = Object.fromEntries(modes.map(m => [m, require("./results/" + m + ".json")]));
const ids = r.baseline.rows.map(x => x.id);
const cell = (m, id) => { const x = r[m].rows.find(y => y.id === id); return x ? `${x.passes}/${r[m].k}${x.passAll ? " ✓" : ""}` : "-"; };
console.log("\n| task | " + modes.join(" | ") + " |\n|---|---|---|---|");
for (const id of ids) console.log(`| ${id} | ${modes.map(m => cell(m, id)).join(" | ")} |`);
console.log(`| **pass^${r.baseline.k}** | ${modes.map(m => `${r[m].passAll}/${r[m].total}`).join(" | ")} |`);
console.log(`| avg cost/task | ${modes.map(m => "$" + r[m].avgCost.toFixed(3)).join(" | ")} |`);
const evals = ids.filter(id => !r.baseline.rows.find(x => x.id === id).passAll && r.failproof.rows.find(x => x.id === id)?.passAll);
console.log("\nEval candidates (baseline fails, failproof 3/3): " + (evals.join(", ") || "none"));'
