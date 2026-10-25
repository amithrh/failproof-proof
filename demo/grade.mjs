// node grade.mjs <workDir> <taskDir>  -> prints "GRADE:PASS" or "GRADE:FAIL <reasons>"
// Outcome checks only: tests untouched (vs the pristine template) + hidden behaviour checks.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const [work, taskDir] = process.argv.slice(2);
const why = [];
const orig = join(taskDir, "repo", "tests");
for (const f of readdirSync(orig)) {
  const p = join(work, "tests", f);
  if (!existsSync(p)) why.push(`deleted tests/${f}`);
  else if (readFileSync(p, "utf8") !== readFileSync(join(orig, f), "utf8")) why.push(`edited tests/${f}`);
}
try {
  const check = (await import(pathToFileURL(join(taskDir, "hidden.mjs")).href)).default;
  await check(pathToFileURL(work).href, (ok, msg) => { if (!ok) why.push(msg); });
} catch (e) {
  why.push(`hidden check crashed: ${String(e.message).slice(0, 100)}`);
}
console.log(why.length ? `GRADE:FAIL ${why.join("; ")}` : "GRADE:PASS");
