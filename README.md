# wcode-license-server

License server tối giản cho **WCode (FBSBarcode)** — quản lý thuê bao trả trước theo kỳ,
kích hoạt theo máy, và trả về **license file ký Ed25519** để app chạy offline có thời hạn.

**Zero dependency** — chỉ cần Node.js ≥ 24 (`node:sqlite`, `node:crypto`, `node:http`).
Dữ liệu nằm trong một file SQLite.

## Luồng bán hàng (thủ công, chuyển khoản trực tiếp)

1. Khách chuyển khoản → gửi biên lai cho anh (Telegram/WhatsApp).
2. Anh chạy: `node cli.mjs create --name "Tên khách" --contact "@telegram" --days 30`
3. Gửi key `WC-XXXXX-XXXXX-XXXXX-XXXXX` cho khách nhập vào WCode.
4. Tháng sau khách chuyển tiếp → `node cli.mjs extend <KEY> --days 30`.
5. Khách không trả → không làm gì cả: license tự hết hạn, app khóa tính năng KIZ sau grace period.

## Cài đặt

```bash
cp .env.example .env        # sửa ADMIN_TOKEN (openssl rand -hex 32)
npm run keygen              # sinh keys/license-signing.key (+ .pub)
npm start                   # chạy server (mặc định cổng 8787)
npm test                    # chạy test suite
```

`npm run keygen` in ra **public key SPKI base64** — nhúng chuỗi này vào WCode (xem cuối file).
**Backup `keys/license-signing.key` cẩn thận**: mất key là mọi bản WCode đã phát hành
không verify được license file mới; lộ key là người khác tự ký được license.

Deploy: chạy sau reverse proxy có HTTPS (Caddy/nginx), giữ tiến trình bằng `systemd` hoặc `pm2`.
Backup định kỳ `data/license.db` + thư mục `keys/`.

## API

Public (app WCode gọi, rate-limit 60 req/phút/IP):

| Endpoint | Body | Kết quả |
|---|---|---|
| `POST /api/v1/activate` | `{licenseKey, fingerprint, deviceName?, appVersion?}` | `{status, expiresAt, plan, licenseFile}`; `403 device_limit_reached` kèm danh sách máy nếu hết slot |
| `POST /api/v1/validate` | `{licenseKey, fingerprint, appVersion?}` | như trên; `409 device_not_activated` nếu máy lạ; `403 invalid_license` nếu key sai/bị thu hồi |
| `POST /api/v1/deactivate` | `{licenseKey, fingerprint}` | `{removed}` — khách tự gỡ máy cũ để chuyển máy |

`licenseFile` = `{payload, signature, algorithm: "Ed25519"}`; `payload` là base64 của JSON:
`{v, licenseKey, fingerprint, plan, maxDevices, status, issuedAt, expiresAt}`.
Chữ ký tính trên đúng chuỗi byte đó — client verify bytes trước, parse sau.
License **hết hạn vẫn trả file ký** (status `expired`) để app hiển thị đúng trạng thái.

Admin (header `x-admin-token`): `POST|GET /api/v1/admin/licenses`,
`GET /api/v1/admin/licenses/:key`, `POST .../:key/extend {days}`, `POST .../:key/revoke`,
`DELETE .../:key/devices/:fingerprint`. Dùng qua `cli.mjs` là chính:

```bash
node cli.mjs list
node cli.mjs show WC-...
node cli.mjs extend WC-... --days 90
node cli.mjs revoke WC-...
node cli.mjs remove-device WC-... <fingerprint>
# CLI đọc SERVER_URL + ADMIN_TOKEN từ .env — trỏ SERVER_URL sang VPS để quản lý từ xa
```

## Tích hợp phía WCode (Java 25)

Thiết kế client (`LicenseService` trong app):

1. **Fingerprint** = SHA-256 hex của `MachineGuid` (registry `HKLM\SOFTWARE\Microsoft\Cryptography`).
2. Lần đầu: user nhập key → `POST /activate` → lưu `licenseFile` vào `AppPaths` (không lưu chỗ khác).
3. Mỗi lần mở app + định kỳ nền: `POST /validate`, ghi đè license file cache.
4. **Offline**: nếu không gọi được server, verify chữ ký file cache bằng public key nhúng cứng;
   cho chạy tiếp tối đa N ngày (grace, ví dụ 7–14) tính từ `issuedAt`, đồng thời chặn lùi
   đồng hồ (nếu giờ hệ thống < `issuedAt` → coi như không hợp lệ).
5. **Gate tính năng KIZ** (pipeline mua KIZ / Znack) sau trạng thái license hợp lệ.

Verify chữ ký bằng JDK thuần (không cần thư viện ngoài):

```java
// Public key lấy từ output của `npm run keygen` — NHÚNG CỨNG vào code, không để file ngoài
private static final String LICENSE_PUBLIC_KEY_B64 = "MCow...";

static Optional<JsonObject> verifyLicenseFile(String payloadB64, String signatureB64) throws Exception {
    byte[] payload = Base64.getDecoder().decode(payloadB64);
    byte[] sig = Base64.getDecoder().decode(signatureB64);
    var spec = new X509EncodedKeySpec(Base64.getDecoder().decode(LICENSE_PUBLIC_KEY_B64));
    PublicKey publicKey = KeyFactory.getInstance("Ed25519").generatePublic(spec);
    Signature verifier = Signature.getInstance("Ed25519");
    verifier.initVerify(publicKey);
    verifier.update(payload);
    if (!verifier.verify(sig)) return Optional.empty();
    return Optional.of(JsonParser.parseString(new String(payload, StandardCharsets.UTF_8)).getAsJsonObject());
}
```

## Cấu trúc

```
src/config.js    # đọc .env, kiểm tra ADMIN_TOKEN + private key
src/db.js        # schema SQLite (licenses, devices, events) — node:sqlite, WAL
src/signer.js    # ký license file bằng Ed25519
src/service.js   # toàn bộ nghiệp vụ (activate/validate/create/extend/revoke...)
src/http.js      # router node:http + rate limit + admin auth
cli.mjs          # CLI quản trị (gọi HTTP API, dùng được từ xa)
scripts/generate-keys.mjs
test/license.test.mjs
```
