// 실시간 갱신 (백엔드 docs/changes-api.md)
// 3초마다 /logs/changes 로 영역별 변경 표시값만 확인하고(안 바뀌면 304), 바뀐 영역만 다시 읽는다.
// SSE 대신 폴링인 이유: 배포 콘솔은 Vercel 함수(api/proxy.ts)가 응답을 다 받은 뒤 넘기므로 스트림을 흘려보낼 수 없다.
// 다시 읽어도 화면은 그대로 둔다: 고른 칸·지금 한 건·열린 창·되돌리기 알림이 가리키는 객체를 바꾸지 않고 내용만 채운다.
// 서버에 보내는 중인 판단·초안이 있으면 그 영역은 다음 확인으로 미룬다(내가 방금 바꾼 화면을 서버의 이전 상태로 덮지 않게).
import type { AiEvent, Case } from '../domain/types'
import { S, emit, toast } from '../domain/store'
import { allEvents, casesFrom, fromServer, periodStats } from './client'
import { casesBusy, casesEpoch, loadCaseDetail, loadCases } from './cases'
import { refreshFpDecisions } from './fp'
import { draftBusy, draftEdits, draftEtag, loadActive, loadHistory, markExcluded, refreshDraft, reloadPolicy } from './policy'

interface Changes {
  events: { last_id: number | null; change_seq: number }
  cases: { last_id: number | null }
  false_positives: { last_id: number | null; reports: { last_id: number | null; change_seq: number } }
  policy: { latest: number | null; active: number | null; activated_at: string | null; draft_etag: string; ack_last_id: number | null }
  rev: string
}

export const EVERY = 3000
const MAX_WAIT = 30_000, LEGACY_EVERY = 15_000
let timer = 0, gen = 0, fails = 0, etag: string | null = null, last: Changes | null = null
let legacy = false // /logs/changes 가 없는 예전 서버: 15초마다 이벤트·건을 통째로 다시 읽는다
const dirty = { events: false, cases: false, fp: false, policy: false, draft: false }

async function fetchChanges(): Promise<Changes | null> {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 5000)
  try {
    const r = await fetch(S.api.base + '/logs/changes', { headers: etag ? { 'If-None-Match': etag } : {}, cache: 'no-store', signal: ctl.signal })
    if (r.status === 304) return null
    if (!r.ok) throw new Error(String(r.status))
    etag = r.headers.get('etag')
    return (await r.json()) as Changes
  } finally { clearTimeout(t) }
}

// connect() 가 데이터를 읽기 전에 부른다. 기준값이 없으면(예전 서버) 통째로 다시 읽는 방식으로 간다
export async function baseline() {
  etag = null; last = null; legacy = false
  Object.keys(dirty).forEach(k => (dirty[k as keyof typeof dirty] = false))
  try { last = await fetchChanges() } catch (e) { legacy = (e as Error).message === '404' }
}

function diff(c: Changes) {
  const p = last
  // 기준값을 못 받았으면(연결 직후 일시 오류) 그사이 바뀐 것을 모르니 한 번 통째로 다시 읽는다
  if (!p) { last = c; dirty.events = dirty.cases = dirty.fp = true; return }
  // 새 이벤트·사유 제출·재요청은 이벤트에서 나오는 건과 오탐 신고도 바꾼다(이벤트를 다시 읽으면 오탐 판단도 다시 맞춘다)
  if (p.events.last_id !== c.events.last_id || p.events.change_seq !== c.events.change_seq) dirty.events = dirty.cases = true
  if (p.cases.last_id !== c.cases.last_id) dirty.cases = true
  if (p.false_positives.last_id !== c.false_positives.last_id) dirty.fp = true
  if (p.policy.latest !== c.policy.latest || p.policy.active !== c.policy.active || p.policy.activated_at !== c.policy.activated_at) dirty.policy = true
  if (c.policy.draft_etag !== draftEtag()) dirty.draft = true
  last = c
}

// ── 객체를 바꾸지 않고 내용만 채우기
function mergeEvents(fresh: AiEvent[]) {
  const old = new Map(S.events.map(e => [e.id, e]))
  S.events = fresh.map(n => {
    const o = old.get(n.id)
    if (!o) return n
    // 오탐 '유지' 되돌리기는 항목 객체를 붙잡고 있으므로 항목도 같은 객체를 쓴다.
    // 오탐 상태(fp)는 이 화면의 판단(되돌리기 대기 포함)을 담고 있으니 두고, refreshFpDecisions 가 서버 기준으로 다시 맞춘다
    n.items = n.items.map((it, i) => {
      const oi = o.items[i]
      if (!oi || oi.type !== it.type || oi.orig !== it.orig) return it
      const fp = oi.fp
      return Object.assign(oi, it, { fp: fp ?? it.fp })
    })
    return Object.assign(o, n)
  })
}
function mergeCases(fresh: Case[]) {
  const old = new Map(S.cases.map(c => [c.id, c]))
  S.cases = fresh.map(n => {
    const o = old.get(n.id)
    if (!o) return n
    // 상세에서 읽은 처리 이력은 목록보다 길다. 상태가 그대로면 그 이력을 둔다
    const same = o.status === n.status && +(o.close?.at ?? 0) === +(n.close?.at ?? 0) && !!o.reason === !!n.reason
    if (same && o.timeline.length > n.timeline.length) n.timeline = o.timeline
    return Object.assign(o, n)
  })
}

const openReq = () => new Map(S.cases.filter(c => c.need === 'req' && c.status === 'open').map(c => [c.id, c]))

// 바뀐 영역만 다시 읽는다. 한 영역이 실패하면 그 영역만 다음 확인 때 다시 한다
async function apply(g: number): Promise<boolean> {
  let changed = false
  const before = openReq(), hadReason = new Set([...before.values()].filter(c => c.reason).map(c => c.id))
  if (dirty.events) {
    const evs = (await allEvents(new Date(Date.now() - 30 * 864e5))).map(fromServer).sort((a, b) => +b.time - +a.time)
    if (g !== gen) return false
    mergeEvents(evs)
    S.now = new Date(); S.loaded = Date.now()
    S.api.count = S.events.filter(e => +e.time >= Date.now() - 7 * 864e5).length
    periodStats(7).then(s => { if (g === gen) { S.api.stats = s; emit() } }, () => {})
    dirty.events = false; dirty.fp = true; changed = true
  }
  if (dirty.cases && !casesBusy()) {
    const e0 = casesEpoch()
    // /cases 가 없는 예전 서버만 이벤트로 만든다. 다른 오류는 던져서 다음 확인 때 다시 읽는다(종결 건을 열린 건으로 바꾸지 않게)
    const cs = await loadCases().catch(e => { if ((e as Error).message === '404') return casesFrom(S.events); throw e })
    if (g !== gen) return false
    // 읽는 사이에 내가 판단을 보냈거나 끝냈으면 이번 결과는 버리고 다음에 다시 읽는다
    if (!casesBusy() && casesEpoch() === e0) {
      mergeCases(cs); dirty.cases = false; changed = true
      const cur = S.ui.cur.req || S.ui.cur.opt, open = cur ? S.cases.find(c => c.id === cur) : undefined
      if (open?.timeline.length) loadCaseDetail(open)
    }
  }
  if (dirty.fp) {
    if (!(await refreshFpDecisions(() => g === gen))) return false
    markExcluded(); dirty.fp = false; changed = true
  }
  // 정책: 받는 사이 재연결되거나 내가 정책을 고쳤으면(ok 가 false) 반영하지 않고 다음에 다시 한다
  const dialogEditing = () => ['publish', 'changes', 'addDict', 'exclude'].includes(S.ui.dialog?.kind ?? '')
  const e0 = draftEdits(), ok = () => g === gen && !draftBusy() && draftEdits() === e0 && !dialogEditing()
  if (dirty.policy && ok()) {
    // 다른 사람이 새 버전을 배포했으면 내 초안 변경이 없을 때만 통째로, 아니면 기록과 서버 적용 상태만
    const latest = last?.policy.latest ?? null, mine = +S.policy.version.slice(1) || 0
    const newer = latest !== null && latest > mine
    if (newer && !S.policy.changes.length) { if (await reloadPolicy(ok)) { dirty.policy = false; changed = true } }
    else {
      await Promise.all([loadActive(ok), loadHistory(ok)])
      if (ok()) { dirty.policy = false; changed = true; if (newer) toast(`다른 보안팀원이 v${latest}를 배포했어요 · 내 초안을 확인해 주세요`) }
    }
    if (g !== gen) return false
  }
  if (dirty.draft && ok()) {
    if (!last || last.policy.draft_etag === draftEtag()) dirty.draft = false
    else if (await refreshDraft(ok)) { dirty.draft = false; changed = true }
    if (g !== gen) return false
  }
  if (changed) {
    const after = openReq(), added = [...after.keys()].filter(id => !before.has(id))
    const arrived = [...after.values()].filter(c => c.reason && before.has(c.id) && !hadReason.has(c.id))
    if (added.length) toast(`새 필수 검토 ${added.length}건이 들어왔어요`)
    else if (arrived.length) toast(`${arrived[0].user} 님의 사유가 도착했어요${arrived.length > 1 ? ` 외 ${arrived.length - 1}건` : ''}`)
  }
  return changed
}

let legacyAt = 0
async function tick() {
  timer = 0
  if (!S.api.live || document.hidden) return // 다시 보이면 visibilitychange 가 이어 간다
  const g = gen
  try {
    if (legacy) {
      if (Date.now() - legacyAt >= LEGACY_EVERY) { legacyAt = Date.now(); dirty.events = dirty.cases = true }
    } else {
      const c = await fetchChanges()
      if (g !== gen) return
      if (c) diff(c)
    }
    const changed = await apply(g)
    if (g !== gen) return
    fails = 0
    // 바뀐 게 없으면 다시 그리지 않는다(3초마다 화면 전체를 그리지 않게)
    if (changed || S.api.stale) { if (changed) S.api.synced = new Date(); S.api.stale = false; emit() }
  } catch (e) {
    if (g !== gen) return
    fails++
    if (/^40[13]$/.test((e as Error).message)) { S.api.stale = true; emit(); return } // 토큰 문제: 다시 연결할 때까지 멈춤
    if (fails >= 3 && !S.api.stale) { S.api.stale = true; emit() }
  }
  if (g === gen && S.api.live) schedule(fails ? Math.min(MAX_WAIT, EVERY * 2 ** fails) : EVERY)
}
function schedule(ms: number) { clearTimeout(timer); timer = window.setTimeout(tick, ms) }

export function startLive() { gen++; fails = 0; legacyAt = Date.now(); schedule(EVERY) }
export function stopLive() { gen++; clearTimeout(timer); timer = 0 }

// 탭을 다시 보면 바로 확인한다(숨긴 동안은 부르지 않는다)
addEventListener('visibilitychange', () => { if (!document.hidden && S.api.live && !timer) { gen++; schedule(0) } })
