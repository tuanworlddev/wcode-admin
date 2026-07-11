import fs from 'node:fs';
import path from 'node:path';

function loadDotEnv(dir) {
  const file = path.join(dir, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

export function loadConfig(baseDir = process.cwd()) {
  loadDotEnv(baseDir);

  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken || adminToken === 'change-me') {
    throw new Error('ADMIN_TOKEN chưa được đặt (xem .env.example)');
  }
  const privateKeyPath = process.env.LICENSE_PRIVATE_KEY_PATH || './keys/license-signing.key';
  if (!fs.existsSync(privateKeyPath)) {
    throw new Error(`Không tìm thấy private key tại ${privateKeyPath} — chạy: npm run keygen`);
  }

  const dbPath = process.env.DB_PATH || './data/license.db';
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });

  return {
    port: Number(process.env.PORT || 8787),
    dbPath,
    adminToken,
    privateKeyPem: fs.readFileSync(privateKeyPath, 'utf8'),
  };
}
