/**
 * Minimal static file server for the Conexus frontend.
 *
 * Replaces the VS Code "Go Live" extension so the app can be served with
 * `npm start` on any machine, with no dependencies to install.
 *
 *   node tools/dev-server.js [port]
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.argv[2]) || 5500;
const ROOT = path.resolve(__dirname, "..");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  const relative = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const filePath = path.join(ROOT, relative);

  // Never serve anything outside the project directory.
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(`404 — ${relative} not found`);
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      // Always re-read during development so edits show up on refresh.
      "Cache-Control": "no-store"
    });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Conexus frontend  ->  http://localhost:${PORT}`);
  console.log(`Serving           ->  ${ROOT}`);
  console.log(`Backend expected  ->  http://localhost:8080  (start it separately)`);
  console.log(`Stop with Ctrl+C`);
});
