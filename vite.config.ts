import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor:   ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          charts:   ['recharts'],
          query:    ['@tanstack/react-query'],
          motion:   ['framer-motion'],
          dates:    ['date-fns'],
        },
      },
    },
    // Warn if any chunk exceeds 400kb
    chunkSizeWarningLimit: 400,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})
