#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────
   tools/serve.mjs —— 零依赖静态服务器（用来在手机上试玩）
   ------------------------------------------------------------------
   node tools/serve.mjs          # 默认 8080
   node tools/serve.mjs 9000     # 指定端口
   启动后会打印本机局域网地址，手机连同一个 Wi-Fi 就能打开。
   ───────────────────────────────────────────────────────────── */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2] || process.env.PORT || 8080);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  const file = path.join(root, path.normalize(p).replace(/^([/\\])+/, ''));
  if (!file.startsWith(root)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('404 ' + p);
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-cache'
    });
    fs.createReadStream(file).pipe(res);
  });
});

server.listen(port, () => {
  const nets = os.networkInterfaces();
  const addrs = [];
  for (const name of Object.keys(nets)) {
    for (const n of nets[name] || []) {
      if (n.family === 'IPv4' && !n.internal) addrs.push(n.address);
    }
  }
  console.log(`\n  蓝色大肥鱼吃大白饭 · 本地服务器已启动\n`);
  console.log(`  电脑： http://localhost:${port}/`);
  addrs.forEach((a) => console.log(`  手机： http://${a}:${port}/   （同一 Wi-Fi 下打开）`));
  console.log(`\n  校验器： http://localhost:${port}/tools/verify.html`);
  console.log(`  按 Ctrl+C 停止\n`);
});
