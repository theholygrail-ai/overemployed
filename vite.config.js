import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import reactNativeWeb from 'vite-plugin-react-native-web';

export default defineConfig({
  plugins: [react(), reactNativeWeb()],
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
});
