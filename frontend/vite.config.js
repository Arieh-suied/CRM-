import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // Two entry points: the main authenticated CRM (index.html) and the
      // standalone public upload page (public-transfer.html, no AuthProvider).
      input: {
        main: resolve(__dirname, 'index.html'),
        'public-transfer': resolve(__dirname, 'public-transfer.html'),
      },
      output: {
        // Split the big third-party libs into their own long-lived cache chunks
        // so app-code changes don't force users to re-download React/Supabase.
        // (xlsx isn't listed — it's dynamically imported and gets its own chunk.)
        manualChunks: {
          react: ['react', 'react-dom'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
