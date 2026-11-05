// 백엔드 연동 (team-i-balance/backend)
// 브라우저는 같은 주소의 /api 만 부른다. 개발은 Vite 프록시, 배포는 api/[...path].ts 가 BACKEND_URL 로 넘긴다.
// ?api=off 면 예시 데이터로만, ?api=http://host:port 면 그 서버로 바로 붙는다(CORS 허용 필요).
import type { AiEvent, Case, Grade, Item } from '../domain/types'
import { S, ent, emit, toast, type ServerStats } from '../domain/store'
import { loadPolicy } from './policy'

interface ServerEvent {
  id: number; created_at: string; grade: string; action: string; reason: string | null
  detection_confidence: string | null; detected_types: string[]; content_hash: string | null
}

const TYPE_KO: Record<string, string> = { NAME: '이름', PHONE: '전화번호', EMAIL: '이메일', ADDRESS: '주소', ID_NUMBER: '주민등록번호', ID: '주민등록번호', ACCOUNT: '계좌번호', CARD: '카드번호', DOB: '생년월일',
  USERNAME: '아이디', IP_ADDRESS: 'IP 주소', BUSINESS_NUMBER: '사업자번호', API_KEY: 'API 키', ACCESS_TOKEN: '액세스 토큰', PASSWORD: '비밀번호' }
const GRADE_IN: Record<string, Grade> = { public_O: 'O', sensitive_S: 'S', confidential_C: 'C' }
export const QUEUE_KO: Record<string, string> = { real_violation: '실제 위반', violation_candidate: '위반 후보(업무상 필요)', detection_improve: '탐지 개선(오탐)', pre_warning: '사전 경고' }

export async function get<T>(path: string, ms = 2500): Promise<T> {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms)
  try {
    const r = await fetch(S.api.base + path, { signal: ctl.signal })
    if (!r.ok) throw new Error(String(r.status))
    return (await r.json()) as T
  } finally { clearTimeout(t) }
}
export async function post<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(S.api.base + path, body === undefined ? { method: 'POST' } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((j as { detail?: string }).detail || String(r.status))
  return j as T
}

function candidates(): string[] {
  const q = new URLSearchParams(location.search).get('api')
  if (q === 'off') return []
  let stored: string | null = null
  try { stored = localStorage.getItem('apiBase') } catch { /* 저장소를 못 쓰는 환경 */ }
  return ['/api', q, stored].filter((u): u is string => !!u).map(u => u.replace(/\/$/, ''))
}

// 서버 이벤트 1건 → 콘솔 이벤트. 서버는 원문·직원·AI를 저장하지 않으므로 그 칸은 비워 둔다.
function fromServer(ev: ServerEvent): AiEvent {
  const grade = GRADE_IN[ev.grade] || 'O', types = (ev.detected_types || []).map(t => TYPE_KO[t] || t)
  types.forEach(t => { if (!ent(t)) S.policy.entities.push({ name: t, grade: grade === 'C' ? 'C' : 'S', method: grade === 'C' ? '—' : '대체', sample: '', on: true }) })
  const action: AiEvent['action'] = grade === 'C' ? 'block' : grade === 'O' ? 'pass'
    : (({ send_transformed: 'sent', send_as_is: 'raw', revert_original: 'revert', cancel: 'cancel' } as Record<string, AiEvent['action']>)[ev.action] || 'sent')
  const rsn = ev.reason === 'false_positive' ? '오탐' : ev.reason === 'business_need' ? '업무상 필요' : null
  const items: Item[] = types.map(type => ({ type, orig: `⟦${type}⟧`, method: ent(type)?.method ?? '대체', conv: '(변환됨)',
    status: grade !== 'S' ? null : action === 'raw' ? 'raw' : action === 'revert' ? 'revert' : 'conv',
    reason: action === 'revert' ? rsn : null, fp: action === 'revert' && rsn === '오탐' ? 'open' : null }))
  const h = (ev.content_hash || String(ev.id)).slice(0, 4)
  return { id: String(ev.id), time: new Date(ev.created_at), user: `직원 ${h}`, dept: '부서 미전송', ai: 'AI 미전송', file: null,
    tpl: '본문은 서버에 저장하지 않아요', items, grade, action,
    conf: ev.detection_confidence === 'high' ? 0.95 : 0.6, ver: S.policy.version, server: ev }
}
function casesFrom(events: AiEvent[]): Case[] {
  return events.filter(e => e.grade === 'S' && (e.action === 'raw' || (e.action === 'revert' && e.items.some(i => i.reason === '업무상 필요')))).map(e => ({
    id: 'INC-' + e.id, ev: e, need: e.action === 'raw' ? 'req' : 'opt', time: e.time, user: e.user, dept: e.dept, items: e.items, file: null,
    status: 'open', close: null, timeline: [],
    reason: e.action === 'raw' ? null : { pick: '업무상 필요', text: '(직원이 쓴 사유 글은 아직 서버에 없어요)', at: e.time, when: '전송할 때' },
  }))
}

export async function connect(): Promise<boolean> {
  const cands = candidates()
  S.api.state = cands.length ? 'connecting' : 'off'; emit()
  for (const base of cands) {
    S.api.base = base
    try {
      const h = await get<{ status: string }>('/health')
      if (h.status !== 'ok') continue
      const start = new Date(Date.now() - 7 * 864e5).toISOString()
      const evs = await get<ServerEvent[]>('/logs/events?limit=1000&start=' + encodeURIComponent(start), 5000)
      S.now = new Date(); S.loaded = Date.now()
      S.events = evs.map(fromServer).sort((a, b) => +b.time - +a.time)
      S.cases = casesFrom(S.events)
      S.ui.sel = null; S.ui.cur = {}
      let stats: ServerStats | null = null
      try { stats = await get<ServerStats>('/logs/stats') } catch { /* 통계는 없어도 된다 */ }
      try { await loadPolicy() } catch { /* 정책 API가 없는 서버면 콘솔 정책 그대로 */ }
      Object.assign(S.api, { state: 'live', live: true, count: evs.length, stats, synced: new Date() })
      emit()
      return true
    } catch { /* 다음 후보 */ }
  }
  S.api.base = null; S.api.live = false; S.api.state = cands.length ? 'offline' : 'off'
  emit()
  return false
}

export async function boot() {
  if (await connect()) toast(`서버 데이터 ${S.api.count}건을 불러왔어요`)
}
