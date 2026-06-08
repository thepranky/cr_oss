import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const certDir = path.join(rootDir, '.certs');
const keyPath = path.join(certDir, 'localhost-key.pem');
const certPath = path.join(certDir, 'localhost.pem');
const hasMkcert = fs.existsSync(keyPath) && fs.existsSync(certPath);

// Office add-ins must be served over HTTPS during development.
// Outlook for Mac uses WebKit (Safari) and blocks self-signed certs entirely.
// Run: brew install mkcert && mkcert -install && ./scripts/generate-certs.sh
export default defineConfig({
  plugins: [react(), ...(hasMkcert ? [] : [basicSsl()])],
  server: {
    port: 5173,
    strictPort: true,
    https: hasMkcert
      ? {
          key: fs.readFileSync(keyPath),
          cert: fs.readFileSync(certPath),
        }
      : undefined,
  },
});
