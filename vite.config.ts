import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const isStandaloneBuild =
      env.VITE_STANDALONE === '1' ||
      process.env.VITE_STANDALONE === '1' ||
      env.CAPACITOR_BUILD === '1' ||
      process.env.CAPACITOR_BUILD === '1';

    // Never bake server/local machine API keys into standalone iOS/mobile IPA builds
    const apiKey = isStandaloneBuild
      ? ''
      : (env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY || env.API_KEY || process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || process.env.API_KEY || '');

    return {
      base: './',
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), tailwindcss()],
      define: {
        'process.env.API_KEY': JSON.stringify(apiKey),
        'process.env.GEMINI_API_KEY': JSON.stringify(apiKey),
        'process.env.VITE_GEMINI_API_KEY': JSON.stringify(apiKey),
        'import.meta.env.VITE_GEMINI_API_KEY': JSON.stringify(apiKey),
        'import.meta.env.VITE_STANDALONE': JSON.stringify(isStandaloneBuild ? '1' : '0')
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        outDir: 'dist',
        emptyOutDir: true
      }
    };
});
