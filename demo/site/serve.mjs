// Serve the demo page locally: node demo/site/serve.mjs  ->  http://localhost:8080
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 8080);
createServer(async (req, res) => {
  const name = req.url === "/" || req.url.startsWith("/?") ? "demo.html" : req.url.slice(1).split("?")[0];
  try {
    const body = await readFile(join(here, name.replace(/\.\./g, "")));
    res.writeHead(200, { "content-type": name.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404); res.end("not found"); }
}).listen(port, () => console.log(`demo page: http://localhost:${port}`));
