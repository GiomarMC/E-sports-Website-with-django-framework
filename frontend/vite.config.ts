/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The Django API runs on :8000. In development Vite proxies /api and /media
// so the frontend and the API share the same origin (no CORS needed).
const API_URL = process.env.VITE_API_PROXY ?? 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': API_URL,
      '/media': API_URL,
    },
  },
  test: {
    environment: 'node',
  },
})
