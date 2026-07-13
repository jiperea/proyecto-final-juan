import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev: proxy /v1 → backend (paridad; el backend sirve los contratos congelados).
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': '/src' } },
  server: {
    proxy: {
      '/v1': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
});
