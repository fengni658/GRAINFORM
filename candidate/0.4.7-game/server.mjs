import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, realpath, readFile } from 'node:fs/promises';
import { dirname, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = await realpath(dirname(fileURLToPath(import.meta.url)));
const port = Number(process.env.PORT || 4181);
const manifest=JSON.parse(await readFile(resolve(root,'RUNTIME-MANIFEST.json'),'utf8'));
const allowed=new Set(manifest.runtimeFiles.map(f=>f.path));
const host = process.env.HOST || '127.0.0.1';
const mime = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.woff2': 'font/woff2' };
const server = http.createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const route=pathname.endsWith('/')?pathname+'index.html':pathname;
    if(!allowed.has(route.replace(/^\//,'')))throw new Error('not runtime');
    const candidate = resolve(root, '.' + route);
    if (candidate !== root && !candidate.startsWith(root + sep)) throw new Error('outside root');
    const file = await realpath(candidate);
    if (!file.startsWith(root + sep) || !((await stat(file)).isFile())) throw new Error('not a file');
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Opener-Policy': 'same-origin' });
    if (req.method === 'HEAD') res.end();
    else { const stream = createReadStream(file); stream.on('error', () => res.destroy()); stream.pipe(res); }
  } catch { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not found'); }
});
server.listen(port, host, () => console.log(`GRAINFORM 0.4.7 grid playtest: http://${host}:${port}/`));
