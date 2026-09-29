import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const root = new URL('../dist/', import.meta.url).pathname;
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.webmanifest':'application/manifest+json' };
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    const safe = normalize(pathname).replace(/^([.][.][/\\])+/, '');
    let file = join(root, safe === '/' ? 'index.html' : safe);
    const s = await stat(file).catch(() => null);
    if (!s || s.isDirectory()) file = join(root, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
});
const port = Number(process.env.PORT ?? 4173);
server.listen(port, '127.0.0.1', () => console.log(`Nourish served at http://127.0.0.1:${port}`));
