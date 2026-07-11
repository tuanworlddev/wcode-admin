#!/usr/bin/env node
// CLI quản trị license — gọi HTTP API nên dùng được cả với server ở xa.
// Cấu hình qua env hoặc .env: SERVER_URL (mặc định http://127.0.0.1:8787), ADMIN_TOKEN.
import fs from 'node:fs';
import { parseArgs } from 'node:util';

if (fs.existsSync('.env')) {
  for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

const SERVER_URL = (process.env.SERVER_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

const USAGE = `Cách dùng: node cli.mjs <lệnh> [tham số]

  create --name "Tên khách" [--contact tele@user] [--days 30] [--devices 1] [--plan standard] [--notes "..."]
      Tạo license mới (chạy sau khi khách chuyển khoản), in ra key để gửi khách.
  list
      Liệt kê toàn bộ license kèm trạng thái.
  show <KEY>
      Chi tiết một license + danh sách máy đã kích hoạt.
  extend <KEY> --days 30
      Gia hạn (cộng vào ngày hết hạn nếu còn hạn, từ hôm nay nếu đã hết).
  revoke <KEY>
      Thu hồi license (app sẽ bị khóa ở lần validate kế tiếp).
  remove-device <KEY> <FINGERPRINT>
      Gỡ một máy để khách kích hoạt máy mới.`;

async function api(method, path, body) {
  const res = await fetch(`${SERVER_URL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-admin-token': ADMIN_TOKEN ?? '' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    console.error(`Lỗi ${res.status}: ${data.error?.message ?? JSON.stringify(data)}`);
    process.exit(1);
  }
  return data;
}

const fmtDate = (ms) => new Date(ms).toISOString().slice(0, 10);

function printLicense(l) {
  console.log(`\n  Key        : ${l.licenseKey}`);
  console.log(`  Khách      : ${l.customerName}${l.customerContact ? ` (${l.customerContact})` : ''}`);
  console.log(`  Gói        : ${l.plan}, tối đa ${l.maxDevices} máy`);
  console.log(`  Bắt đầu    : ${fmtDate(l.startsAt)}`);
  console.log(`  Hết hạn    : ${fmtDate(l.expiresAt)} — ${l.status}`);
  if (l.notes) console.log(`  Ghi chú    : ${l.notes}`);
  if (l.devices) {
    console.log(`  Máy (${l.devices.length}):`);
    for (const d of l.devices) {
      console.log(`    - ${d.device_name || '(không tên)'} ${d.fingerprint}  lần cuối: ${fmtDate(d.last_seen_at)}`);
    }
  }
  console.log();
}

const [cmd, ...rest] = process.argv.slice(2);
if (!cmd || cmd === 'help' || cmd === '--help') {
  console.log(USAGE);
  process.exit(0);
}
if (!ADMIN_TOKEN) {
  console.error('Thiếu ADMIN_TOKEN (đặt trong .env hoặc biến môi trường)');
  process.exit(1);
}

switch (cmd) {
  case 'create': {
    const { values } = parseArgs({
      args: rest,
      options: {
        name: { type: 'string' },
        contact: { type: 'string', default: '' },
        days: { type: 'string', default: '30' },
        start: { type: 'string' }, // YYYY-MM-DD (tùy chọn)
        end: { type: 'string' }, // YYYY-MM-DD (tùy chọn, ưu tiên hơn --days)
        devices: { type: 'string', default: '3' },
        plan: { type: 'string', default: 'standard' },
        notes: { type: 'string', default: '' },
      },
    });
    if (!values.name) { console.error('Thiếu --name'); process.exit(1); }
    const startsAt = values.start ? new Date(values.start + 'T00:00:00').getTime() : undefined;
    const expiresAt = values.end ? new Date(values.end + 'T23:59:59').getTime() : undefined;
    const lic = await api('POST', '/api/v1/admin/licenses', {
      customerName: values.name,
      customerContact: values.contact,
      startsAt,
      expiresAt,
      days: expiresAt ? undefined : Number(values.days),
      maxDevices: Number(values.devices),
      plan: values.plan,
      notes: values.notes,
    });
    console.log('Đã tạo license — gửi key này cho khách:');
    printLicense(lic);
    break;
  }
  case 'list': {
    const { licenses } = await api('GET', '/api/v1/admin/licenses');
    if (licenses.length === 0) { console.log('Chưa có license nào.'); break; }
    for (const l of licenses) {
      const mark = l.status === 'valid' ? ' ' : l.status === 'expired' ? '!' : 'x';
      console.log(`${mark} ${l.licenseKey}  ${fmtDate(l.expiresAt)}  ${String(l.deviceCount)}/${l.maxDevices} máy  ${l.customerName}${l.customerContact ? ` (${l.customerContact})` : ''}`);
    }
    break;
  }
  case 'show':
    printLicense(await api('GET', `/api/v1/admin/licenses/${encodeURIComponent(rest[0] ?? '')}`));
    break;
  case 'extend': {
    const { values, positionals } = parseArgs({
      args: rest,
      options: { days: { type: 'string', default: '30' } },
      allowPositionals: true,
    });
    const lic = await api('POST', `/api/v1/admin/licenses/${encodeURIComponent(positionals[0] ?? '')}/extend`, { days: Number(values.days) });
    console.log(`Đã gia hạn +${values.days} ngày:`);
    printLicense(lic);
    break;
  }
  case 'revoke':
    printLicense(await api('POST', `/api/v1/admin/licenses/${encodeURIComponent(rest[0] ?? '')}/revoke`));
    break;
  case 'remove-device':
    printLicense(await api('DELETE', `/api/v1/admin/licenses/${encodeURIComponent(rest[0] ?? '')}/devices/${encodeURIComponent(rest[1] ?? '')}`));
    break;
  default:
    console.error(`Lệnh không hợp lệ: ${cmd}\n\n${USAGE}`);
    process.exit(1);
}
