import crypto from 'node:crypto';

export function createSigner(privateKeyPem) {
  const privateKey = crypto.createPrivateKey(privateKeyPem);
  if (privateKey.asymmetricKeyType !== 'ed25519') {
    throw new Error(`Private key phải là Ed25519, nhận được: ${privateKey.asymmetricKeyType}`);
  }
  return {
    // Chữ ký được tính trên đúng chuỗi byte JSON trong `payload` (base64),
    // nên client chỉ cần verify bytes rồi mới parse — không cần chuẩn hóa JSON.
    signLicenseFile(payload) {
      const json = Buffer.from(JSON.stringify(payload), 'utf8');
      const signature = crypto.sign(null, json, privateKey);
      return {
        payload: json.toString('base64'),
        signature: signature.toString('base64'),
        algorithm: 'Ed25519',
      };
    },
  };
}
