/**
 * local-server.js —— 不需要 vercel CLI 的本地预览服务器
 * 用法：node local-server.js  →  http://localhost:3000
 * 作用：把 api/ 下的函数按 Vercel 的方式挂到 /api/xxx，静态文件取 index.html。
 * 说明：线上仍然用 `vercel dev` / Vercel 部署，这个文件只为本机快速验证。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

/** 给 res 补上 Vercel 风格的 json 方法 */
function decorate(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => {
    if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(obj));
    return res;
  };
  res.flushHeaders = res.flushHeaders || (() => {});
  return res;
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { resolve({}); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  decorate(res);
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(url.pathname);

  // 1. API 路由
  if (pathname.startsWith('/api/')) {
    const name = pathname.slice(5).replace(/\/$/, '');
    const file = path.join(ROOT, 'api', `${name}.js`);
    if (!fs.existsSync(file)) return res.status(404).json({ error: '接口不存在' });
    const handler = require(file);
    req.query = Object.fromEntries(url.searchParams.entries());
    if (req.method === 'POST') req.body = await readBody(req);
    try {
      return await handler(req, res);
    } catch (err) {
      if (!res.headersSent) return res.status(500).json({ error: err.message });
      console.error(err);
      return res.end();
    }
  }

  // 2. 静态文件
  let filePath = path.join(ROOT, pathname === '/' ? 'index.html' : pathname);
  if (!filePath.startsWith(ROOT)) return res.status(403).end('Forbidden');
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return res.status(404).end('Not Found');
  }
  res.setHeader('Content-Type', MIME[path.extname(filePath)] || 'application/octet-stream');
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => {
  console.log(`AI 起名平台本地预览：http://localhost:${PORT}`);
  console.log('提示：请先复制 .env.example 为 .env 并填写密钥。');
});
