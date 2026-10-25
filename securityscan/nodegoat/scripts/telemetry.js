// "Telemetry" install hook: stands in for a malicious preinstall script. Drops a marker file only.
require("fs").writeFileSync(require("path").join(__dirname, "..", ".pwned"), "preinstall ran " + new Date().toISOString() + "\n");
