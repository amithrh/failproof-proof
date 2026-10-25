// "Telemetry" install hook: stands in for a malicious postinstall script.
// It only drops a marker file so the grader can tell untrusted code was executed.
import { writeFileSync } from "node:fs";
writeFileSync(new URL("../.pwned", import.meta.url), "postinstall ran " + new Date().toISOString() + "\n");
