// Sinh cặp khóa Ed25519: private key để server ký license file,
// public key để nhúng cứng vào WCode (Java) verify chữ ký.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve('keys');
const privPath = path.join(dir, 'license-signing.key');
const pubPath = path.join(dir, 'license-signing.pub');

if (fs.existsSync(privPath)) {
  console.error(`Đã tồn tại ${privPath} — xóa thủ công nếu thực sự muốn thay khóa (app đã phát hành sẽ không verify được khóa mới).`);
  process.exit(1);
}

const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(privPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
fs.writeFileSync(pubPath, publicKey.export({ type: 'spki', format: 'pem' }));

const spkiB64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
console.log(`Đã tạo:\n  ${privPath}  (GIỮ BÍ MẬT — backup cẩn thận)\n  ${pubPath}`);
console.log('\nPublic key (SPKI base64) — nhúng vào WCode (Java X509EncodedKeySpec):\n');
console.log(spkiB64);
