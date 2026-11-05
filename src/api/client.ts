// 백엔드 연동 (team-i-balance/backend)
// 브라우저는 같은 주소의 /api 만 부른다. 개발은 Vite 프록시, 배포는 api/proxy.ts 가 BACKEND_URL 로 넘긴다.
// ?api=http://host:port 면 그 서버로 바로 붙는다(CORS 허용 필요). 예시 데이터는 없다: 연결이 안 되면 빈 화면이다.
import type { AiEvent, Case, Grade, Item } from '../domain/types'
import { S, ent, emit, toast, type ServerStats } from '../domain/store'
import { loadPolicy } from './policy'
import { loadCases } from './cases'
import { loadFpDecisions } from './fp'
import { baseline, startLive, stopLive } from './live'

export interface ServerEvent {
  id: number; created_at: string; grade: string; action: string; reason: string | null
  detection_confidence: string | null; detected_types: string[]; content_hash: string | null
  reason_text?: string | null; reason_requested_at?: string | null; reason_at?: string | null
  // 이슈 #21(PR #36)이 들어오면 채워진다
  user_id?: string | null; dept?: string | null; target_ai?: string | null
  source?: 'text' | 'file' // #32: 엑셀 파일 검사·차단·보호본 다운로드도 이벤트로 남는다
  test?: boolean // #27: 시험 이벤트
  policy_version?: number | null // #49: 그 입력을 처리할 때 적용 중이던 정책 버전
  items?: { type: string; decision: 'converted' | 'reverted' | 'raw'; reason?: string | null; value_hash?: string | null; preview?: string | null }[]
}

const TYPE_KO: Record<string, string> = { NAME: '이름', PHONE: '전화번호', EMAIL: '이메일', ADDRESS: '주소', ID_NUMBER: '주민등록번호', ID: '주민등록번호', ACCOUNT: '계좌번호', CARD: '카드번호', DOB: '생년월일',
  USERNAME: '아이디', IP_ADDRESS: 'IP 주소', BUSINESS_NUMBER: '사업자번호', API_KEY: 'API 키', ACCESS_TOKEN: '액세스 토큰', PASSWORD: '비밀번호',
  SENSITIVE: '민감정보', CONFIDENTIAL: '기밀', INTERNAL: '사내정보' }
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
  // FastAPI 422 는 detail 이 배열이다: 첫 항목의 위치와 메시지로 보여 준다
  const d = (j as { detail?: unknown }).detail
  if (!r.ok) throw new Error(typeof d === 'string' ? d : Array.isArray(d) && d[0] ? `${(d[0].loc || []).slice(1).join('.')} ${d[0].msg}`.trim() : String(r.status))
  return j as T
}

function candidates(): string[] {
  const q = new URLSearchParams(location.search).get('api')
  let stored: string | null = null
  try { stored = localStorage.getItem('apiBase') } catch { /* 저장소를 못 쓰는 환경 */ }
  return ['/api', q, stored].filter((u): u is string => !!u).map(u => u.replace(/\/$/, ''))
}

// 서버 이벤트 1건 → 콘솔 이벤트. 서버는 원문·직원·AI를 저장하지 않으므로 그 칸은 비워 둔다.
export function fromServer(ev: ServerEvent): AiEvent {
  const grade = GRADE_IN[ev.grade] || 'O', types = (ev.detected_types || []).map(t => TYPE_KO[t] || t)
  // 처리는 서버에 남은 action 그대로 보여 준다. 서버는 기밀(C)도 원문 전송을 막지 않으므로 등급으로 '차단'이라 단정하지 않는다
  const act = ({ send_transformed: 'sent', send_as_is: 'raw', revert_original: 'revert', cancel: 'cancel' } as Record<string, AiEvent['action']>)[ev.action] || 'sent'
  const action: AiEvent['action'] = grade === 'C' && act === 'cancel' ? 'block' : grade === 'O' && act !== 'cancel' ? 'pass' : act
  const rsn = ev.reason === 'false_positive' ? '오탐' : ev.reason === 'business_need' ? '업무상 필요' : null
  // 항목별 정보(#21)가 오면 가린 값(preview)과 값 해시로 채운다. 원래 값은 서버에도 없다.
  const ko = (r?: string | null) => (r === 'false_positive' ? '오탐' : r === 'business_need' ? '업무상 필요' : null)
  const items: Item[] = ev.items?.length
    ? ev.items.map(it => {
      const type = TYPE_KO[it.type] || it.type, r = ko(it.reason) ?? (it.decision === 'reverted' ? rsn : null)
      return { type, orig: `⟦=${it.preview ?? ''}#${it.value_hash ?? 'nohash-' + ev.id + '-' + type}⟧`, method: ent(type)?.method ?? '대체', conv: '(변환됨)',
        status: grade !== 'S' ? null : it.decision === 'raw' ? 'raw' : it.decision === 'reverted' ? 'revert' : 'conv',
        reason: it.decision === 'reverted' ? r : null, fp: it.decision === 'reverted' && r === '오탐' ? 'open' : null }
    })
    : types.map(type => ({ type, orig: `⟦${type}⟧`, method: ent(type)?.method ?? '대체', conv: '(변환됨)',
      status: grade !== 'S' ? null : action === 'raw' ? 'raw' : action === 'revert' ? 'revert' : 'conv',
      reason: action === 'revert' ? rsn : null, fp: null })) // 값 해시가 없어 묶거나 제외할 수 없다(오탐 신고 화면에 건수만 알린다)
  // 직원 ID가 없으면 '직원 미전송'. 본문 해시는 사람이 아니라 글을 가리켜서 직원처럼 쓰지 않는다
  return { id: String(ev.id), time: new Date(ev.created_at), user: ev.user_id || '직원 미전송', dept: ev.dept || '부서 미전송', ai: ev.target_ai || 'AI 미전송', file: ev.source === 'file' ? { name: '엑셀 파일', meta: [] } : null,
    // 본문은 서버에 없다. 항목별 가린 값(#21)이 있으면 그것만 이어서 보여 준다
    tpl: (ev.items?.some(i => i.preview) ? items.map((_, i) => `{${i}}`).join('  ') + '  · ' : '') + (ev.source === 'file' ? '엑셀 파일 · 내용은 서버에 저장하지 않아요' : '본문은 서버에 저장하지 않아요'), items, grade, action,
    conf: ev.detection_confidence === 'high' ? 0.95 : ev.detection_confidence === 'medium' ? 0.75 : 0.5, ver: ev.policy_version != null ? 'v' + ev.policy_version : '', server: ev, test: !!ev.test }
}
// 필수·선택은 보낼 때 사유를 남겼는지로 나눈다(사유 요청 뒤 낸 사유는 필수 그대로)
const sentWithReason = (e: AiEvent) => { const s = e.server as ServerEvent | undefined; return !!(s?.reason && !s.reason_requested_at) }
export function casesFrom(events: AiEvent[]): Case[] {
  return events.filter(e => e.grade === 'S' && (e.action === 'raw' || (e.action === 'revert' && e.items.some(i => i.reason === '업무상 필요')))).map(e => ({
    id: 'INC-' + e.id, ev: e, need: sentWithReason(e) ? 'opt' : 'req', time: e.time, user: e.user, dept: e.dept, items: e.items, file: null,
    status: 'open', close: null, timeline: [],
    reason: !sentWithReason(e) ? null : { pick: '업무상 필요', text: '(직원이 쓴 사유 글은 아직 서버에 없어요)', at: e.time, when: '전송할 때' },
  }))
}

// 기간 이벤트를 끝까지 읽는다(/logs/events 의 cursor 페이지 넘김). 예전 서버는 cursor 를 무시하므로 같은 페이지가 오면 멈춘다.
export async function allEvents(from: Date, max = 20): Promise<ServerEvent[]> {
  S.api.truncated = false
  const q = new URLSearchParams({ limit: '1000', start: from.toISOString(), ...(S.api.includeTest ? { include_test: 'true' } : {}) }), out: ServerEvent[] = []
  for (let i = 0; i < max; i++) {
    const page = await get<ServerEvent[]>('/logs/events?' + q, 8000)
    if (out.length && page.length && page[0].id >= out[out.length - 1].id) break
    out.push(...page)
    if (page.length < 1000) break
    if (i === max - 1) S.api.truncated = true // 너무 많아 일부만 읽었다
    q.set('cursor', String(page[page.length - 1].id))
  }
  return out
}
// 기간 통계(/logs/stats?start&end). 분모가 그 기간 전체라 목록 개수 제한과 상관없다.
export const periodStats = (days: number) => get<ServerStats>('/logs/stats?' + new URLSearchParams({ start: new Date(Date.now() - days * 864e5).toISOString(), end: new Date().toISOString(), ...(S.api.includeTest ? { include_test: 'true' } : {}) }), 5000)

// 로그 내보내기(/logs/export): 서버가 보안팀 공개키로 암호화해 서버 쪽 파일로 쓴다. 브라우저로 내려받지 않는다.
// 한 번에 최대 1000건, 더 있으면 next_cursor 로 같은 기간을 이어서 내보낸다
export interface ExportResult { exported: number; file: string; public_key_fingerprint: string; next_cursor?: number | null }
export const exportLogs = (start: Date, end: Date, cursor?: number | null) => post<ExportResult>('/logs/export?' + new URLSearchParams({ start: start.toISOString(), end: end.toISOString(), limit: '1000', ...(S.api.includeTest ? { include_test: 'true' } : {}), ...(cursor ? { cursor: String(cursor) } : {}) }))

// 시험 이벤트(test=true)는 서버가 기본으로 뺀다(#27). 시연할 때만 켠다. 검토 건(/cases)에는 들어오지 않는다.
export function setIncludeTest(v: boolean) {
  S.api.includeTest = v
  try { localStorage.setItem('includeTest', v ? '1' : '0') } catch { /* 이번 창에서만 */ }
  return connect()
}

export async function connect(): Promise<boolean> {
  const cands = candidates()
  let denied = false // 서버는 살아 있는데 토큰이 없거나 틀림(401·403)
  stopLive()
  S.api.state = 'connecting'; emit()
  for (const base of cands) {
    S.api.base = base
    try {
      const h = await get<{ status: string }>('/health')
      if (h.status !== 'ok') continue
      // 데이터를 읽기 전에 변경 표시값을 먼저 받아 둔다(읽는 사이에 바뀐 것도 다음 확인에서 잡힌다)
      await baseline()
      const evs = await allEvents(new Date(Date.now() - 30 * 864e5))
      S.now = new Date(); S.loaded = Date.now()
      S.events = evs.map(fromServer).sort((a, b) => +b.time - +a.time)
      S.cases = (await loadCases().catch(() => null)) ?? casesFrom(S.events)
      S.ui.sel = null; S.ui.cur = {}
      let stats: ServerStats | null = null
      try { stats = await periodStats(7) } catch { /* 통계는 없어도 된다 */ }
      try { await loadPolicy() } catch { /* 정책 API가 없는 서버면 콘솔 정책 그대로 */ }
      try { await loadFpDecisions() } catch { /* 오탐 판단 API가 없는 서버면 정책의 탐지 제외로만 되살린다 */ }
      Object.assign(S.api, { state: 'live', live: true, count: S.events.filter(e => +e.time >= Date.now() - 7 * 864e5).length, stats, synced: new Date(), stale: false })
      emit()
      startLive()
      return true
    } catch (e) { if (/^40[13]$/.test((e as Error).message)) denied = true /* 다음 후보 */ }
  }
  // 서버 데이터가 없으면 아무것도 보여 주지 않는다(이전에 읽은 것도 비운다)
  S.events = []; S.cases = []; S.history = []
  S.api.base = null; S.api.live = false; S.api.state = denied ? 'auth' : 'offline'
  emit()
  return false
}

export async function boot() {
  if (await connect()) toast(`서버 데이터 ${S.api.count}건을 불러왔어요`)
}
