import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import reactNativeWeb from 'vite-plugin-react-native-web';

export default defineConfig(() => ({
  plugins: [
    react(),
    reactNativeWeb(),
    {
      name: 'warn-missing-vite-api-url',
      configResolved(config) {
        if (config.mode !== 'production') return;
        if (!process.env.VITE_API_URL && !process.env.BACKEND_URL) {
          console.warn(
            '\n[overemployed] VITE_API_URL is not set for this production build. ' +
              'Either set VITE_API_URL to an https:// API origin, or set BACKEND_URL (Vercel server proxy) ' +
              'and leave VITE_API_URL unset so /api is proxied to EC2 (see vercel.env.example).\n'
          );
        }
      },
    },
  ],
  resolve: {
    alias: {
      'react-native': 'react-native-web',
    },
  },
  server: {
    port: 5200,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:4900',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:4900',
        ws: true,
      },
    },
  },
  optimizeDeps: {
    include: ['react-native-web'],
  },
}));
