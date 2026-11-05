// Vercel 함수: 브라우저의 /api/* 요청을 BACKEND_URL 로 넘긴다(vercel.json 이 /api/* → /api/proxy?path=* 로 보냄).
// 백엔드가 자체 서명 HTTPS 이고 CORS 가 콘솔 주소를 허용하지 않아도 되도록 서버에서 대신 부른다.
//   BACKEND_URL    예: https://13.193.207.69
//   BACKEND_TOKEN  (선택) 백엔드 인증 토큰 → Authorization: Bearer
//   BACKEND_CA     (선택) 백엔드 인증서 PEM. 없으면 api/_backend-ca.ts 를 쓴다. 인증서 검증은 끄지 않는다.
// Edge 런타임은 IP 주소로 요청을 막으므로 Node 런타임으로 둔다.
import { Agent, fetch } from 'undici'
import { BACKEND_CA } from './_backend-ca.js'

const pinned = new Agent({ connect: { ca: process.env.BACKEND_CA || BACKEND_CA } })

async function handler(req: Request): Promise<Response> {
  const base = (process.env.BACKEND_URL || '').replace(/\/$/, '')
  if (!base) return Response.json({ detail: 'BACKEND_URL 환경변수가 없어요' }, { status: 500 })
  const url = new URL(req.url)
  const path = url.searchParams.get('path') || ''
  url.searchParams.delete('path')
  const qs = url.searchParams.toString()
  const target = `${base}/${path.replace(/^\/+/, '')}${qs ? '?' + qs : ''}`
  const headers: Record<string, string> = { 'content-type': req.headers.get('content-type') || 'application/json', accept: 'application/json' }
  if (process.env.BACKEND_TOKEN) headers.authorization = `Bearer ${process.env.BACKEND_TOKEN}`
  // 정책 초안·배포의 동시 수정 방지(If-Match)와 캐시 확인(If-None-Match)은 그대로 넘긴다
  for (const h of ['if-match', 'if-none-match']) { const v = req.headers.get(h); if (v) headers[h] = v }
  try {
    const r = await fetch(target, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : await req.arrayBuffer(),
      signal: AbortSignal.timeout(20000),
      dispatcher: base.startsWith('https:') ? pinned : undefined,
    })
    const out: Record<string, string> = { 'content-type': r.headers.get('content-type') || 'application/json', 'cache-control': 'no-store' }
    const etag = r.headers.get('etag'); if (etag) out.etag = etag
    return new Response(r.status === 304 ? null : await r.arrayBuffer(), { status: r.status, headers: out })
  } catch (e) {
    const err = e as Error & { cause?: { code?: string } }
    return Response.json({ detail: `backend unreachable: ${err.cause?.code || err.name}` }, { status: 502 })
  }
}

export const GET = handler, POST = handler, PUT = handler, PATCH = handler, DELETE = handler
