import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Gọi /api từ frontend sẽ được chuyển sang backend, không cần cấu hình CORS
    proxy: { "/api": "http://127.0.0.1:3001" },
  },
})
