import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { BACKEND_CA } from './api/_backend-ca'

// 브라우저는 같은 주소의 /api 만 부른다. 개발 중에는 Vite 가, 배포에서는 api/proxy.ts 가 BACKEND_URL 로 넘긴다.
// HTTPS 백엔드는 고정한 인증서(BACKEND_CA, 없으면 api/_backend-ca.ts)로 검증한다.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.BACKEND_URL || 'https://13.193.207.69'
  const api = {
    target, changeOrigin: true, rewrite: (p: string) => p.replace(/^\/api/, ''),
    ca: target.startsWith('https:') ? env.BACKEND_CA || BACKEND_CA : undefined,
    headers: env.BACKEND_TOKEN ? { Authorization: `Bearer ${env.BACKEND_TOKEN}` } : undefined,
  }
  return {
    plugins: [react()],
    server: { port: 5320, proxy: { '/api': api } },
    preview: { port: 5320, proxy: { '/api': api } },
  }
})
