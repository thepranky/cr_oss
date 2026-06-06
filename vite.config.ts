import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Office add-ins must be served over HTTPS during development.
// basicSsl generates a self-signed cert automatically — Outlook may show a cert warning once.
export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    port: 5173,
    strictPort: true,
  },
});
