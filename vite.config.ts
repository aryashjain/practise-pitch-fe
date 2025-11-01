import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // needed for Render / external access
    port: Number(process.env.PORT) || 5173,

    proxy: {
      '/api': {
        target: 'https://practise-pitch-be.onrender.com',
        changeOrigin: true,
        secure: false,
      },
    },
  },
    preview: {
    allowedHosts: ['practise-pitch-fe-2.onrender.com'], // 👈 Add this line
  },
})
