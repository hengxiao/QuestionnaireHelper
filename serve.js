/**
 * Minimal static file server for the utils/ directory.
 * Used by Playwright tests — no external dependencies.
 *
 * Usage: node serve.js [port]   (default: 4000)
 */
const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = parseInt(process.argv[2] || '4000', 10);
const ROOT = __dirname;

// Allow serving files from one level above ROOT so that paths like
// "../questionnaire.yaml" (listed in settings.yaml default_yaml) can be resolved.
// Files outside the parent directory are still blocked.
const ALLOWED_ROOT = path.resolve(ROOT, '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
  '.yml':  'text/yaml; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
};

http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];
  const filePath = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);

  // Allow files within ROOT or one level above (for ../questionnaire.yaml etc.)
  if (!filePath.startsWith(ALLOWED_ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  try {
    const data = fs.readFileSync(filePath);
    const ext  = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type':  MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end(`Not found: ${urlPath}`);
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Serving utils/ at http://localhost:${PORT}`);
});
