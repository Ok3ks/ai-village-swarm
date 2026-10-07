import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // local vllm server (see ../llm.sh); it has no CORS headers of its own.
      '/llm': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/llm/, '/v1'),
      },
    },
  },
})
