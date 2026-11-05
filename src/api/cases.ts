// 보안팀 검토 건 (/cases, 백엔드 docs/case-api.md)
// 판단·종결·다시 열기는 서버에 저장한다. 화면은 먼저 바꾸고, 서버가 거절하면 서버 상태로 다시 읽는다.
// 같은 건에 대한 요청(종결 → 되돌리기)은 순서가 뒤바뀌지 않게 건마다 줄을 세운다.
import type { Case, CaseClose, CaseReason, Conclusion, Cause, TimelineEntry } from '../domain/types'
import { S, emit, hooks, toast } from '../domain/store'
import { get, post, fromServer, type ServerEvent } from './client'

interface ServerClose { conclusion: Conclusion; cause: Cause | null; memo: string; rule: string | null; by: string; at: string }
interface ServerCase { id: string; need: 'required' | 'optional'; status: 'open' | 'closed'; event: ServerEvent; close: ServerClose | null }
interface ServerHistory { id: number; operation: 'close' | 'reopen'; conclusion: Conclusion | null; memo: string | null; rule: string | null; by: string; at: string }
interface Page { items: ServerCase[]; next_cursor: string | null }

const who = (by: string) => (by === 'unauthenticated' ? '보안팀' : by)
const CONC_KO: Record<Conclusion, string> = { violation: '위반 확정', legit: '정당한 업무 사용', fp: '탐지 오류' }

function reasonOf(x: ServerCase): CaseReason | null {
  const e = x.event, pick = e.reason === 'business_need' ? '업무상 필요' : e.reason === 'false_positive' ? '오탐' : undefined
  if (e.reason_text) return { text: e.reason_text, at: new Date(e.reason_at || e.created_at), when: e.reason_requested_at ? '요청 받고 제출' : '전송할 때', pick }
  if (pick) return { text: `"${pick}"를 골랐어요 (사유 글 없음)`, at: new Date(e.reason_at || e.created_at), when: '전송할 때', pick }
  return null
}
function toCase(x: ServerCase): Case {
  const ev = fromServer(x.event), reason = reasonOf(x)
  const close: CaseClose | null = x.close ? { k: x.close.conclusion, cause: x.close.cause, memo: x.close.memo, rule: x.close.rule, by: who(x.close.by), at: new Date(x.close.at) } : null
  const timeline: TimelineEntry[] = []
  if (x.event.reason_requested_at) timeline.push({ t: new Date(x.event.reason_requested_at), who: '시스템', cls: 'sys', what: '직원에게 사유 요청' })
  if (reason && x.event.reason_requested_at) timeline.push({ t: reason.at, who: ev.user, cls: 'emp', what: '사유 제출', quote: x.event.reason_text })
  return { id: x.id, ev, need: x.need === 'required' ? 'req' : 'opt', time: ev.time, user: ev.user, dept: ev.dept, items: ev.items, file: null, status: x.status, reason, close, timeline }
}

async function all(queue: 'required' | 'optional' | 'closed', max = 10) {
  const out: ServerCase[] = []
  let cursor: string | null = null
  for (let i = 0; i < max; i++) {
    const p: Page = await get<Page>(`/cases?queue=${queue}&limit=100${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`, 5000)
    out.push(...p.items)
    if (!(cursor = p.next_cursor)) break
  }
  return out
}

// 열린 건(필수·선택)과 종결 건을 모두 읽는다. 서버에 /cases 가 없으면 throw → 호출한 쪽이 예전 방식으로
export async function loadCases(): Promise<Case[]> {
  const [req, opt, closed] = await Promise.all([all('required'), all('optional'), all('closed')])
  return [...req, ...opt, ...closed].map(toCase)
}

// 상세를 열 때 처리 이력까지 읽어 처리 기록을 채운다
export async function loadCaseDetail(c: Case) {
  if (!S.api.live) return
  try {
    const d = await get<ServerCase & { history: ServerHistory[] }>(`/cases/${c.id}`, 5000)
    const base = toCase(d).timeline
    const hist = d.history.map<TimelineEntry>(h => ({ t: new Date(h.at), who: who(h.by), cls: 'me', what: h.operation === 'reopen' ? '다시 열기' : `종결 · ${CONC_KO[h.conclusion!]}${h.rule ? ' · 자동 변환 등록' : ''}`, quote: h.operation === 'close' && h.memo && h.memo !== '사유 확인' ? h.memo : null }))
    c.timeline = [...base, ...hist].sort((a, b) => +a.t - +b.t)
    emit()
  } catch { /* 상세 이력은 없어도 목록으로 판단할 수 있다 */ }
}

// ── 서버 저장
const queue = new Map<string, Promise<unknown>>()
function enqueue(id: string, job: () => Promise<unknown>) {
  const next = (queue.get(id) || Promise.resolve()).then(job, job)
  queue.set(id, next)
  return next
}
async function refresh(msg: string) {
  toast(msg)
  try { S.cases = await loadCases(); emit() } catch { /* 다음 불러오기 때 맞춰진다 */ }
}
function onClose(c: Case) {
  const x = c.close
  if (!S.api.live || !x) return
  enqueue(c.id, () => post(`/cases/${c.id}/close`, { conclusion: x.k, cause: x.cause, memo: x.memo || '사유 확인', rule: x.rule })
    .then(() => { if (c.timeline.length) loadCaseDetail(c) })
    .catch(e => refresh(/CASE_ALREADY_CLOSED/.test(String(e)) ? '다른 보안팀원이 먼저 처리했어요 · 최신 상태로 바꿨어요' : `서버에 저장하지 못했어요 (${(e as Error).message})`)))
}
function onReopen(c: Case) {
  if (!S.api.live) return
  enqueue(c.id, () => post(`/cases/${c.id}/reopen`).catch(e => refresh(/CASE_ALREADY_OPEN/.test(String(e)) ? '이미 열려 있어요 · 최신 상태로 바꿨어요' : `서버에 저장하지 못했어요 (${(e as Error).message})`)))
}
hooks.close = onClose
hooks.reopen = onReopen
