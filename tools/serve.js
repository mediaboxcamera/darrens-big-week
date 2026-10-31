#!/usr/bin/env node
// Tiny static file server: node tools/serve.js <dir> <port>
import http from 'http';
import fs from 'fs';
import path from 'path';
const dir = path.resolve(process.argv[2] || 'dist');
const port = parseInt(process.argv[3] || '8080', 10);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.svg': 'image/svg+xml' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(dir, p);
  if (!file.startsWith(dir)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}).listen(port, () => console.log(`Serving ${dir} at http://localhost:${port}/`));
