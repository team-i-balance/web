// 해시 라우트: #home · #review/INC-123 · #fp · #policy · #deploy · #insights
import { useEffect, useState } from 'react'

export const ROUTES = ['home', 'review', 'fp', 'policy', 'deploy', 'insights'] as const
export type Route = (typeof ROUTES)[number]
export const ROUTE_NAME: Record<Route, string> = { home: '작업판', review: '위반 검토', fp: '오탐 신고', policy: '변환 정책', deploy: '배포', insights: '현황' }

export function parse(hash = location.hash) {
  const [r, arg] = (hash.slice(1) || 'home').split('/')
  return { r: ((ROUTES as readonly string[]).includes(r) ? r : 'home') as Route, arg }
}
export function useRoute() {
  const [h, setH] = useState(location.hash)
  useEffect(() => { const f = () => setH(location.hash); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f) }, [])
  return parse(h)
}
export const go = (path: string) => { location.hash = path }
