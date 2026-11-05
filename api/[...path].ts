// Vercel 함수: 브라우저의 /api/* 요청을 BACKEND_URL 로 넘긴다.
// 백엔드가 http 이고 CORS 가 콘솔 주소를 허용하지 않아도 되도록 서버에서 대신 부른다.
export const config = { runtime: 'edge' }

export default async function handler(req: Request): Promise<Response> {
  const base = (process.env.BACKEND_URL || '').replace(/\/$/, '')
  if (!base) return Response.json({ detail: 'BACKEND_URL 환경변수가 없어요' }, { status: 500 })
  const url = new URL(req.url)
  const target = base + url.pathname.replace(/^\/api/, '') + url.search
  try {
    const r = await fetch(target, {
      method: req.method,
      headers: { 'content-type': req.headers.get('content-type') || 'application/json', accept: 'application/json' },
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : await req.arrayBuffer(),
    })
    return new Response(r.body, { status: r.status, headers: { 'content-type': r.headers.get('content-type') || 'application/json', 'cache-control': 'no-store' } })
  } catch (e) {
    return Response.json({ detail: `backend unreachable: ${(e as Error).name}` }, { status: 502 })
  }
}
