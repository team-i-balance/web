// 변환 정책 배포 (team-i-balance/backend /policy)
// 서명·버전 번호는 서버가 매긴다. 콘솔은 payload(docs/BUNDLE-SPEC.md 3절)만 보낸다.
import type { Policy } from '../domain/types'
import { S, ent, emit, hooks, toast } from '../domain/store'
import { fmt } from '../lib/util'
import { get, post } from './client'

const ORG = 'acme' // 백엔드 POLICY_ORG 기본값
const THRESHOLDS = { confidential: 0.45, personal: 0.35, high_confidence: 0.7 }
const REASON_KO: Record<string, string> = { bad_type: '형식 오류', bad_signature: '서명 불일치', unsupported_schema: '모르는 형식', wrong_org: '다른 조직', rollback: '이전 버전', expired: '만료', model_mismatch: '모델 불일치' }

interface Envelope { payloadType: string; payload: string; signatures: { keyid: string; sig: string }[] }
interface Payload { version: number; rules?: { id: string; label: string; description: string; grade: string; action: string }[]; types?: Record<string, { on?: boolean }> }

async function sha256(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return 'sha256:' + [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('')
}

// 회사 고유 단어·탐지 제외 값은 평문 대신 해시로 보낸다
export async function buildPayload(P: Policy) {
  return {
    schema: 1, org: ORG, thresholds: THRESHOLDS,
    rules: P.learned.map((r, i) => ({ id: `r-${i + 1}`, label: r.type.slice(0, 15), description: r.when.slice(0, 40), grade: ent(r.type)?.grade === 'C' ? 'C' : 'S', action: r.method })),
    types: Object.fromEntries(P.entities.map(e => [e.name, { on: e.on, grade: e.grade, method: e.method }])),
    dict: await Promise.all(P.dict.map(async d => ({ h: await sha256(d.term), type: d.type }))),
    exclude: await Promise.all(P.exclude.map(async x => ({ h: await sha256(x.term) }))),
  }
}

const decode = (b64: string): Payload => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0))))

// PC 적용 현황: 지금 버전 기준(/policy/{n}/acks). 없으면 전체 요약(/policy/acks)
async function loadAcks() {
  type A = NonNullable<NonNullable<typeof S.api.pol>['acks']>
  const n = +S.policy.version.slice(1)
  try {
    if (n > 0) { const r = await get<A>(`/policy/${n}/acks`); if (S.api.pol) S.api.pol.acks = r; return }
  } catch { /* 예전 서버: 전체 요약으로 */ }
  try { const r = await get<{ summary: A }>('/policy/acks'); if (S.api.pol) S.api.pol.acks = r.summary } catch { /* 현황은 없어도 된다 */ }
}

// 배포 기록(/policy/history). 이 브라우저에서 배포한 버전은 무엇이 바뀌었는지까지 남겨 둔 것을 쓴다
interface HistoryItem { version: number; sha256: string; stored_at: string | null; rule_count: number }
export let historyFromServer = false
async function loadHistory() {
  try {
    const items = await get<HistoryItem[]>('/policy/history')
    const local = new Map(S.history.filter(h => h.server).map(h => [h.version, h]))
    S.history = items.sort((a, b) => a.version - b.version).map(h => {
      const v = 'v' + h.version, l = local.get(v)
      return { version: v, at: h.stored_at ? new Date(h.stored_at) : l?.at ?? new Date(0), changes: l?.changes ?? [{ what: `자동 변환 규칙 ${h.rule_count}개`, src: h.sha256.replace('sha256:', '').slice(0, 10) }], server: true }
    })
    const last = items.find(h => 'v' + h.version === S.policy.version)
    if (last?.stored_at) S.policy.deployed = fmt(new Date(last.stored_at))
    historyFromServer = true
  } catch { historyFromServer = false }
}

// 서버의 최신 배포본을 콘솔 정책에 반영한다. 아직 배포가 없으면 v0(규칙 없음)부터.
export async function loadPolicy() {
  S.api.pol = { keyid: null, sha: null, acks: null }
  const P = S.policy
  try {
    const env = await get<Envelope>('/policy/latest')
    const p = decode(env.payload)
    P.version = 'v' + p.version
    P.learned = (p.rules || []).map(r => ({ type: r.label, when: r.description, method: r.action as Policy['learned'][number]['method'], from: '서버', hits: 0, live: true }))
    Object.entries(p.types || {}).forEach(([name, t]) => { const e = ent(name); if (e && typeof t.on === 'boolean') e.on = t.on })
    S.api.pol.keyid = env.signatures[0]?.keyid ?? null
  } catch (e) {
    if ((e as Error).message !== '404') throw e
    P.version = 'v0'; P.learned = []
  }
  P.deployed = ''; P.changes = []
  S.history = []
  await Promise.all([loadAcks(), loadHistory(), loadDraft()])
}

// ── 정책 초안 (/policy/draft, 백엔드 docs/policy-draft-api.md)
// 고칠 때마다 서버 초안에 저장해 새로고침·다른 보안팀원과 공유한다. 화면을 되살리는 데 필요한 평문(고유 단어·제외 값)은
// 초안의 console 칸에만 두고, 배포할 때는 해시만 담은 payload 를 보낸다(평문은 PC 번들에 들어가지 않는다).
interface DraftOut { payload: (Record<string, unknown> & { console?: ConsoleState }) | null; changes: { what: string; src: string }[]; has_draft: boolean; etag: string }
interface ConsoleState { entities: Policy['entities']; learned: Policy['learned']; dict: Policy['dict']; exclude: Policy['exclude']; meta: Policy['meta'] }
let etag: string | null = null, timer = 0, saving: Promise<void> = Promise.resolve()
export let draftOn = false

function applyDraft(d: DraftOut) {
  etag = d.etag
  const c = d.payload?.console
  if (!d.has_draft || !c) return
  const P = S.policy
  P.entities = c.entities; P.learned = c.learned; P.dict = c.dict; P.exclude = c.exclude; P.meta = c.meta
  P.changes = d.changes.map(x => ({ what: x.what, src: x.src }))
}
async function loadDraft() {
  try { applyDraft(await get<DraftOut>('/policy/draft', 5000)); draftOn = true } catch { draftOn = false }
}
async function saveDraft() {
  if (!draftOn || !S.api.live) return
  const P = S.policy
  const console: ConsoleState = { entities: P.entities, learned: P.learned, dict: P.dict, exclude: P.exclude, meta: P.meta }
  try {
    const d = await post<DraftOut>('/policy/draft', { payload: { ...(await buildPayload(P)), console }, changes: P.changes.slice(-500).map(c => ({ what: c.what.slice(0, 2000), src: (c.src || '직접 수정').slice(0, 128) })) },
      etag ? { 'If-Match': etag } : {}, 'PUT')
    etag = d.etag
  } catch (e) {
    const m = (e as Error).message
    if (/CONFLICT|PRECONDITION|409|428/.test(m)) { await loadDraft(); emit(); toast('다른 보안팀원이 정책 초안을 바꿨어요 · 최신 초안을 불러왔어요') }
    else toast(`정책 초안을 서버에 저장하지 못했어요 (${m})`)
  }
}
// 바꿀 때마다 부르지만, 잇따른 변경은 묶어서 한 번에 순서대로 보낸다
export function scheduleDraftSave() {
  if (!draftOn || !S.api.live) return
  clearTimeout(timer)
  timer = window.setTimeout(() => { timer = 0; saving = saving.then(saveDraft) }, 300)
}
async function flushDraft() {
  if (timer) { clearTimeout(timer); timer = 0; saving = saving.then(saveDraft) }
  await saving
}
hooks.draft = scheduleDraftSave

// 서명 후 배포: 서버가 version+1 로 서명해 저장한다. 성공하면 서버가 매긴 버전을 돌려준다.
export async function publishToServer(): Promise<string> {
  await flushDraft()
  const r = await post<{ version: number; keyid: string; bundle_sha256: string }>('/policy/publish', { payload: await buildPayload(S.policy) }, draftOn && etag ? { 'If-Match': etag } : {})
  if (S.api.pol) { S.api.pol.keyid = r.keyid; S.api.pol.sha = r.bundle_sha256 }
  S.policy.deployed = fmt(new Date())
  return 'v' + r.version
}

export async function refreshAcks() { await loadAcks(); emit() }
// 서버에 배포한 직후: 새 버전 기준 현황과 기록을 다시 읽는다
export async function afterServerPublish() { await Promise.all([loadAcks(), loadHistory(), loadDraft()]); emit() }

// 예시 데이터 모드의 PC 적용 현황: 40대 중 38대 적용, 2대는 모델이 옛 버전이라 거부
type Acks = NonNullable<NonNullable<typeof S.api.pol>['acks']>
let demo: Acks = { devices: 40, applied: 38, rejected: 2, reject_reasons: { model_mismatch: 2 } }
export const acksNow = (): Acks | null => (S.api.live ? S.api.pol?.acks ?? null : demo)
export const reasonKo = (k: string) => REASON_KO[k] || k

// 예시 데이터에서 배포하면 PC들이 몇 초에 걸쳐 새 정책을 받아 가는 모습을 보여 준다
let sim = 0
export function simulateDemoAcks() {
  clearInterval(sim)
  demo = { devices: 40, applied: 0, rejected: 0, reject_reasons: {} }
  emit()
  sim = window.setInterval(() => {
    const left = 40 - demo.applied - demo.rejected
    if (left <= 0) { clearInterval(sim); return }
    const n = Math.min(left, 3 + Math.floor(Math.random() * 6))
    const rj = demo.rejected < 2 && demo.applied > 20 ? 1 : 0
    demo = { ...demo, applied: demo.applied + n - rj, rejected: demo.rejected + rj, reject_reasons: rj ? { model_mismatch: demo.rejected + rj } : demo.reject_reasons }
    emit()
  }, 450)
}

// 직원 PC 적용 현황 한 줄
export function pcStatus(): string | null {
  const a = acksNow()
  if (!a) return null
  if (!a.devices) return '아직 받은 PC 없음'
  const rj = Object.entries(a.reject_reasons).map(([k, n]) => `${REASON_KO[k] || k} ${n}`).join(', ')
  return `PC ${a.applied}/${a.devices}대 적용` + (a.rejected ? ` · 거부 ${a.rejected}대(${rj})` : '')
}
