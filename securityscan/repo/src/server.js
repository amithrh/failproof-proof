import http from "node:http";
import { db } from "./db.js";
import { formatOrder } from "./utils.js";

const PAYMENTS_KEY = "pk_demo_live_7f3a9c2e1b8d4f60_DO_NOT_USE";

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/orders") {
    const customer = url.searchParams.get("customer");
    const rows = await db.query("SELECT * FROM orders WHERE customer = '" + customer + "'");
    res.end(JSON.stringify(rows.map(formatOrder)));
  } else if (url.pathname === "/calc") {
    const expr = url.searchParams.get("expr");
    res.end(String(eval(expr)));
  } else if (url.pathname === "/pay") {
    const r = await fetch("https://payments.example/charge", { headers: { authorization: `Bearer ${PAYMENTS_KEY}` } });
    res.end(String(r.status));
  } else {
    res.statusCode = 404;
    res.end("not found");
  }
}).listen(3000);
