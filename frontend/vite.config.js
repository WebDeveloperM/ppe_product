import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const readSharedEnv = () => {
  const envPath = path.resolve(__dirname, '../.env');
  if (!fs.existsSync(envPath)) {
    return {};
  }

  return fs
    .readFileSync(envPath, 'utf-8')
    .split(/\r?\n/)
    .reduce((accumulator, rawLine) => {
      const line = rawLine.trim();
      if (!line || line.startsWith('#') || !line.includes('=')) {
        return accumulator;
      }

      const [key, ...valueParts] = line.split('=');
      accumulator[key.trim()] = valueParts.join('=').trim().replace(/^['"]|['"]$/g, '');
      return accumulator;
    }, {});
};

const sharedEnv = readSharedEnv();
const publicBaseUrl = String(sharedEnv.PUBLIC_BASE_URL || 'https://192.168.101.6').trim().replace(/\/+$/, '');
const backendPort = String(sharedEnv.BACKEND_PORT || '8050').trim();
const backendTarget = `${publicBaseUrl}:${backendPort}`;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 6060,
    host: '0.0.0.0', // Tashqi kirish uchun ochish
    proxy: {
      '/api': {
        target: backendTarget,
        changeOrigin: true,
        secure: false,
      },
      '/media': {
        target: backendTarget,
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
