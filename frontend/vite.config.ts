import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// El frontend llama a rutas relativas /v1/* (mismo origen). En dev, Vite proxya /v1 → backend.
// El destino del proxy es configurable (VITE_BACKEND_ORIGIN); por defecto el backend local (PORT=3000).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backendOrigin = env.VITE_BACKEND_ORIGIN ?? 'http://localhost:3000';
  return {
    plugins: [react()],
    resolve: { alias: { '@': '/src' } },
    server: {
      proxy: {
        '/v1': { target: backendOrigin, changeOrigin: true },
      },
    },
  };
});
