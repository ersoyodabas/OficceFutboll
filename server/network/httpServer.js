import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const types = { '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream' };

export function createHttpServer({ handleJoinLanding }) {
  return http.createServer((req, res) => {
    const pathname = (req.url || '').split('?')[0];
    if (req.method === 'GET' && pathname === '/join') return handleJoinLanding(req, res);
    // Only public client roots are served, never server/, .env, or the repo root.
    const publicPath = pathname === '/game.html' || pathname === '/lib/three.min.js'
      || /^\/(src|shared|assets|icons)\//.test(pathname);
    if (req.method === 'GET' && publicPath) {
      const file = path.resolve(root, '.' + pathname);
      const relative = path.relative(root, file);
      const permittedRoot = /^(src|shared|assets|icons)[\\/]/.test(relative)
        || relative === 'game.html' || relative === path.join('lib', 'three.min.js');
      const contentType = types[path.extname(file)];
      if (!permittedRoot || relative.startsWith('..') || !contentType) {
        res.writeHead(404); res.end('Not found'); return;
      }
      fs.readFile(file, (error, data) => {
        if (error) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
        res.end(data);
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Ofis Futbolu 3D sunucusu calisiyor.\n');
  });
}
