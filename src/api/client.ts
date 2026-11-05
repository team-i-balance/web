// 백엔드 연동 (team-i-balance/backend)
// 브라우저는 같은 주소의 /api 만 부른다. 개발은 Vite 프록시, 배포는 api/proxy.ts 가 BACKEND_URL 로 넘긴다.
// ?api=off 면 예시 데이터로만, ?api=http://host:port 면 그 서버로 바로 붙는다(CORS 허용 필요).
import type { AiEvent, Case, Grade, Item } from '../domain/types'
import { S, ent, emit, toast, type ServerStats } from '../domain/store'
import { loadPolicy } from './policy'
import { loadCases } from './cases'

export interface ServerEvent {
  id: number; created_at: string; grade: string; action: string; reason: string | null
  detection_confidence: string | null; detected_types: string[]; content_hash: string | null
  reason_text?: string | null; reason_requested_at?: string | null; reason_at?: string | null
  // 이슈 #21(PR #36)이 들어오면 채워진다
  user_id?: string | null; dept?: string | null; target_ai?: string | null
  items?: { type: string; decision: 'converted' | 'reverted' | 'raw'; reason?: string | null; value_hash?: string | null; preview?: string | null }[]
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
export async function post<T>(path: string, body?: unknown, headers: Record<string, string> = {}, method = 'POST'): Promise<T> {
  const r = await fetch(S.api.base + path, body === undefined ? { method, headers } : { method, headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
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
export function fromServer(ev: ServerEvent): AiEvent {
  const grade = GRADE_IN[ev.grade] || 'O', types = (ev.detected_types || []).map(t => TYPE_KO[t] || t)
  types.forEach(t => { if (!ent(t)) S.policy.entities.push({ name: t, grade: grade === 'C' ? 'C' : 'S', method: grade === 'C' ? '—' : '대체', sample: '', on: true }) })
  const action: AiEvent['action'] = grade === 'C' ? 'block' : grade === 'O' ? 'pass'
    : (({ send_transformed: 'sent', send_as_is: 'raw', revert_original: 'revert', cancel: 'cancel' } as Record<string, AiEvent['action']>)[ev.action] || 'sent')
  const rsn = ev.reason === 'false_positive' ? '오탐' : ev.reason === 'business_need' ? '업무상 필요' : null
  // 항목별 정보(#21)가 오면 가린 값(preview)과 값 해시로 채운다. 원래 값은 서버에도 없다.
  const ko = (r?: string | null) => (r === 'false_positive' ? '오탐' : r === 'business_need' ? '업무상 필요' : null)
  const items: Item[] = ev.items?.length
    ? ev.items.map(it => {
      const type = TYPE_KO[it.type] || it.type, r = ko(it.reason) ?? (it.decision === 'reverted' ? rsn : null)
      if (!ent(type)) S.policy.entities.push({ name: type, grade: 'S', method: '대체', sample: '', on: true })
      return { type, orig: `⟦=${it.preview ?? ''}#${it.value_hash ?? ev.id + type}⟧`, method: ent(type)?.method ?? '대체', conv: '(변환됨)',
        status: grade !== 'S' ? null : it.decision === 'raw' ? 'raw' : it.decision === 'reverted' ? 'revert' : 'conv',
        reason: it.decision === 'reverted' ? r : null, fp: it.decision === 'reverted' && r === '오탐' ? 'open' : null }
    })
    : types.map(type => ({ type, orig: `⟦${type}⟧`, method: ent(type)?.method ?? '대체', conv: '(변환됨)',
      status: grade !== 'S' ? null : action === 'raw' ? 'raw' : action === 'revert' ? 'revert' : 'conv',
      reason: action === 'revert' ? rsn : null, fp: action === 'revert' && rsn === '오탐' ? 'open' : null }))
  const h = (ev.content_hash || String(ev.id)).slice(0, 4)
  return { id: String(ev.id), time: new Date(ev.created_at), user: ev.user_id || `직원 ${h}`, dept: ev.dept || '부서 미전송', ai: ev.target_ai || 'AI 미전송', file: null,
    tpl: '본문은 서버에 저장하지 않아요', items, grade, action,
    conf: ev.detection_confidence === 'high' ? 0.95 : 0.6, ver: '', server: ev } // 서버 이벤트에는 당시 정책 버전이 없다
}
function casesFrom(events: AiEvent[]): Case[] {
  return events.filter(e => e.grade === 'S' && (e.action === 'raw' || (e.action === 'revert' && e.items.some(i => i.reason === '업무상 필요')))).map(e => ({
    id: 'INC-' + e.id, ev: e, need: e.action === 'raw' ? 'req' : 'opt', time: e.time, user: e.user, dept: e.dept, items: e.items, file: null,
    status: 'open', close: null, timeline: [],
    reason: e.action === 'raw' ? null : { pick: '업무상 필요', text: '(직원이 쓴 사유 글은 아직 서버에 없어요)', at: e.time, when: '전송할 때' },
  }))
}

// 기간 이벤트를 끝까지 읽는다(/logs/events 의 cursor 페이지 넘김). 예전 서버는 cursor 를 무시하므로 같은 페이지가 오면 멈춘다.
async function allEvents(from: Date, max = 20): Promise<ServerEvent[]> {
  const q = new URLSearchParams({ limit: '1000', start: from.toISOString() }), out: ServerEvent[] = []
  for (let i = 0; i < max; i++) {
    const page = await get<ServerEvent[]>('/logs/events?' + q, 8000)
    if (out.length && page.length && page[0].id >= out[out.length - 1].id) break
    out.push(...page)
    if (page.length < 1000) break
    q.set('cursor', String(page[page.length - 1].id))
  }
  return out
}
// 기간 통계(/logs/stats?start&end). 분모가 그 기간 전체라 목록 개수 제한과 상관없다.
export const periodStats = (days: number) => get<ServerStats>('/logs/stats?' + new URLSearchParams({ start: new Date(Date.now() - days * 864e5).toISOString(), end: new Date().toISOString() }), 5000)

export async function connect(): Promise<boolean> {
  const cands = candidates()
  S.api.state = cands.length ? 'connecting' : 'off'; emit()
  for (const base of cands) {
    S.api.base = base
    try {
      const h = await get<{ status: string }>('/health')
      if (h.status !== 'ok') continue
      const evs = await allEvents(new Date(Date.now() - 30 * 864e5))
      S.now = new Date(); S.loaded = Date.now()
      S.events = evs.map(fromServer).sort((a, b) => +b.time - +a.time)
      S.cases = (await loadCases().catch(() => null)) ?? casesFrom(S.events)
      S.ui.sel = null; S.ui.cur = {}
      let stats: ServerStats | null = null
      try { stats = await periodStats(7) } catch { /* 통계는 없어도 된다 */ }
      try { await loadPolicy() } catch { /* 정책 API가 없는 서버면 콘솔 정책 그대로 */ }
      Object.assign(S.api, { state: 'live', live: true, count: S.events.filter(e => +e.time >= Date.now() - 7 * 864e5).length, stats, synced: new Date() })
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
