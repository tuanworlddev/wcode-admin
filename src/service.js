import crypto from 'node:crypto';

const DAY_MS = 24 * 60 * 60 * 1000;
// Không có 0/O/1/I để đọc key qua điện thoại/Telegram không nhầm ký tự
const KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export class LicenseError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

function generateLicenseKey() {
  const groups = [];
  for (let g = 0; g < 4; g++) {
    let s = '';
    for (let i = 0; i < 5; i++) s += KEY_ALPHABET[crypto.randomInt(KEY_ALPHABET.length)];
    groups.push(s);
  }
  return `WC-${groups.join('-')}`;
}

export function createService(db, signer, now = () => Date.now()) {
  const logEvent = (licenseId, type, detail = '') =>
    db.prepare('INSERT INTO events (license_id, type, detail, created_at) VALUES (?, ?, ?, ?)')
      .run(licenseId, type, detail, now());

  function requireLicense(licenseKey) {
    const lic = db.prepare('SELECT * FROM licenses WHERE license_key = ?').get(licenseKey ?? '');
    if (!lic || lic.revoked) {
      // Cùng một lỗi cho "không tồn tại" và "đã thu hồi" — không để dò key
      throw new LicenseError(403, 'invalid_license', 'License không hợp lệ hoặc đã bị thu hồi');
    }
    return lic;
  }

  const deviceRows = (licenseId) =>
    db.prepare('SELECT fingerprint, device_name, app_version, activated_at, last_seen_at FROM devices WHERE license_id = ? ORDER BY activated_at')
      .all(licenseId);

  // Trạng thái đầy đủ cho admin: revoked / pending (chưa tới ngày bắt đầu) / valid / expired.
  function statusOf(lic, ts) {
    if (lic.revoked) return 'revoked';
    if (ts < lic.starts_at) return 'pending';
    if (ts >= lic.expires_at) return 'expired';
    return 'valid';
  }

  // App WCode chỉ phân biệt valid vs không: pending/expired đều coi là chưa dùng được.
  const appStatus = (lic, ts) => (statusOf(lic, ts) === 'valid' ? 'valid' : 'expired');

  function signedFile(lic, fingerprint) {
    const ts = now();
    return signer.signLicenseFile({
      v: 1,
      licenseKey: lic.license_key,
      fingerprint,
      plan: lic.plan,
      maxDevices: lic.max_devices,
      status: appStatus(lic, ts),
      issuedAt: ts,
      startsAt: lic.starts_at,
      expiresAt: lic.expires_at,
    });
  }

  function validateResult(lic, fingerprint) {
    return {
      status: appStatus(lic, now()),
      expiresAt: lic.expires_at,
      plan: lic.plan,
      licenseFile: signedFile(lic, fingerprint),
    };
  }

  return {
    // ---- public (gọi từ app WCode) ----

    activate({ licenseKey, fingerprint, deviceName = '', appVersion = '' }) {
      if (!fingerprint) throw new LicenseError(400, 'bad_request', 'Thiếu fingerprint');
      const lic = requireLicense(licenseKey);
      const ts = now();
      const existing = db.prepare('SELECT id FROM devices WHERE license_id = ? AND fingerprint = ?')
        .get(lic.id, fingerprint);
      if (existing) {
        db.prepare('UPDATE devices SET last_seen_at = ?, device_name = ?, app_version = ? WHERE id = ?')
          .run(ts, deviceName, appVersion, existing.id);
      } else {
        const count = db.prepare('SELECT COUNT(*) AS n FROM devices WHERE license_id = ?').get(lic.id).n;
        if (count >= lic.max_devices) {
          throw new LicenseError(403, 'device_limit_reached',
            `License chỉ cho phép ${lic.max_devices} máy`, { devices: deviceRows(lic.id) });
        }
        db.prepare('INSERT INTO devices (license_id, fingerprint, device_name, app_version, activated_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)')
          .run(lic.id, fingerprint, deviceName, appVersion, ts, ts);
        logEvent(lic.id, 'activate', `${deviceName} ${fingerprint.slice(0, 12)}`);
      }
      return validateResult(lic, fingerprint);
    },

    validate({ licenseKey, fingerprint, appVersion = '' }) {
      if (!fingerprint) throw new LicenseError(400, 'bad_request', 'Thiếu fingerprint');
      const lic = requireLicense(licenseKey);
      const dev = db.prepare('SELECT id FROM devices WHERE license_id = ? AND fingerprint = ?')
        .get(lic.id, fingerprint);
      if (!dev) throw new LicenseError(409, 'device_not_activated', 'Máy này chưa được kích hoạt cho license');
      db.prepare('UPDATE devices SET last_seen_at = ?, app_version = ? WHERE id = ?')
        .run(now(), appVersion, dev.id);
      return validateResult(lic, fingerprint);
    },

    deactivate({ licenseKey, fingerprint }) {
      const lic = requireLicense(licenseKey);
      const res = db.prepare('DELETE FROM devices WHERE license_id = ? AND fingerprint = ?')
        .run(lic.id, fingerprint ?? '');
      if (res.changes > 0) logEvent(lic.id, 'deactivate', String(fingerprint).slice(0, 12));
      return { removed: res.changes > 0 };
    },

    // ---- admin ----

    createLicense({
      customerName,
      customerContact = '',
      plan = 'standard',
      maxDevices = 1,
      startsAt,
      expiresAt,
      days,
      notes = '',
    }) {
      if (!customerName) throw new LicenseError(400, 'bad_request', 'Thiếu customerName');
      if (!(Number.isInteger(maxDevices) && maxDevices >= 1)) {
        throw new LicenseError(400, 'bad_request', 'maxDevices phải là số nguyên >= 1');
      }
      const ts = now();
      // Ngày bắt đầu: mặc định là bây giờ. Ngày kết thúc: ưu tiên expiresAt, không thì tính từ days.
      const start = Number.isFinite(startsAt) ? Math.trunc(startsAt) : ts;
      let end;
      if (Number.isFinite(expiresAt)) {
        end = Math.trunc(expiresAt);
      } else if (Number.isFinite(days) && days > 0) {
        end = start + days * DAY_MS;
      } else {
        throw new LicenseError(400, 'bad_request', 'Cần expiresAt hoặc days > 0');
      }
      if (end <= start) {
        throw new LicenseError(400, 'bad_request', 'Ngày kết thúc phải sau ngày bắt đầu');
      }
      const licenseKey = generateLicenseKey();
      db.prepare('INSERT INTO licenses (license_key, customer_name, customer_contact, plan, max_devices, starts_at, expires_at, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(licenseKey, customerName, customerContact, plan, maxDevices, start, end, notes, ts);
      const lic = db.prepare('SELECT * FROM licenses WHERE license_key = ?').get(licenseKey);
      logEvent(lic.id, 'create', `${customerName}, ${maxDevices} máy`);
      return this.adminView(licenseKey);
    },

    updateLicense(licenseKey, { customerName, customerContact, plan, maxDevices, startsAt, expiresAt, notes }) {
      const lic = db.prepare('SELECT * FROM licenses WHERE license_key = ?').get(licenseKey ?? '');
      if (!lic) throw new LicenseError(404, 'not_found', 'Không tìm thấy license');
      const next = {
        customer_name: customerName ?? lic.customer_name,
        customer_contact: customerContact ?? lic.customer_contact,
        plan: plan ?? lic.plan,
        max_devices: Number.isInteger(maxDevices) && maxDevices >= 1 ? maxDevices : lic.max_devices,
        starts_at: Number.isFinite(startsAt) ? Math.trunc(startsAt) : lic.starts_at,
        expires_at: Number.isFinite(expiresAt) ? Math.trunc(expiresAt) : lic.expires_at,
        notes: notes ?? lic.notes,
      };
      if (next.expires_at <= next.starts_at) {
        throw new LicenseError(400, 'bad_request', 'Ngày kết thúc phải sau ngày bắt đầu');
      }
      db.prepare('UPDATE licenses SET customer_name = ?, customer_contact = ?, plan = ?, max_devices = ?, starts_at = ?, expires_at = ?, notes = ? WHERE id = ?')
        .run(next.customer_name, next.customer_contact, next.plan, next.max_devices, next.starts_at, next.expires_at, next.notes, lic.id);
      logEvent(lic.id, 'update');
      return this.adminView(licenseKey);
    },

    extendLicense(licenseKey, days) {
      if (!(Number.isFinite(days) && days > 0)) {
        throw new LicenseError(400, 'bad_request', 'days phải > 0');
      }
      const lic = db.prepare('SELECT * FROM licenses WHERE license_key = ?').get(licenseKey ?? '');
      if (!lic) throw new LicenseError(404, 'not_found', 'Không tìm thấy license');
      // Gia hạn tính từ ngày hết hạn nếu còn hạn, từ hôm nay nếu đã hết hạn
      const base = Math.max(lic.expires_at, now());
      db.prepare('UPDATE licenses SET expires_at = ?, revoked = 0 WHERE id = ?')
        .run(base + days * DAY_MS, lic.id);
      logEvent(lic.id, 'extend', `+${days} ngày`);
      return this.adminView(licenseKey);
    },

    revokeLicense(licenseKey) {
      const lic = db.prepare('SELECT * FROM licenses WHERE license_key = ?').get(licenseKey ?? '');
      if (!lic) throw new LicenseError(404, 'not_found', 'Không tìm thấy license');
      db.prepare('UPDATE licenses SET revoked = 1 WHERE id = ?').run(lic.id);
      logEvent(lic.id, 'revoke');
      return this.adminView(licenseKey);
    },

    removeDevice(licenseKey, fingerprint) {
      const lic = db.prepare('SELECT * FROM licenses WHERE license_key = ?').get(licenseKey ?? '');
      if (!lic) throw new LicenseError(404, 'not_found', 'Không tìm thấy license');
      const res = db.prepare('DELETE FROM devices WHERE license_id = ? AND fingerprint = ?')
        .run(lic.id, fingerprint ?? '');
      if (res.changes === 0) throw new LicenseError(404, 'not_found', 'Không tìm thấy máy với fingerprint này');
      logEvent(lic.id, 'admin_remove_device', String(fingerprint).slice(0, 12));
      return this.adminView(licenseKey);
    },

    adminView(licenseKey) {
      const lic = db.prepare('SELECT * FROM licenses WHERE license_key = ?').get(licenseKey ?? '');
      if (!lic) throw new LicenseError(404, 'not_found', 'Không tìm thấy license');
      return {
        licenseKey: lic.license_key,
        customerName: lic.customer_name,
        customerContact: lic.customer_contact,
        plan: lic.plan,
        maxDevices: lic.max_devices,
        startsAt: lic.starts_at,
        expiresAt: lic.expires_at,
        revoked: !!lic.revoked,
        notes: lic.notes,
        createdAt: lic.created_at,
        status: statusOf(lic, now()),
        devices: deviceRows(lic.id),
      };
    },

    // ---- báo cáo lỗi (public nhận từ app, admin đọc) ----

    createReport({
      licenseKey = '',
      fingerprint = '',
      shopName = '',
      action = '',
      entity = '',
      errorCode = '',
      message = '',
      appVersion = '',
    }) {
      const clip = (s, n) => String(s ?? '').slice(0, n);
      db.prepare(
        `INSERT INTO reports (license_key, fingerprint, shop_name, action, entity, error_code, message, app_version, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        clip(licenseKey, 64),
        clip(fingerprint, 128),
        clip(shopName, 200),
        clip(action, 64),
        clip(entity, 200),
        clip(errorCode, 32),
        clip(message, 4000),
        clip(appVersion, 32),
        now(),
      );
      return { ok: true };
    },

    listReports({ offset = 0, limit = 30 } = {}) {
      const rows = db
        .prepare('SELECT * FROM reports ORDER BY created_at DESC LIMIT ? OFFSET ?')
        .all(Math.max(1, Number(limit)) + 1, Math.max(0, Number(offset)))
        .map((r) => {
          const lic = r.license_key
            ? db.prepare('SELECT customer_name FROM licenses WHERE license_key = ?').get(r.license_key)
            : null;
          return {
            id: r.id,
            licenseKey: r.license_key,
            customerName: lic ? lic.customer_name : '',
            shopName: r.shop_name,
            action: r.action,
            entity: r.entity,
            errorCode: r.error_code,
            message: r.message,
            appVersion: r.app_version,
            createdAt: r.created_at,
          };
        });
      const lim = Math.max(1, Number(limit));
      return { items: rows.slice(0, lim), hasMore: rows.length > lim };
    },

    listLicenses({ q = '', sort = 'created_at', order = 'desc', offset = 0, limit } = {}) {
      const sortColumns = {
        created_at: 'l.created_at',
        expires_at: 'l.expires_at',
        starts_at: 'l.starts_at',
        customer_name: 'l.customer_name COLLATE NOCASE',
      };
      const sortColumn = sortColumns[sort] || sortColumns.created_at;
      const direction = String(order).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
      const rows = db
        .prepare(
          `SELECT l.*, COUNT(d.id) AS device_count
           FROM licenses l LEFT JOIN devices d ON d.license_id = l.id
           GROUP BY l.id ORDER BY ${sortColumn} ${direction}`,
        )
        .all();
      const ts = now();
      const needle = String(q).trim().toLowerCase();
      const filtered = rows
        .filter((l) =>
          !needle ||
          l.customer_name.toLowerCase().includes(needle) ||
          l.customer_contact.toLowerCase().includes(needle) ||
          l.license_key.toLowerCase().includes(needle))
        .map((l) => ({
          licenseKey: l.license_key,
          customerName: l.customer_name,
          customerContact: l.customer_contact,
          plan: l.plan,
          maxDevices: l.max_devices,
          deviceCount: l.device_count,
          startsAt: l.starts_at,
          expiresAt: l.expires_at,
          createdAt: l.created_at,
          status: statusOf(l, ts),
        }));
      // limit không truyền -> trả tất cả (CLI); có limit -> phân trang cho lazy-load.
      if (limit === undefined || limit === null) {
        return { items: filtered, hasMore: false, total: filtered.length };
      }
      const start = Math.max(0, Number(offset) || 0);
      const lim = Math.max(1, Number(limit));
      return {
        items: filtered.slice(start, start + lim),
        hasMore: start + lim < filtered.length,
        total: filtered.length,
      };
    },
  };
}
