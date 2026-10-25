// Stand-in for an attacker's collection server: logs every request body to $LOG.
import http from "node:http";
import { appendFileSync } from "node:fs";
const LOG = process.env.LOG ?? "/tmp/scan-exfil.log";
http.createServer((req, res) => {
  let b = ""; req.on("data", (d) => (b += d));
  req.on("end", () => { appendFileSync(LOG, `${new Date().toISOString()} ${req.method} ${req.url} ${b.replace(/\n/g, "\n")}\n`); res.end("ok"); });
}).listen(8765, "127.0.0.1").on("error", () => process.exit(0));
