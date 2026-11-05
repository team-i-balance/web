import type { Method } from '../domain/types'

export const pad = (n: number) => String(n).padStart(2, '0')
export const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)

export function josa(w: string, a: string, b: string) {
  const c = w.charCodeAt(w.length - 1)
  if (c < 0xac00 || c > 0xd7a3) return w + a
  return w + ((c - 0xac00) % 28 ? a : b)
}

// 꺾이는 점들을 둥근 모서리 경로로
export function rpath(p: number[][], r = 10) {
  let d = `M${p[0][0]},${p[0][1]}`
  for (let i = 1; i < p.length - 1; i++) {
    const [a, b, c] = [p[i - 1], p[i], p[i + 1]]
    const d1 = Math.hypot(b[0] - a[0], b[1] - a[1]), d2 = Math.hypot(c[0] - b[0], c[1] - b[1]), k = Math.min(r, d1 / 2, d2 / 2)
    const p1 = [b[0] + ((a[0] - b[0]) / d1) * k, b[1] + ((a[1] - b[1]) / d1) * k]
    const p2 = [b[0] + ((c[0] - b[0]) / d2) * k, b[1] + ((c[1] - b[1]) / d2) * k]
    d += ` L${p1} Q${b} ${p2}`
  }
  const l = p[p.length - 1]
  return d + ` L${l}`
}

// 서버가 실제로 내보내는 모양(backend local_ai/pseudonym.py)을 그대로 흉내 낸다
// 대체 [이름_1] · 태그 [이름] · 삭제 [삭제됨] · 일반화는 주소(앞 두 낱말)·생년월일(연대)만, 나머지는 대체로 처리
const LABEL: Record<string, string> = { '주민등록번호': '식별번호', 'API 키': 'API키', '토큰': '토큰' }
export const serverLabel = (type: string) => LABEL[type] || type.replace(/\s+/g, '')
export const GENERALIZABLE = new Set(['주소', '생년월일'])
export function convert(type: string, v: string, method: Method, i = 0): string {
  const label = serverLabel(type)
  if (method === '삭제') return '[삭제됨]'
  if (method === '태그') return `[${label}]`
  if (method === '일반화' && GENERALIZABLE.has(type)) {
    if (type === '주소') { const w = v.split(/\s+/).slice(0, 2).join(' '); return w && w !== v.trim() ? w : `[${label}]` }
    const y = (v.match(/(?<![0-9])(1[89][0-9]{2}|20[0-9]{2})(?![0-9])/) || [])[1]
    return y ? `${y.slice(0, 3)}0년대` : `[${label}]`
  }
  return `[${label}_${i + 1}]`
}

// 보안팀 화면에서는 원래 값을 일부만 보여준다
export function partial(type: string, v: string | null | undefined): string {
  if (v == null || v === '') return '—'
  if (v.startsWith('⟦h=')) return '평문 없음 · ' + v.slice(3, -1).replace(/^(sha256|hmac):/, '$1 ').slice(0, 20) + '…' // 서버 배포본: 해시만 남아 있다
  if (v.startsWith('⟦=')) return v.slice(2, v.indexOf('#')) || '값 미전송' // 서버 데이터: 가린 값만 온다
  if (v.startsWith('⟦')) return '값 미전송' // 서버 데이터: 값은 저장하지 않음
  if (type === '이름') return v[0] + '*'.repeat(Math.max(1, v.length - 2)) + (v.length > 2 ? v.slice(-1) : '')
  if (type === '주소') return v.split(/\s+/).slice(0, 2).join(' ') + ' ***'
  if (type === '전화번호') return v.replace(/(\d{2,3})-?(\d{3,4})-?(\d{4})/, '$1-****-$3')
  if (type === '이메일') return v.replace(/^(.).*@/, '$1***@')
  if (type === '주민등록번호') return '******-*******'
  if (['카드번호', '계좌번호'].includes(type)) return v.slice(0, 4) + '****'
  if (type === '생년월일') return v.replace(/\d+월 \d+일/, '**월 **일')
  return v
}

// 시드 고정 난수 (예시 데이터를 매번 같게)
export function rnd(seed: number) {
  let s = seed
  return () => ((s = (Math.imul(s ^ (s >>> 15), 1 | s) + 0x6d2b79f5) | 0), (s >>> 0) % 100000) / 100000
}
