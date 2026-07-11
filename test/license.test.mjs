import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { openDb } from '../src/db.js';
import { createSigner } from '../src/signer.js';
import { createService } from '../src/service.js';
import { createServer } from '../src/http.js';

const ADMIN_TOKEN = 'test-admin-token';
const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');

let server;
let baseUrl;
let currentTime = Date.parse('2026-07-11T00:00:00Z');

before(async () => {
  const db = openDb(':memory:');
  const service = createService(
    db,
    createSigner(privateKey.export({ type: 'pkcs8', format: 'pem' })),
    () => currentTime,
  );
  server = createServer(service, ADMIN_TOKEN);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

async function call(method, path, { body, admin = false } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(admin ? { 'x-admin-token': ADMIN_TOKEN } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json() };
}

function verifyLicenseFile(file) {
  const payloadBytes = Buffer.from(file.payload, 'base64');
  const ok = crypto.verify(null, payloadBytes, publicKey, Buffer.from(file.signature, 'base64'));
  assert.equal(ok, true, 'chữ ký Ed25519 phải hợp lệ');
  return JSON.parse(payloadBytes.toString('utf8'));
}

const DAY = 24 * 60 * 60 * 1000;
let licenseKey;

test('admin không có token bị chặn', async () => {
  const { status } = await call('GET', '/api/v1/admin/licenses');
  assert.equal(status, 401);
});

test('tạo license mới', async () => {
  const { status, data } = await call('POST', '/api/v1/admin/licenses', {
    admin: true,
    body: { customerName: 'Ivan Ivanov', customerContact: '@ivan', days: 30, maxDevices: 2 },
  });
  assert.equal(status, 201);
  assert.match(data.licenseKey, /^WC-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}$/);
  assert.equal(data.status, 'valid');
  assert.equal(data.expiresAt, currentTime + 30 * DAY);
  licenseKey = data.licenseKey;
});

test('kích hoạt máy trả về license file ký Ed25519 hợp lệ', async () => {
  const { status, data } = await call('POST', '/api/v1/activate', {
    body: { licenseKey, fingerprint: 'fp-machine-1', deviceName: 'PC of Ivan', appVersion: '1.0.34' },
  });
  assert.equal(status, 200);
  assert.equal(data.status, 'valid');
  const payload = verifyLicenseFile(data.licenseFile);
  assert.equal(payload.licenseKey, licenseKey);
  assert.equal(payload.fingerprint, 'fp-machine-1');
  assert.equal(payload.status, 'valid');
  assert.equal(payload.expiresAt, currentTime + 30 * DAY);
  assert.equal(payload.issuedAt, currentTime);
});

test('validate với máy đã kích hoạt', async () => {
  const { status, data } = await call('POST', '/api/v1/validate', {
    body: { licenseKey, fingerprint: 'fp-machine-1' },
  });
  assert.equal(status, 200);
  assert.equal(data.status, 'valid');
  verifyLicenseFile(data.licenseFile);
});

test('validate với máy chưa kích hoạt → 409', async () => {
  const { status, data } = await call('POST', '/api/v1/validate', {
    body: { licenseKey, fingerprint: 'fp-unknown' },
  });
  assert.equal(status, 409);
  assert.equal(data.error.code, 'device_not_activated');
});

test('kích hoạt lại cùng máy không tốn slot; vượt giới hạn máy → 403', async () => {
  await call('POST', '/api/v1/activate', { body: { licenseKey, fingerprint: 'fp-machine-1' } });
  const second = await call('POST', '/api/v1/activate', { body: { licenseKey, fingerprint: 'fp-machine-2' } });
  assert.equal(second.status, 200);
  const third = await call('POST', '/api/v1/activate', { body: { licenseKey, fingerprint: 'fp-machine-3' } });
  assert.equal(third.status, 403);
  assert.equal(third.data.error.code, 'device_limit_reached');
  assert.equal(third.data.error.devices.length, 2);
});

test('deactivate giải phóng slot cho máy mới', async () => {
  await call('POST', '/api/v1/deactivate', { body: { licenseKey, fingerprint: 'fp-machine-2' } });
  const { status } = await call('POST', '/api/v1/activate', { body: { licenseKey, fingerprint: 'fp-machine-3' } });
  assert.equal(status, 200);
});

test('hết hạn → status expired nhưng vẫn trả license file ký', async () => {
  currentTime += 31 * DAY;
  const { status, data } = await call('POST', '/api/v1/validate', {
    body: { licenseKey, fingerprint: 'fp-machine-1' },
  });
  assert.equal(status, 200);
  assert.equal(data.status, 'expired');
  assert.equal(verifyLicenseFile(data.licenseFile).status, 'expired');
});

test('gia hạn license đã hết hạn tính từ hôm nay', async () => {
  const { data } = await call('POST', `/api/v1/admin/licenses/${licenseKey}/extend`, {
    admin: true,
    body: { days: 30 },
  });
  assert.equal(data.status, 'valid');
  assert.equal(data.expiresAt, currentTime + 30 * DAY);
});

test('thu hồi → validate trả invalid_license, không lộ lý do', async () => {
  await call('POST', `/api/v1/admin/licenses/${licenseKey}/revoke`, { admin: true });
  const { status, data } = await call('POST', '/api/v1/validate', {
    body: { licenseKey, fingerprint: 'fp-machine-1' },
  });
  assert.equal(status, 403);
  assert.equal(data.error.code, 'invalid_license');
});

test('key không tồn tại trả đúng lỗi như key bị thu hồi', async () => {
  const { status, data } = await call('POST', '/api/v1/validate', {
    body: { licenseKey: 'WC-AAAAA-AAAAA-AAAAA-AAAAA', fingerprint: 'fp-x' },
  });
  assert.equal(status, 403);
  assert.equal(data.error.code, 'invalid_license');
});

test('admin list liệt kê license kèm số máy', async () => {
  const { data } = await call('GET', '/api/v1/admin/licenses', { admin: true });
  assert.equal(data.licenses.length, 1);
  assert.equal(data.licenses[0].deviceCount, 2);
  assert.equal(data.licenses[0].status, 'revoked');
  // license đầu tạo bằng days → start = lúc tạo = createdAt
  assert.equal(data.licenses[0].startsAt, data.licenses[0].createdAt);
});

test('tạo license với ngày bắt đầu/kết thúc cụ thể + máy dùng nhiều thiết bị', async () => {
  const start = currentTime + 5 * DAY;
  const end = currentTime + 40 * DAY;
  const { status, data } = await call('POST', '/api/v1/admin/licenses', {
    admin: true,
    body: { customerName: 'Petr Sidorov', maxDevices: 5, startsAt: start, expiresAt: end },
  });
  assert.equal(status, 201);
  assert.equal(data.maxDevices, 5);
  assert.equal(data.startsAt, start);
  assert.equal(data.expiresAt, end);
  assert.equal(data.status, 'pending'); // chưa tới ngày bắt đầu
});

test('license pending trả về status expired cho app (chưa dùng được)', async () => {
  const { data: created } = await call('POST', '/api/v1/admin/licenses', {
    admin: true,
    body: { customerName: 'Future User', startsAt: currentTime + 10 * DAY, expiresAt: currentTime + 40 * DAY },
  });
  const { data } = await call('POST', '/api/v1/activate', {
    body: { licenseKey: created.licenseKey, fingerprint: 'fp-future' },
  });
  assert.equal(data.status, 'expired');
  assert.equal(verifyLicenseFile(data.licenseFile).status, 'expired');
});

test('ngày kết thúc phải sau ngày bắt đầu', async () => {
  const { status, data } = await call('POST', '/api/v1/admin/licenses', {
    admin: true,
    body: { customerName: 'X', startsAt: currentTime + 10 * DAY, expiresAt: currentTime + 5 * DAY },
  });
  assert.equal(status, 400);
  assert.equal(data.error.code, 'bad_request');
});

test('search theo tên và sort theo ngày kết thúc', async () => {
  const byName = await call('GET', '/api/v1/admin/licenses?q=petr', { admin: true });
  assert.equal(byName.data.licenses.length, 1);
  assert.equal(byName.data.licenses[0].customerName, 'Petr Sidorov');

  const sorted = await call('GET', '/api/v1/admin/licenses?sort=expires_at&order=asc', { admin: true });
  const ends = sorted.data.licenses.map((l) => l.expiresAt);
  const ascending = [...ends].sort((a, b) => a - b);
  assert.deepEqual(ends, ascending);
});

test('cập nhật license (đổi số máy + ngày kết thúc)', async () => {
  const { data: created } = await call('POST', '/api/v1/admin/licenses', {
    admin: true,
    body: { customerName: 'Edit Me', days: 30, maxDevices: 1 },
  });
  const newEnd = currentTime + 100 * DAY;
  const { status, data } = await call('PATCH', '/api/v1/admin/licenses/' + created.licenseKey, {
    admin: true,
    body: { maxDevices: 4, expiresAt: newEnd },
  });
  assert.equal(status, 200);
  assert.equal(data.maxDevices, 4);
  assert.equal(data.expiresAt, newEnd);
});

test('gửi báo cáo lỗi (public) rồi admin đọc được', async () => {
  const create = await call('POST', '/api/v1/reports', {
    body: {
      licenseKey: 'WC-REPORT-TEST',
      shopName: 'Shop Lỗi',
      action: 'PURCHASE_PIPELINE',
      entity: '04689039063116',
      errorCode: '1110',
      message: 'Проверка учетных данных УОТ не пройдена',
      appVersion: '1.1.0',
    },
  });
  assert.equal(create.status, 201);
  assert.equal(create.data.ok, true);

  const noauth = await call('GET', '/api/v1/admin/reports');
  assert.equal(noauth.status, 401);

  const list = await call('GET', '/api/v1/admin/reports?limit=10', { admin: true });
  assert.equal(list.status, 200);
  assert.ok(list.data.items.length >= 1);
  const r = list.data.items[0];
  assert.equal(r.errorCode, '1110');
  assert.equal(r.shopName, 'Shop Lỗi');
  assert.equal(r.action, 'PURCHASE_PIPELINE');
});

test('web admin panel phục vụ HTML', async () => {
  const res = await fetch(baseUrl + '/admin');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  const html = await res.text();
  assert.match(html, /WCode/);
});
