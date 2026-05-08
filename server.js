const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 5173);
const HOST = process.env.HOST || "127.0.0.1";
const BACKEND_URL = new URL(process.env.BACKEND_URL || "http://localhost:8080");
const ROOT = path.join(__dirname, "src");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(ROOT, requested));

  if (!filePath.startsWith(ROOT)) {
    send(res, 403, "Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      send(res, 404, "Not found", { "content-type": "text/plain; charset=utf-8" });
      return;
    }
    send(res, 200, data, {
      "content-type": TYPES[path.extname(filePath)] || "application/octet-stream",
      "cache-control": "no-store",
    });
  });
}

function proxy(req, res) {
  const incoming = new URL(req.url, `http://${req.headers.host}`);
  const target = new URL(incoming.pathname.replace(/^\/api/, "") + incoming.search, BACKEND_URL);

  const headers = { ...req.headers, host: target.host };
  delete headers.connection;
  delete headers["content-length"];

  const transport = target.protocol === "https:" ? https : http;
  const upstream = transport.request(
    target,
    {
      method: req.method,
      headers,
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode || 502, {
        ...upstreamRes.headers,
        "access-control-allow-origin": "*",
      });
      upstreamRes.pipe(res);
    }
  );

  upstream.on("error", (err) => {
    send(
      res,
      502,
      JSON.stringify({ detail: `Could not reach analytics backend: ${err.message}` }),
      { "content-type": "application/json; charset=utf-8" }
    );
  });

  req.pipe(upstream);
}

const server = http.createServer((req, res) => {
  if (req.url && req.url.startsWith("/api/")) {
    proxy(req, res);
    return;
  }
  serveStatic(req, res);
});

server.listen(PORT, HOST, () => {
  console.log(`Platform Analytics Web running at http://${HOST}:${PORT}`);
  console.log(`Proxying /api/* to ${BACKEND_URL.href}`);
});
