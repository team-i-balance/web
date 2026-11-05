// 앱 상태: 도메인 데이터(정책·이벤트·사건)와 화면 상태를 한곳에 두고, 바꾼 뒤 emit() 으로 다시 그린다.
import { useSyncExternalStore } from 'react'
import type { AiEvent, Case, Cause, Conclusion, FpGroup, Method, PolicyChange } from './types'
import { CONCLUSION, GRADE, ME, initialPolicy } from './defaults'
import { fmt, josa, partial } from '../lib/util'

export type Queue = 'req' | 'opt' | 'fp' | 'pol'
export const QUEUE_ORDER: Queue[] = ['req', 'pol', 'fp', 'opt']
export const QUEUE_NAME: Record<Queue, string> = { req: '필수 검토', opt: '선택 검토', fp: '오탐 신고', pol: '재발 방지 배포' }

export type Dialog =
  | { kind: 'close'; caseId: string; onDone?: () => void }
  | { kind: 'exclude'; groupKey: string; onDone?: () => void }
  | { kind: 'publish'; onDone?: () => void }
  | { kind: 'changes' }
  | { kind: 'addDict' }
  | { kind: 'bulk'; ids: string[] }
  | { kind: 'server' }

interface UndoToast { id: number; msg: string; undo?: () => void }


export const S = {
  now: new Date(),
  loaded: Date.now(),
  policy: initialPolicy(),
  events: [] as AiEvent[],
  cases: [] as Case[],
  // 배포 기록: 서버 /policy/history 로 채운다
  history: [
  ] as { version: string; sha?: string; by?: string | null; at: Date; changes: PolicyChange[]; server: boolean }[],
  api: { truncated: false, state: 'connecting' as 'connecting' | 'live' | 'offline' | 'auth', base: null as string | null, live: false, count: 0, stats: null as null | ServerStats, synced: null as Date | null, pol: null as null | ServerPolicy, stale: false },
  ui: {
    sel: null as Queue | null,
    cur: {} as Partial<Record<Queue, string>>,
    lastPub: null as string | null,
    rqTab: 'req' as 'req' | 'opt' | 'closed',
    picked: new Set<string>(),
    fpTab: 'open' as 'open' | 'done',
    dialog: null as Dialog | null,
    toast: null as { id: number; msg: string } | null,
    utoast: null as UndoToast | null,
    view: null as null | { s: number; x: number; y: number; keep?: boolean },
    palette: false,
    help: false,
    fpPicked: new Set<string>(),
  },
}
// 서버 정책 상태: 마지막 배포 번들(/policy/latest)과 서버 탐지가 실제로 쓰는 정책(/policy/current).
// 직원 PC는 정책을 따로 받지 않는다. 입력을 서버(/process)로 검사하므로 서버에 적용된 정책이 곧 직원에게 적용된 정책이다
export interface ServerPolicy { keyid: string | null; sha: string | null
  // active: 활성으로 저장된 버전 · effective: 탐지가 실제로 쓰는 버전(적용 실패면 이전 버전, backend #64) · error: 마지막 적용 실패
  active: { version: number; at: string | null; by?: string | null; effective: number | null; error: { version: number | null; code: string; at: string } | null } | null
  keySet?: boolean } // 서버에 값 해시 키(POLICY_VALUE_HASH_KEY)가 있는지. 없으면 hmac 탐지 제외·오탐 묶음이 작동하지 않는다
export interface ServerStats { total: number; acceptance_rate: number; revert_rate: number; evasion_suspect: number; by_queue: Record<string, number>; by_grade: Record<string, number>; by_action?: Record<string, number>; by_policy_version?: Record<string, number> }

let version = 0
const listeners = new Set<() => void>()
export function emit() { version++; listeners.forEach(l => l()) }
export function useStore() {
  return useSyncExternalStore(l => { listeners.add(l); return () => listeners.delete(l) }, () => version)
}

// ── 조회
export const clock = () => new Date(+S.now + Date.now() - S.loaded)
export const ent = (n: string) => S.policy.entities.find(e => e.name === n)
export const caseById = (id: string) => S.cases.find(c => c.id === id)
export const openOf = (need: 'req' | 'opt') => S.cases.filter(c => c.need === need && c.status === 'open')
export const nextVersion = () => 'v' + (+S.policy.version.slice(1) + 1)
export function ago(d: Date) {
  const m = Math.max(0, Math.round((+clock() - +d) / 6e4))
  return m < 1 ? '방금' : m < 60 ? `${m}분 전` : m < 1440 ? `${Math.round(m / 60)}시간 전` : `${Math.round(m / 1440)}일 전`
}
export function fpGroups(open: boolean): FpGroup[] {
  const g: Record<string, FpGroup> = {}
  S.events.forEach(e => e.items.forEach(it => {
    if (it.reason !== '오탐') return
    if (open !== (it.fp === 'open')) return
    const k = it.type + '|' + it.orig
    ;(g[k] ||= { type: it.type, value: it.orig, refs: [], users: new Set(), fp: it.fp }).refs.push({ e, it })
    g[k].users.add(e.user)
  }))
  return Object.values(g).sort((a, b) => b.refs.length - a.refs.length)
}
export const groupKey = (g: FpGroup) => g.type + '|' + g.value
// 오탐 묶음에서 직원이 쓴 사유 글(같은 글은 한 번)과 이름을 아는 직원 수
export const fpReasons = (g: FpGroup) => [...new Set(g.refs.map(r => (r.e.server as { reason_text?: string | null } | undefined)?.reason_text).filter((x): x is string => !!x))]
export const fpPeople = (g: FpGroup) => [...g.users].filter(u => u !== '직원 미전송').length
// 서버가 주지 않은 값('부서 미전송' 등)은 화면에 쓰지 않는다
export const known = (...xs: (string | null | undefined)[]) => xs.filter(x => x && !/미전송$/.test(x)).join(' · ')
export function metrics(from: Date, to: Date = S.now) {
  const sens = S.events.filter(e => e.grade === 'S' && e.time >= from && e.time < to && e.action !== 'cancel')
  const items = sens.flatMap(e => e.items)
  const byType: Record<string, { n: number; rev: number; fp: number }> = {}
  items.forEach(i => { const b = (byType[i.type] ||= { n: 0, rev: 0, fp: 0 }); b.n++; if (i.status === 'revert' || i.status === 'raw') { b.rev++; if (i.reason === '오탐') b.fp++ } }) // 원문으로 되돌림·원문 그대로 둘 다 원문 전송
  return { n: sens.length, byType }
}
export function boardWork() {
  // 필수 검토는 사유를 기다리는 건도 할 일이다(사유 다시 요청 · 사유 없이 결론)
  return { req: openOf('req').length, pol: S.policy.changes.length, fp: fpGroups(true).length, opt: openOf('opt').length }
}

// ── 알림
let tid = 0
export function toast(msg: string) { S.ui.toast = { id: ++tid, msg }; emit() }
export function undoToast(msg: string, undo?: () => void) { S.ui.utoast = { id: ++tid, msg, undo }; emit() }

// ── 정책 변경 (서명 후 배포 전까지는 초안)
export const change = (what: string, src = '직접 수정') => { S.policy.changes.push({ what, src }); hooks.draft?.() }
export function setEntityOn(i: number, on: boolean) { const e = S.policy.entities[i]; e.on = on; change(`${e.name} 탐지 ${on ? '켬' : '끔'}`); emit() }
export function setEntityGrade(i: number, g: 'O' | 'S' | 'C') {
  const e = S.policy.entities[i], b = e.grade
  e.grade = g; e.method = g === 'S' ? (e.method === '—' ? '대체' : e.method) : '—'
  change(`${e.name} 등급: ${GRADE[b]} → ${GRADE[g]}`); emit()
}
export function setEntityMethod(i: number, m: Method) { const e = S.policy.entities[i], b = e.method; e.method = m; change(`${e.name} 변환 방식: ${b} → ${m}`); emit() }
// 변경 기록은 서버 초안에 저장되고 배포 기록으로도 남으니 단어는 첫·끝 글자만 적는다(평문을 남기지 않음)
const maskWord = (v: string) => (v.startsWith('⟦') ? partial('', v) : v.length <= 2 ? v[0] + '*' : v[0] + '*'.repeat(v.length - 2) + v.slice(-1))
export function deleteDict(i: number) { const d = S.policy.dict.splice(i, 1)[0]; if (!d.draft || !unadd(w => w === `회사 고유 단어 추가: ${maskWord(d.term)} (${d.type})`)) change(`회사 고유 단어 삭제: ${maskWord(d.term)}`); emit() }
export function addDict(term: string, alias: string, type: string) { S.policy.dict.unshift({ term, alias, type, draft: true }); change(`회사 고유 단어 추가: ${maskWord(term)} (${type})`); emit() }
// 아직 배포 안 한 항목을 지우면 '추가' 변경을 거둬들인다(추가·삭제가 함께 배포 목록에 남지 않게)
const unadd = (hit: (what: string) => boolean) => { const C = S.policy.changes, k = C.findIndex(c => hit(c.what)); if (k < 0) return false; C.splice(k, 1); hooks.draft?.(); return true }
export function deleteRule(i: number) { const r = S.policy.learned.splice(i, 1)[0]; if (r.live || !unadd(w => w === `자동 변환 추가: ${r.when} → ${r.type} ${r.method}`)) change(`자동 변환 삭제: ${r.when} → ${r.type} ${r.method}`, r.from); emit() }
export function deleteExclude(i: number) { const d = S.policy.exclude.splice(i, 1)[0]; if (!d.draft || !unadd(w => w.startsWith('탐지 제외 추가: "') && w.endsWith(` (${d.why})`))) change(`탐지 제외 삭제: "${partial('', d.term)}"`); emit() }
export function setMeta(k: string, v: boolean) { S.policy.meta[k] = v; change(`파일 사본: ${k} ${v ? '제거' : '유지'}`); emit() }
export function publish(nv = nextVersion(), msg = `서명 후 배포했어요 · ${nv}`) {
  const P = S.policy
  P.learned.forEach(r => { if (!r.live) { r.live = true; r.at = clock(); r.fresh = true } })
  P.dict.forEach(d => delete d.draft); P.exclude.forEach(d => delete d.draft)
  S.history.push({ version: nv, at: clock(), changes: [...P.changes], server: S.api.live })
  P.version = nv; P.deployed = fmt(clock()); P.changes = []
  toast(msg)
}

// ── 사건 처리
// 서버 모드에서 판단을 저장하는 고리(api/cases.ts 가 채운다). 화면 상태를 바꾼 뒤 부른다.
// reopen 의 undo=true 는 '방금 내가 한 판단 되돌리기'(내 종결이 서버에 저장됐을 때만 다시 연다)
export const hooks: { close?: (c: Case) => void; closeMany?: (cs: Case[]) => void; reopen?: (c: Case, undo?: boolean) => void; draft?: () => void
  fpDecide?: (g: FpGroup, d: 'keep' | 'exclude', why?: string) => void; fpUndo?: (g: FpGroup) => void } = {}
const log = (c: Case, what: string, quote?: string | null) => c.timeline.push({ t: clock(), who: ME, cls: 'me', what, quote })
export function closeCase(c: Case, res: { k: Conclusion; cause: Cause | null; memo: string; rule: string | null }, sync = true) {
  c.status = 'closed'; c.close = { ...res, by: ME, at: clock() }
  log(c, `종결 · ${CONCLUSION[res.k][0]}${res.rule ? ' · 자동 변환 등록' : ''}`, res.memo && res.memo !== '사유 확인' ? res.memo : null)
  if (sync) hooks.close?.(c)
}
export function suggestRule(c: Case, type?: string) {
  const leaked = c.items.filter(i => i.status !== 'conv'), it = (type && c.items.find(i => i.type === type)) || leaked.find(i => i.reason === '업무상 필요') || leaked[0] || c.items[0]
  const ty = it.type, cur = ent(ty)?.method ?? '대체'
  const method: Method = ty === '이름' && cur === '대체' ? '태그' : (({ 태그: '대체', 대체: '일반화', 일반화: '대체', 삭제: '태그' } as Record<string, Method>)[cur] || '대체')
  const when = ty === '프로젝트 코드명' ? `"${it.orig}"${josa(it.orig, '이', '가').slice(it.orig.length)} 포함된 입력` : `${josa(ty, '이', '가')} 포함된 ${c.file ? '파일' : '입력'}`
  return { item: it, type: ty, method, when, current: cur }
}
// 서버 SLM 은 규칙 label(=항목 이름)이 겹치거나 고정 라벨과 같으면 정책 전체를 적용하지 못한다(backend slm/__init__.py).
// 그래서 같은 항목 규칙은 하나만 두고, 고정 라벨과 같은 이름은 규칙으로 만들지 않는다
export const RESERVED_RULE = new Set(['사람 이름', '주소', '개인 민감정보'])
export function addRule(c: Case, type: string, when: string, method: Method): string | null {
  if (RESERVED_RULE.has(type)) return null
  const same = S.policy.learned.find(r => r.type === type)
  if (same) return `${same.when} → ${same.type} ${same.method}`
  const rule = `${when} → ${type} ${method}`
  S.policy.learned.push({ type, when, method, from: c.id, hits: 0, live: false })
  change(`자동 변환 추가: ${rule}`, c.id)
  return rule
}
// 한 번 클릭 판단. 되돌리기에 쓸 수 있게 이전 상태 크기를 돌려준다.
export function quickClose(c: Case, k: Conclusion | 'ok') {
  const nL = S.policy.learned.length, nC = S.policy.changes.length
  if (k === 'ok') closeCase(c, { k: 'legit', cause: null, memo: '사유 확인', rule: null })
  else {
    let rule: string | null = null
    if (k === 'legit') { const s = suggestRule(c); rule = addRule(c, s.type, s.when, s.method) }
    closeCase(c, { k, cause: k === 'legit' ? 'fit' : null, /* 빠른 판단에서는 원인을 고르지 않았으니 남기지 않는다 */ memo: { violation: '사유 확인 — 위반', legit: '사유 확인 — 업무상 필요', fp: '개인정보 아님' }[k], rule })
  }
  const label = { violation: '위반', legit: '정당한 사용 · 규칙 추가', fp: '오탐', ok: '문제 없음' }[k]
  const ruled = S.policy.learned.length > nL
  undoToast(`${c.user} · ${label}${ruled ? ' · 규칙 추가돼 배포 대기' : ''}`, () => {
    c.status = 'open'; c.close = null; c.timeline.pop(); S.policy.learned.length = nL; S.policy.changes.length = nC
    hooks.reopen?.(c, true); if (ruled) hooks.draft?.()
    S.ui.sel = c.need === 'opt' ? 'opt' : 'req'; S.ui.cur[S.ui.sel] = c.id
  })
}
export function reopen(c: Case) { c.status = 'open'; c.close = null; log(c, '다시 열기'); hooks.reopen?.(c); emit() }
export function fpKeep(g: FpGroup) {
  g.refs.forEach(r => (r.it.fp = 'keep'))
  hooks.fpDecide?.(g, 'keep')
  undoToast(`${partial(g.type, g.value)} · 탐지 결과 유지`, () => { g.refs.forEach(r => (r.it.fp = 'open')); hooks.fpUndo?.(g) })
}
export function fpExclude(g: FpGroup, why: string) {
  S.policy.exclude.unshift({ term: g.value, why, from: `오탐 신고 ${g.refs.length}회`, draft: true })
  change(`탐지 제외 추가: "${partial(g.type, g.value)}" (${why})`, '오탐 신고')
  g.refs.forEach(r => (r.it.fp = 'exclude'))
  hooks.fpDecide?.(g, 'exclude', why)
  toast('정책 초안에 추가했어요 · 서명 후 배포하면 적용돼요')
}

// 지금 칸을 다 처리했으면 다음 할 일 칸으로 넘어가고, 되돌리기 알림에 덧붙인다.
export function advanceBoard() {
  const w = boardWork(), sel = S.ui.sel
  if (sel && !w[sel] && !(sel === 'pol' && S.ui.lastPub)) {
    const nx = QUEUE_ORDER.find(k => w[k])
    if (nx) { S.ui.sel = nx; if (S.ui.utoast) S.ui.utoast = { ...S.ui.utoast, msg: `${S.ui.utoast.msg} · ${QUEUE_NAME[sel]} 끝, 다음은 ${QUEUE_NAME[nx]}` } }
  }
  emit()
}
