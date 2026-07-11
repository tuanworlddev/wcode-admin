import { DatabaseSync } from 'node:sqlite';

export function openDb(dbPath) {
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS licenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      license_key TEXT NOT NULL UNIQUE,
      customer_name TEXT NOT NULL,
      customer_contact TEXT NOT NULL DEFAULT '',
      plan TEXT NOT NULL DEFAULT 'standard',
      max_devices INTEGER NOT NULL DEFAULT 1,
      starts_at INTEGER NOT NULL DEFAULT 0,
      expires_at INTEGER NOT NULL,
      revoked INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      license_id INTEGER NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
      fingerprint TEXT NOT NULL,
      device_name TEXT NOT NULL DEFAULT '',
      app_version TEXT NOT NULL DEFAULT '',
      activated_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      UNIQUE(license_id, fingerprint)
    );
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      license_id INTEGER,
      type TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      license_key TEXT NOT NULL DEFAULT '',
      fingerprint TEXT NOT NULL DEFAULT '',
      shop_name TEXT NOT NULL DEFAULT '',
      action TEXT NOT NULL DEFAULT '',
      entity TEXT NOT NULL DEFAULT '',
      error_code TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL DEFAULT '',
      app_version TEXT NOT NULL DEFAULT '',
      resolved INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_devices_license ON devices(license_id);
    CREATE INDEX IF NOT EXISTS idx_events_license ON events(license_id);
    CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(created_at);
  `);
  ensureColumn(db, 'licenses', 'starts_at', 'INTEGER NOT NULL DEFAULT 0');
  return db;
}

// Migration nhẹ tại chỗ cho DB đã tồn tại từ phiên bản trước.
function ensureColumn(db, table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
