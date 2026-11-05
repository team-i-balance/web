import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// 브라우저는 같은 주소의 /api 만 부른다. 개발 중에는 Vite 가, 배포에서는 api/[...path].ts 가 BACKEND_URL 로 넘긴다.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.BACKEND_URL || 'http://13.193.207.69:8501'
  return {
    plugins: [react()],
    server: {
      port: 5320,
      proxy: { '/api': { target, changeOrigin: true, rewrite: p => p.replace(/^\/api/, '') } },
    },
    preview: { port: 5320, proxy: { '/api': { target, changeOrigin: true, rewrite: p => p.replace(/^\/api/, '') } } },
  }
})
