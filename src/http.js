import http from 'node:http';
import crypto from 'node:crypto';
import { LicenseError } from './service.js';
import { adminPageHtml } from './admin-page.js';

function sendHtml(res, html) {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
}

const BODY_LIMIT = 64 * 1024;
const RATE_LIMIT = { windowMs: 60_000, max: 60 }; // 60 request/phút/IP cho endpoint public

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > BODY_LIMIT) {
        reject(new LicenseError(413, 'payload_too_large', 'Body quá lớn'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new LicenseError(400, 'bad_json', 'Body không phải JSON hợp lệ'));
      }
    });
    req.on('error', reject);
  });
}

function tokenEquals(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function createRateLimiter() {
  const hits = new Map();
  return (ip) => {
    const ts = Date.now();
    const entry = hits.get(ip);
    if (!entry || ts > entry.resetAt) {
      hits.set(ip, { count: 1, resetAt: ts + RATE_LIMIT.windowMs });
      if (hits.size > 10_000) {
        for (const [k, v] of hits) if (ts > v.resetAt) hits.delete(k);
      }
      return true;
    }
    entry.count += 1;
    return entry.count <= RATE_LIMIT.max;
  };
}

export function createServer(service, adminToken) {
  const rateLimitOk = createRateLimiter();

  return http.createServer(async (req, res) => {
    const send = (status, body) => {
      const json = JSON.stringify(body);
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
      res.end(json);
    };

    try {
      const url = new URL(req.url, 'http://localhost');
      const seg = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
      const route = `${req.method} /${seg.join('/')}`;

      if (route === 'GET /healthz') return send(200, { ok: true });

      // ---- public: /api/v1/{activate,validate,deactivate} ----
      if (seg[0] === 'api' && seg[1] === 'v1' && seg[2] !== 'admin') {
        const ip = req.socket.remoteAddress || 'unknown';
        if (!rateLimitOk(ip)) return send(429, { error: { code: 'rate_limited', message: 'Quá nhiều request, thử lại sau' } });
        if (req.method !== 'POST' || seg.length !== 3) return send(404, { error: { code: 'not_found', message: 'Không có endpoint này' } });
        const body = await readJsonBody(req);
        switch (seg[2]) {
          case 'activate': return send(200, service.activate(body));
          case 'validate': return send(200, service.validate(body));
          case 'deactivate': return send(200, service.deactivate(body));
          default: return send(404, { error: { code: 'not_found', message: 'Không có endpoint này' } });
        }
      }

      // ---- admin: /api/v1/admin/licenses... ----
      if (seg[0] === 'api' && seg[1] === 'v1' && seg[2] === 'admin' && seg[3] === 'licenses') {
        if (!tokenEquals(req.headers['x-admin-token'] ?? '', adminToken)) {
          return send(401, { error: { code: 'unauthorized', message: 'Sai hoặc thiếu x-admin-token' } });
        }
        const key = seg[4];
        if (req.method === 'GET' && seg.length === 4) {
          const limitParam = url.searchParams.get('limit');
          const result = service.listLicenses({
            q: url.searchParams.get('q') ?? '',
            sort: url.searchParams.get('sort') ?? 'created_at',
            order: url.searchParams.get('order') ?? 'desc',
            offset: Number(url.searchParams.get('offset') ?? 0),
            limit: limitParam == null ? undefined : Number(limitParam),
          });
          return send(200, { licenses: result.items, hasMore: result.hasMore, total: result.total });
        }
        if (req.method === 'POST' && seg.length === 4) return send(201, service.createLicense(await readJsonBody(req)));
        if (req.method === 'GET' && seg.length === 5) return send(200, service.adminView(key));
        if ((req.method === 'PATCH' || req.method === 'PUT') && seg.length === 5) {
          return send(200, service.updateLicense(key, await readJsonBody(req)));
        }
        if (req.method === 'POST' && seg.length === 6 && seg[5] === 'extend') {
          const body = await readJsonBody(req);
          return send(200, service.extendLicense(key, Number(body.days)));
        }
        if (req.method === 'POST' && seg.length === 6 && seg[5] === 'revoke') return send(200, service.revokeLicense(key));
        if (req.method === 'DELETE' && seg.length === 7 && seg[5] === 'devices') {
          return send(200, service.removeDevice(key, seg[6]));
        }
        return send(404, { error: { code: 'not_found', message: 'Không có endpoint này' } });
      }

      // ---- web admin panel (tĩnh; API bên dưới vẫn yêu cầu token) ----
      if (req.method === 'GET' && (seg.length === 0 || seg[0] === 'admin')) {
        return sendHtml(res, adminPageHtml());
      }

      return send(404, { error: { code: 'not_found', message: 'Không có endpoint này' } });
    } catch (err) {
      if (err instanceof LicenseError) {
        return send(err.status, { error: { code: err.code, message: err.message, ...err.extra } });
      }
      console.error(err);
      return send(500, { error: { code: 'internal', message: 'Lỗi máy chủ' } });
    }
  });
}
