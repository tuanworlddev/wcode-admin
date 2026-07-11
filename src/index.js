import { loadConfig } from './config.js';
import { openDb } from './db.js';
import { createSigner } from './signer.js';
import { createService } from './service.js';
import { createServer } from './http.js';

const config = loadConfig();
const db = openDb(config.dbPath);
const service = createService(db, createSigner(config.privateKeyPem));
const server = createServer(service, config.adminToken);

server.listen(config.port, () => {
  console.log(`wcode-license-server đang chạy tại http://127.0.0.1:${config.port} (DB: ${config.dbPath})`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
