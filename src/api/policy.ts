// 변환 정책 배포 (team-i-balance/backend /policy)
// 서명·버전 번호는 서버가 매긴다. 콘솔은 payload(docs/BUNDLE-SPEC.md 3절)만 보낸다.
import { initialPolicy } from '../domain/defaults'
import type { Policy } from '../domain/types'
import { S, ent, emit, hooks, toast } from '../domain/store'
import { fmt } from '../lib/util'
import { get, post } from './client'

const ORG = 'acme' // 백엔드 POLICY_ORG 기본값
const THRESHOLDS = { confidential: 0.45, personal: 0.35, high_confidence: 0.7 }
const REASON_KO: Record<string, string> = { bad_type: '형식 오류', bad_signature: '서명 불일치', unsupported_schema: '모르는 형식', wrong_org: '다른 조직', rollback: '이전 버전', expired: '만료', model_mismatch: '모델 불일치', compile_failed: '서버가 정책을 적용하지 못함(규칙 이름이 겹치는 등)' }

interface Envelope { payloadType: string; payload: string; signatures: { keyid: string; sig: string }[] }
interface Payload { version: number; types?: Record<string, { on?: boolean; grade?: 'O' | 'S' | 'C'; method?: string }>; dict?: { h: string; type?: string }[]; exclude?: { h: string }[]; rules?: { id: string; label: string; description: string; grade: string; action: string }[] }

async function sha256(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return 'sha256:' + [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('')
}

// 회사 고유 단어 종류 → 서버가 쓸 등급(S: 사내정보 · C: 기밀)
export const DICT_TYPES: Record<string, { on: boolean; grade: 'S' | 'C'; method: string }> = { '프로젝트 코드명': { on: true, grade: 'S', method: '대체' }, '미공개 실적': { on: true, grade: 'C', method: '—' } }

// 회사 고유 단어·탐지 제외 값은 평문 대신 해시로 보낸다
export async function buildPayload(P: Policy) {
  return {
    schema: 1, org: ORG, thresholds: THRESHOLDS,
    rules: P.learned.map((r, i) => ({ id: `r-${i + 1}`, label: r.type.slice(0, 15), description: r.when.slice(0, 40), grade: ent(r.type)?.grade === 'C' ? 'C' : 'S', action: r.method })),
    // 회사 고유 단어의 종류도 types 에 둔다. 서버는 그 grade 로 기밀(C)·사내정보를 고른다(policy_apply.py)
    types: { ...DICT_TYPES, ...Object.fromEntries(P.entities.map(e => [e.name, { on: e.on, grade: e.grade, method: e.method }])) },
    // 함께 잡을 표현도 단어마다 해시로 넣어야 서버가 잡는다
    dict: (await Promise.all(P.dict.map(async d => d.term.startsWith('⟦h=') ? [{ h: d.term.slice(3, -1), type: d.type }]
      : Promise.all([d.term, ...(d.alias || '').split(',').map(x => x.trim()).filter(Boolean)].map(async t => ({ h: await sha256(t), type: d.type })))))).flat(),
    // 서버 이벤트에서 온 값은 평문이 없으므로 서버가 준 값 해시(HMAC, #21)를 그대로 보낸다
    exclude: await Promise.all(P.exclude.map(async x => (x.term.startsWith('⟦h=') ? { h: x.term.slice(3, -1) } : x.term.startsWith('⟦=') ? { h: 'hmac:' + x.term.slice(x.term.indexOf('#') + 1, -1) } : { h: await sha256(x.term) }))),
  }
}

const decode = (b64: string): Payload => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0))))

// 서버 탐지가 지금 쓰는 정책(/policy/current). 콘솔의 배포(/policy/publish)는 저장만 하므로 /policy/deploy 로 적용해야 바뀐다
export async function loadActive(ok?: () => boolean) {
  try {
    const r = await get<{ active: boolean; version: number | null; activated_at: string | null; activated_by?: string | null; effective_version?: number | null; last_apply_error?: { version: number | null; code: string; at: string } | null; value_hash_key_set?: boolean }>('/policy/current')
    if (ok && !ok()) return
    if (!S.api.pol) return
    S.api.pol.active = r.active && r.version != null ? { version: r.version, at: r.activated_at, by: r.activated_by, effective: r.effective_version ?? r.version, error: r.last_apply_error ?? null } : null
    S.api.pol.keySet = r.value_hash_key_set
  } catch { if (S.api.pol && (!ok || ok())) S.api.pol.active = null }
}
// 저장된 버전 n 을 서버 탐지에 적용한다. 성공하면 null, 거절되면 사유 코드
export async function applyOnServer(n: number): Promise<string | null> {
  const env = await get<Envelope>(`/policy/${n}`, 5000)
  const r = await post<{ accepted: boolean; reason: string }>('/policy/deploy', { bundle: env })
  // 거절 사유는 서버에 남지 않으니 이 화면에 기억해 둔다(배포 화면 안내에 보임)
  lastReject = r.accepted ? null : { version: n, reason: r.reason }
  await loadActive(); emit()
  return r.accepted ? null : r.reason
}
export let lastReject: { version: number; reason: string } | null = null

// 배포 기록(/policy/history). 이 브라우저에서 배포한 버전은 무엇이 바뀌었는지까지 남겨 둔 것을 쓴다
interface HistoryItem { version: number; sha256: string; stored_at: string | null; rule_count: number; published_by?: string | null }
export let historyFromServer = false
export async function loadHistory(ok?: () => boolean) {
  try {
    const items = await get<HistoryItem[]>('/policy/history')
    if (ok && !ok()) return
    const local = new Map(S.history.filter(h => h.server).map(h => [h.version, h]))
    S.history = items.sort((a, b) => a.version - b.version).map(h => {
      const v = 'v' + h.version, l = local.get(v)
      return { version: v, sha: h.sha256, by: h.published_by, at: h.stored_at ? new Date(h.stored_at) : l?.at ?? new Date(0), changes: l?.changes ?? [{ what: `자동 변환 규칙 ${h.rule_count}개 · 바뀐 내용은 '이 버전 내용 보기'에서`, src: '' }], server: true }
    })
    const last = items.find(h => 'v' + h.version === S.policy.version)
    if (last?.stored_at) S.policy.deployed = fmt(new Date(last.stored_at))
    historyFromServer = true
  } catch { if (!ok || ok()) historyFromServer = false }
}

// 버전 하나의 내용(/policy/{n})과 바로 앞 버전 대비 바뀐 점. 값은 해시라 단어·제외 값은 개수만 보여 준다.
export interface VersionView { compared: boolean; keyid: string | null; rules: { label: string; description: string; action: string }[]; on: number; off: string[]; dict: number; exclude: number; changed: string[] }
const vcache = new Map<number, Envelope>()
async function envelope(n: number) { let e = vcache.get(n); if (!e) { e = await get<Envelope>(`/policy/${n}`, 5000); vcache.set(n, e) } return e }
export async function loadVersion(n: number): Promise<VersionView> {
  const env = await envelope(n), p = decode(env.payload)
  const prev = n > 1 ? await envelope(n - 1).then(e => decode(e.payload), () => null) : null
  const types = Object.entries(p.types || {}), changed: string[] = []
  if (prev) {
    const pt = prev.types || {}
    for (const [k, t] of types) {
      const o = pt[k]; if (!o) { changed.push(`${k} 추가`); continue }
      if (!!o.on !== !!t.on) changed.push(`${k} 탐지 ${t.on ? '켬' : '끔'}`)
      if (o.grade !== t.grade) changed.push(`${k} 등급 ${o.grade} → ${t.grade}`)
      if (o.method !== t.method) changed.push(`${k} ${o.method} → ${t.method}`)
    }
    const key = (r: { label: string; description: string; action: string }) => `${r.description} → ${r.label} ${r.action}`
    const pr = new Set((prev.rules || []).map(key)), cr = new Set((p.rules || []).map(key))
    cr.forEach(r => { if (!pr.has(r)) changed.push(`자동 변환 추가: ${r}`) }); pr.forEach(r => { if (!cr.has(r)) changed.push(`자동 변환 삭제: ${r}`) })
    const diff = (a: { h: string }[] = [], b: { h: string }[] = [], what: string) => {
      const A = new Set(a.map(x => x.h)), B = new Set(b.map(x => x.h)), add = [...B].filter(h => !A.has(h)).length, del = [...A].filter(h => !B.has(h)).length
      if (add) changed.push(`${what} ${add}개 추가`); if (del) changed.push(`${what} ${del}개 삭제`)
    }
    diff(prev.dict, p.dict, '회사 고유 단어'); diff(prev.exclude, p.exclude, '탐지 제외')
  }
  return { compared: n === 1 || !!prev, keyid: env.signatures[0]?.keyid ?? null, rules: p.rules || [], on: types.filter(([, t]) => t.on !== false).length, off: types.filter(([, t]) => t.on === false).map(([k]) => k), dict: p.dict?.length ?? 0, exclude: p.exclude?.length ?? 0, changed }
}

// 서버의 최신 배포본을 콘솔 정책에 반영한다. 아직 배포가 없으면 v0(규칙 없음)부터.
// 받기(fetchLatest)와 반영(applyBundle)을 나눠, 실시간 갱신이 다 받은 뒤 한 번에 반영할 수 있게 한다
async function fetchLatest(): Promise<Envelope | null> {
  try { return await get<Envelope>('/policy/latest') } catch (e) { if ((e as Error).message !== '404') throw e; return null }
}
function applyBundle(env: Envelope | null) {
  S.api.pol = { keyid: null, sha: null, active: null }
  const P = S.policy
  if (env) {
    const p = decode(env.payload)
    P.version = 'v' + p.version
    P.learned = (p.rules || []).map(r => ({ type: r.label, when: r.description, method: r.action as Policy['learned'][number]['method'], from: '서버', hits: 0, live: true }))
    // 배포본에는 고유 단어·제외 값이 해시로만 있다. 해시를 그대로 들고 있다가 다시 배포할 때 보낸다
    P.dict = (p.dict || []).map(d => ({ term: `⟦h=${d.h}⟧`, alias: '', type: d.type || '프로젝트 코드명' }))
    P.exclude = (p.exclude || []).map(x => ({ term: `⟦h=${x.h}⟧`, why: '', from: '서버 배포본' }))
    Object.entries(p.types || {}).forEach(([name, t]) => {
      const e = ent(name); if (!e) return
      if (typeof t.on === 'boolean') e.on = t.on
      if (t.grade) e.grade = t.grade
      if (t.method) e.method = t.method as Policy['entities'][number]['method']
    })
    S.api.pol.keyid = env.signatures[0]?.keyid ?? null
  } else { P.version = 'v0'; P.learned = []; P.dict = []; P.exclude = [] }
  P.deployed = ''; P.changes = []
  S.history = []
}
export async function loadPolicy() {
  applyBundle(await fetchLatest())
  await Promise.all([loadActive(), loadHistory(), loadDraft()])
  markExcluded()
}
// 실시간 갱신: 다른 보안팀원이 새 버전을 배포했을 때. 배포본·초안을 다 받은 뒤 ok() 일 때만(재연결·내 편집이 없을 때) 반영한다
export async function reloadPolicy(ok: () => boolean): Promise<boolean> {
  const [env, d] = await Promise.all([fetchLatest(), get<DraftOut>('/policy/draft', 5000)])
  if (!ok()) return false
  applyBundle(env); applyDraft(d); draftOn = true
  await Promise.all([loadActive(ok), loadHistory(ok)])
  markExcluded()
  return true
}

// 탐지 제외한 값(정책·초안의 hmac 해시)과 같은 오탐 신고는 '제외함'으로 둔다. 서버에 오탐 판단 기록이 없어서 정책으로 되살린다
const exHash = (t: string) => (t.startsWith('⟦h=hmac:') ? t.slice(8, -1) : t.startsWith('⟦=') ? t.slice(t.indexOf('#') + 1, -1) : null)
// 배포된 정책의 탐지 제외 값 해시(초안 제외)
export const publishedExcludes = () => new Set(S.policy.exclude.filter(x => !x.draft).map(x => exHash(x.term)).filter((h): h is string => !!h).map(h => h.toLowerCase()))
export function markExcluded() {
  const hashOf = exHash
  const ex = new Set(S.policy.exclude.map(x => hashOf(x.term)).filter(Boolean))
  if (!ex.size) return
  S.events.forEach(e => e.items.forEach(it => { if (it.fp === 'open' && ex.has(hashOf(it.orig))) it.fp = 'exclude' }))
}

// ── 정책 초안 (/policy/draft, 백엔드 docs/policy-draft-api.md)
// 고칠 때마다 서버 초안에 저장해 새로고침·다른 보안팀원과 공유한다. 화면을 되살리는 데 필요한 평문(고유 단어·제외 값)은
// 초안의 console_state 칸에만 두고, payload 에는 해시만 담는다(평문은 배포본에 들어가지 않는다).
// console_state: 서버가 서명하지 않는 화면 복원 칸(#46). 예전 초안은 payload.console 에 있었다
interface DraftOut { payload: (Record<string, unknown> & { console?: ConsoleState }) | null; console_state?: ConsoleState | null; changes: { what: string; src: string; by?: string | null }[]; has_draft: boolean; etag: string }
interface ConsoleState { entities: Policy['entities']; learned: Policy['learned']; dict: Policy['dict']; exclude: Policy['exclude']; meta: Policy['meta'] }
let etag: string | null = null, timer = 0, saving: Promise<void> = Promise.resolve(), saves = 0, edits = 0
export let draftOn = false

function applyDraft(d: DraftOut) {
  etag = d.etag
  // 배포한 뒤에도 서버가 console_state 를 남기므로 초안이 없어도 화면을 되살린다
  const c = d.console_state ?? d.payload?.console
  if (!c?.entities) return
  const P = S.policy
  // 탐지 항목은 서버 탐지기에 있는 것만. 예전에 저장된 가상 항목(나이·고객ID 등)은 버리고, 빠진 항목은 기본값으로 채운다
  const base = initialPolicy().entities
  P.entities = base.map(b => ({ ...b, ...c.entities.find(e => e.name === b.name), sample: b.sample }))
  P.learned = c.learned; P.dict = c.dict; P.exclude = c.exclude; P.meta = c.meta
  P.changes = d.has_draft ? d.changes.map(x => ({ what: x.what, src: x.src, by: x.by })) : []
  // 초안이 없으면(배포 뒤) 저장해 둔 규칙·단어는 이미 배포된 것이다
  if (!d.has_draft) { P.learned.forEach(r => (r.live = true)); P.dict.forEach(x => delete x.draft); P.exclude.forEach(x => delete x.draft) }
}
export async function loadDraft() {
  try { applyDraft(await get<DraftOut>('/policy/draft', 5000)); draftOn = true } catch { draftOn = false }
}
// 실시간 갱신용: 내가 마지막으로 받은 초안 ETag, 아직 보내지 않았거나 보내는 중인 초안이 있는지, 화면에서 고친 횟수
export const draftEtag = () => etag
export const draftBusy = () => !!timer || saves > 0
export const draftEdits = () => edits
// 다른 보안팀원이 고친 초안을 받는다. 실패하면 던진다(초안 저장을 끄지 않고 다음 확인 때 다시)
export async function refreshDraft(ok: () => boolean): Promise<boolean> {
  const d = await get<DraftOut>('/policy/draft', 5000)
  if (!ok()) return false
  applyDraft(d); draftOn = true
  return true
}
let conflicted = false
async function saveDraft() {
  if (!draftOn || !S.api.live) return
  const P = S.policy
  const console: ConsoleState = { entities: P.entities, learned: P.learned, dict: P.dict, exclude: P.exclude, meta: P.meta }
  try {
    const d = await post<DraftOut>('/policy/draft', { payload: await buildPayload(P), console_state: console, changes: P.changes.slice(-500).map(c => ({ what: c.what.slice(0, 2000), src: (c.src || '직접 수정').slice(0, 128) })) },
      etag ? { 'If-Match': etag } : {}, 'PUT')
    etag = d.etag
  } catch (e) {
    const m = (e as Error).message
    if (/CONFLICT|PRECONDITION|409|428/.test(m)) { conflicted = true; await loadDraft(); emit(); toast('다른 보안팀원이 정책 초안을 먼저 바꿨어요 · 최신 초안을 불러왔으니 확인해 주세요') }
    else toast(`정책 초안을 서버에 저장하지 못했어요 (${m})`)
  }
}
// 바꿀 때마다 부르지만, 잇따른 변경은 묶어서 한 번에 순서대로 보낸다
export function scheduleDraftSave() {
  edits++
  if (!draftOn || !S.api.live) return
  clearTimeout(timer)
  timer = window.setTimeout(() => { timer = 0; saves++; saving = saving.then(saveDraft).finally(() => { saves-- }) }, 300)
}
async function flushDraft() {
  conflicted = false
  if (timer) { clearTimeout(timer); timer = 0; saves++; saving = saving.then(saveDraft).finally(() => { saves-- }) }
  await saving
  return !conflicted
}
hooks.draft = scheduleDraftSave

// 서명 후 배포: 서버가 version+1 로 서명해 저장한다. 성공하면 서버가 매긴 버전을 돌려준다.
export async function publishToServer(): Promise<string> {
  // 저장하다 다른 사람 초안과 부딪혔으면, 확인하지 않은 초안을 배포하지 않는다
  if (!(await flushDraft())) throw new Error('다른 보안팀원이 바꾼 초안을 불러왔어요. 내용을 확인한 뒤 다시 배포해 주세요')
  const r = await post<{ version: number; keyid: string; bundle_sha256: string }>('/policy/publish', { payload: await buildPayload(S.policy) }, draftOn && etag ? { 'If-Match': etag } : {})
  if (S.api.pol) { S.api.pol.keyid = r.keyid; S.api.pol.sha = r.bundle_sha256 }
  S.policy.deployed = fmt(new Date())
  return 'v' + r.version
}

export async function refreshActive() { await loadActive(); emit() }
// 서버에 배포한 직후: 새 버전 기준 현황과 기록을 다시 읽는다
export async function afterServerPublish() {
  await Promise.all([loadActive(), loadHistory(), loadDraft()])
  markExcluded(); emit()
}

export const reasonKo = (k: string) => REASON_KO[k] || k


// 서버 적용 상태 한 줄(배포한 최신 버전이 서버 탐지에 쓰이고 있는지)
export function serverStatus(): string | null {
  if (!S.api.live) return null
  const a = S.api.pol?.active, latest = +S.policy.version.slice(1) || 0
  if (!latest) return null
  if (!a) return '서버에 적용 안 됨'
  // 저장은 됐어도 서버가 컴파일하지 못하면 이전 버전으로 탐지한다
  if (a.effective !== a.version) return a.effective ? `적용 실패 · 서버는 v${a.effective} 사용 중` : '적용 실패 · 정책 없이 탐지 중'
  return a.version === latest ? '서버 적용 중' : `서버는 v${a.version} 사용 중`
}
// 최신 배포 버전을 서버에 적용(배포 때 적용이 실패했거나, 이 기능 전에 배포해 저장만 된 버전)
export async function applyLatest() {
  const v = S.policy.version
  try {
    const no = await applyOnServer(+v.slice(1))
    toast(no ? `${v}를 서버에 적용하지 못했어요 (${reasonKo(no)})` : `${v}를 서버 탐지에 적용했어요`)
  } catch (e) { toast(`${v}를 서버에 적용하지 못했어요 (${(e as Error).message})`) }
}
export const serverBehind = () => { const a = S.api.pol?.active, n = +S.policy.version.slice(1); return S.api.live && n > 0 && (a?.version !== n || a.effective !== n) }
