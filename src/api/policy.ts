// 변환 정책 배포 (team-i-balance/backend /policy)
// 서명·버전 번호는 서버가 매긴다. 콘솔은 payload(docs/BUNDLE-SPEC.md 3절)만 보낸다.
import type { Policy } from '../domain/types'
import { S, ent, emit } from '../domain/store'
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
    types: Object.fromEntries(P.entities.map(e => [e.name, { on: e.on }])),
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
  await Promise.all([loadAcks(), loadHistory()])
}

// 서명 후 배포: 서버가 version+1 로 서명해 저장한다. 성공하면 서버가 매긴 버전을 돌려준다.
export async function publishToServer(): Promise<string> {
  const r = await post<{ version: number; keyid: string; bundle_sha256: string }>('/policy/publish', { payload: await buildPayload(S.policy) }, )
  if (S.api.pol) { S.api.pol.keyid = r.keyid; S.api.pol.sha = r.bundle_sha256 }
  S.policy.deployed = fmt(new Date())
  return 'v' + r.version
}

export async function refreshAcks() { await loadAcks(); emit() }
// 서버에 배포한 직후: 새 버전 기준 현황과 기록을 다시 읽는다
export async function afterServerPublish() { await Promise.all([loadAcks(), loadHistory()]); emit() }

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
