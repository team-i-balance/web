// 대화상자: 결론 내기 · 탐지 제외(오른쪽 패널) · 서명 후 배포 · 변경 내용 · 고유 단어 추가 · 일괄 종결 · 서버
import { useState, type ReactNode } from 'react'
import { TriangleAlert } from 'lucide-react'
import { S, emit, useStore, caseById, closeCase, addRule, suggestRule, change, fpGroups, groupKey, fpExclude, publish, nextVersion, addDict, ent, toast, type Dialog } from '../domain/store'
import { CAUSES, CONCLUSION, METHODS } from '../domain/seed'
import type { Cause, Conclusion, Method } from '../domain/types'
import { convert, fmt, partial } from '../lib/util'
import { QUEUE_KO, connect, post } from '../api/client'
import { afterServerPublish, publishToServer, simulateDemoAcks } from '../api/policy'
import { Button, Checkbox, Field, Input, KV, Select, Tag, TextArea, ds } from '../ds'
import { Modal } from '../ds/Overlay'
import f from './dialogs.module.css'

export const PERSONAL = ['이름', '주민등록번호', '카드번호', '계좌번호', '전화번호', '이메일', '주소', '생년월일']
export const closeDialog = () => { S.ui.dialog = null; emit() }
export const openDialog = (d: Dialog) => { S.ui.dialog = d; emit() }

const Note = ({ warn, children }: { warn?: boolean; children: ReactNode }) => <div className={warn ? f.warn : f.note}>{warn && <TriangleAlert size={15} />}<div>{children}</div></div>
const Foot = ({ ok, onOk, busy, okLabel }: { ok: string; onOk: () => void; busy?: boolean; okLabel?: string }) => <>
  <Button variant="ghost" onClick={closeDialog}>취소</Button>
  <Button variant="primary" onClick={onOk} disabled={busy}>{busy ? okLabel : ok}</Button>
</>

function CloseCase({ caseId, onDone }: { caseId: string; onDone?: () => void }) {
  const c = caseById(caseId)!
  const leaked = c.items.filter(i => i.status !== 'conv')
  const types = [...new Set(leaked.map(i => i.type))]
  const s0 = suggestRule(c)
  const demo = S.ui.guide >= 0
  const [k, setK] = useState<Conclusion>(c.need === 'opt' ? 'legit' : 'violation')
  const [cause, setCause] = useState<Cause>(c.need === 'opt' || demo ? 'fit' : 'care')
  const [mk, setMk] = useState(true)
  const [type, setType] = useState(s0.type)
  const sug = suggestRule(c, type)
  const [when, setWhen] = useState<string | null>(null)
  const [method, setMethod] = useState<Method>(s0.method)
  const [ex, setEx] = useState(false)
  const [exi, setExi] = useState(0)
  const [memo, setMemo] = useState(demo ? '사유 확인 — 변환본이 거래처 업무에 맞지 않아 원문을 보냄. 고의성 없음, 같은 입력은 자동 변환으로 막음' : '')
  const [err, setErr] = useState(false)
  const ruleable = k !== 'fp' && !!CAUSES[cause].rule
  const src = c.items.find(i => i.type === type) || sug.item
  const w = (when ?? sug.when)
  const ok = () => {
    if (!memo.trim()) { setErr(true); return }
    let rule: string | null = null
    if (ruleable && mk) rule = addRule(c, type, w.trim(), method)
    if (k === 'fp' && ex) {
      const it = leaked[exi]
      S.policy.exclude.unshift({ term: it.orig, why: '위반 검토에서 탐지 오류로 확인', from: c.id, draft: true })
      change(`탐지 제외 추가: ${it.type} "${partial(it.type, it.orig)}"`, c.id)
    }
    closeCase(c, { k, cause: k === 'fp' ? null : cause, memo: memo.trim(), rule })
    S.ui.dialog = null
    toast(rule || (k === 'fp' && ex) ? '종결했어요 · 서명 후 배포하면 적용돼요' : '종결했어요')
    onDone?.()
  }
  return (
    <Modal open onClose={closeDialog} title={c.reason ? '결론 내기' : '사유 없이 결론 내기'} desc={`${c.user} · ${c.dept} · ${leaked.map(i => i.type).join(', ')} → ${c.ev.ai}`} foot={<Foot ok="종결하기" onOk={ok} />} wide>
      {c.reason ? <blockquote className={f.quote}>{c.reason.text}</blockquote> : <Note warn>직원 사유가 아직 없어요</Note>}
      <div className={f.group} role="radiogroup" aria-label="결론">
        {(Object.entries(CONCLUSION) as [Conclusion, [string, string]][]).map(([key, [t, d]]) => (
          <label key={key} className={f.radio} data-on={k === key || undefined}>
            <input type="radio" name="k" checked={k === key} onChange={() => setK(key)} /><span><b>{t}</b><small>{d}</small></span>
          </label>
        ))}
      </div>
      {k !== 'fp' && <Field label="원인" htmlFor="cause"><Select id="cause" value={cause} onChange={e => setCause(e.target.value as Cause)}>
        {(Object.entries(CAUSES) as [Cause, { t: string }][]).map(([key, v]) => <option key={key} value={key}>{v.t}</option>)}
      </Select></Field>}
      {ruleable && <div className={f.box}>
        <label className={f.checkRow}><Checkbox checked={mk} onChange={setMk} label="재발 방지 규칙 만들기" /><b>재발 방지 — 같은 입력은 다음부터 자동 변환</b></label>
        {mk && <div className={f.grid}>
          <Field label="항목" htmlFor="rtype"><Select id="rtype" value={type} onChange={e => { setType(e.target.value); setMethod(suggestRule(c, e.target.value).method) }}>{types.map(t => <option key={t}>{t}</option>)}</Select></Field>
          <Field label="이렇게 바꿔요" htmlFor="rmethod"><Select id="rmethod" value={method} onChange={e => setMethod(e.target.value as Method)}>{METHODS.map(m => <option key={m}>{m}</option>)}</Select></Field>
          <div className={f.span}><Field label="이런 경우에" htmlFor="rwhen" count={w.length} max={40}><Input id="rwhen" value={w} onChange={e => setWhen(e.target.value)} /></Field></div>
          <div className={f.span + ' ' + f.preview}>{partial(type, src.orig)} → <b>{convert(type, src.orig, method) || '(삭제)'}</b></div>
          {method === (ent(type)?.method ?? '') && <div className={f.span}><Note warn>지금 기본 방식과 같아서 바뀌는 게 없어요</Note></div>}
        </div>}
      </div>}
      {k !== 'fp' && !CAUSES[cause].rule && <Note>이 원인은 자동 변환으로 막을 수 없어요. 결론과 판단 근거만 남겨요.</Note>}
      {k === 'fp' && <div className={f.box}>
        <label className={f.checkRow}><Checkbox checked={ex} onChange={setEx} label="탐지 제외에 추가" /><b>잘못 잡힌 값을 탐지 제외에 추가</b></label>
        {ex && <><Select value={exi} onChange={e => setExi(+e.target.value)} aria-label="제외할 값">{leaked.map((i, n) => <option key={n} value={n}>{i.type} · {partial(i.type, i.orig)}</option>)}</Select>
          {PERSONAL.includes(leaked[exi]?.type) && <Note warn>공개된 값일 때만 제외하세요</Note>}</>}
      </div>}
      <Field label="판단 근거" htmlFor="memo" error={err && '판단 근거를 적어 주세요'}>
        <TextArea id="memo" value={memo} aria-invalid={err} onChange={e => { setMemo(e.target.value); setErr(false) }} />
      </Field>
    </Modal>
  )
}

// 탐지 제외: 근거와 효과를 보고 정하도록 오른쪽 패널로 연다
function Exclude({ groupKey: key, onDone }: { groupKey: string; onDone?: () => void }) {
  const g = fpGroups(true).find(x => groupKey(x) === key)
  const [why, setWhy] = useState('')
  const [err, setErr] = useState(false)
  if (!g) return null
  const wk = new Date(+S.now - 7 * 864e5), less = g.refs.filter(r => r.e.time >= wk).length
  const ok = () => { if (!why.trim()) { setErr(true); return } fpExclude(g, why.trim()); S.ui.dialog = null; onDone?.(); emit() }
  return (
    <Modal open sheet onClose={closeDialog} title="탐지 제외" desc="정책 초안에 추가돼요. 서명 후 배포하면 직원 PC에 적용돼요." foot={<Foot ok="초안에 추가하기" onOk={ok} />}>
      <div className={f.valueCard}><span className={f.mut}>{g.type}</span><b className={f.big}>{partial(g.type, g.value)}</b></div>
      <KV rows={[['범위', '정확히 이 값만'], ['근거', `오탐 신고 ${g.refs.length}회 · 직원 ${g.users.size}명`], ['효과', `최근 7일 기준 ${less}건이 덜 잡혀요`]]} />
      {PERSONAL.includes(g.type) && <Note warn>{g.type}은 개인정보예요. 회사 대표번호처럼 공개된 값일 때만 제외하세요.</Note>}
      <Field label="제외 사유" htmlFor="why" error={err && '제외 사유를 적어 주세요'}>
        <Input id="why" autoFocus placeholder="예: 회사 대표번호 (홈페이지 공개)" value={why} aria-invalid={err} onChange={e => { setWhy(e.target.value); setErr(false) }} onKeyDown={e => { if (e.key === 'Enter') ok() }} />
      </Field>
    </Modal>
  )
}

export const ChangeList = () => <ul className={f.changes}>{S.policy.changes.map((c, i) => <li key={i}><span>{c.what}</span><em>{c.src}</em></li>)}</ul>

function Bulk({ ids }: { ids: string[] }) {
  const [memo, setMemo] = useState('사유 확인 — 업무 범위 내 사용')
  const ok = () => { ids.forEach(id => { const c = caseById(id); if (c) closeCase(c, { k: 'legit', cause: null, memo, rule: null }) }); S.ui.picked.clear(); S.ui.dialog = null; toast(`${ids.length}건을 종결했어요`) }
  return (
    <Modal open onClose={closeDialog} title={`선택 검토 ${ids.length}건 문제 없음`} desc="정당한 업무 사용으로 종결해요" foot={<Foot ok="종결하기" onOk={ok} />}>
      <Field label="판단 근거" htmlFor="bmemo"><TextArea id="bmemo" value={memo} onChange={e => setMemo(e.target.value)} /></Field>
    </Modal>
  )
}

function AddDict() {
  const [term, setTerm] = useState(''), [alias, setAlias] = useState(''), [type, setType] = useState('프로젝트 코드명'), [err, setErr] = useState(false)
  const ok = () => { if (!term.trim()) { setErr(true); return } S.ui.dialog = null; addDict(term.trim(), alias.trim(), type) }
  return (
    <Modal open onClose={closeDialog} title="회사 고유 단어 추가" desc="정책 초안에 추가돼요" foot={<Foot ok="추가하기" onOk={ok} />}>
      <Field label="단어" htmlFor="dterm" error={err && '단어를 적어 주세요'}><Input id="dterm" autoFocus placeholder="예: 프로젝트 백두" value={term} aria-invalid={err} onChange={e => { setTerm(e.target.value); setErr(false) }} /></Field>
      <Field label="함께 잡을 표현" htmlFor="dalias" hint="쉼표로 여러 개"><Input id="dalias" placeholder="예: BAEKDU, 백두 PJT" value={alias} onChange={e => setAlias(e.target.value)} /></Field>
      <Field label="어떤 정보로 잡을까요" htmlFor="dtype"><Select id="dtype" value={type} onChange={e => setType(e.target.value)}><option>프로젝트 코드명</option><option>미공개 실적</option></Select></Field>
    </Modal>
  )
}

// 서버에 붙어 있으면 /policy/publish 로 서명·저장, 아니면 화면 안에서만 버전을 올린다
function Publish({ onDone }: { onDone?: () => void }) {
  const [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null)
  const ok = async () => {
    if (busy) return
    let v: string | undefined
    if (S.api.live) {
      setBusy(true); setErr(null)
      try { v = await publishToServer() } catch (e) {
        const m = (e as Error).message
        setErr(/signing key/i.test(m) ? '서버의 서명 키를 찾을 수 없어요. 백엔드 담당자에게 알려 주세요' : m); setBusy(false); return
      }
    }
    S.ui.dialog = null; publish(v); if (S.api.live) afterServerPublish(); else simulateDemoAcks(); onDone?.(); emit()
  }
  return (
    <Modal open onClose={closeDialog} title={S.api.live ? '서명 후 배포' : `${nextVersion()} 서명 후 배포`}
      desc={S.api.live ? '서버가 버전을 매겨 서명해요. 직원 PC는 서명이 맞는 정책만 받아요.' : '서명한 정책만 직원 PC가 받아요.'}
      foot={<Foot ok="서명 후 배포하기" okLabel="서명하는 중…" busy={busy} onOk={ok} />}>
      <ChangeList />
      {err && <Note warn>배포하지 못했어요: {err}</Note>}
    </Modal>
  )
}

function Server() {
  const a = S.api, st = a.stats, pct = (x?: number) => Math.round((x || 0) * 100) + '%'
  const [out, setOut] = useState<ReactNode>(null)
  const [busy, setBusy] = useState(false)
  const reload = async () => { S.ui.dialog = null; emit(); toast((await connect()) ? `서버 데이터 ${S.api.count}건을 불러왔어요` : '서버에 연결하지 못했어요') }
  const exp = async () => {
    setBusy(true); setOut('내보내는 중…')
    try { const r = await post<{ exported: number; public_key_fingerprint: string }>('/logs/export'); setOut(<>{r.exported}건을 내보냈어요 · 키 지문 <code>{String(r.public_key_fingerprint).slice(0, 16)}…</code></>) }
    catch (e) { setOut('내보내지 못했어요: ' + (e as Error).message) }
    finally { setBusy(false) }
  }
  if (!a.live) return (
    <Modal open onClose={closeDialog} title={a.state === 'off' ? '예시 데이터로 보는 중' : '서버에 연결되지 않았어요'}
      desc="예시 데이터를 보여 주고 있어요" foot={<><Button variant="ghost" onClick={closeDialog}>닫기</Button>{a.state === 'off' ? <a className={ds.btn + ' ' + ds.primary} href="./#home">서버 데이터로 보기</a> : <Button variant="primary" onClick={reload}>다시 연결하기</Button>}</>}>
      {a.state !== 'off' && <Note>배포 환경이라면 BACKEND_URL 이 맞는지 확인해 주세요.</Note>}
    </Modal>
  )
  return (
    <Modal open onClose={closeDialog} title="백엔드 서버" foot={<><Button variant="ghost" onClick={exp} disabled={busy}>로그 암호화 내보내기</Button><Button variant="primary" onClick={reload}>다시 불러오기</Button></>}>
      <KV rows={[
        ['주소', a.base === '/api' ? '같은 주소 프록시 → 백엔드' : a.base],
        ['불러온 시각', a.synced ? fmt(a.synced) : '—'],
        ['최근 7일', `${a.count}건`],
        ...(st ? [['서버 전체', `${st.total}건`], ['수용률 · 되돌림률', `${pct(st.acceptance_rate)} · ${pct(st.revert_rate)}`]] as [string, string][] : []),
      ]} />
      {st && Object.keys(st.by_queue).length > 0 && <div className={f.tags}>{Object.entries(st.by_queue).map(([k, v]) => <Tag key={k}>{QUEUE_KO[k] || k} {v}</Tag>)}</div>}
      {out && <Note>{out}</Note>}
    </Modal>
  )
}

export function DialogHost() {
  useStore()
  const d = S.ui.dialog
  if (!d) return null
  switch (d.kind) {
    case 'close': return <CloseCase key={d.caseId} caseId={d.caseId} onDone={d.onDone} />
    case 'exclude': return <Exclude groupKey={d.groupKey} onDone={d.onDone} />
    case 'publish': return <Publish onDone={d.onDone} />
    case 'changes': return <Modal open onClose={closeDialog} title={`배포 대기 변경 ${S.policy.changes.length}개`} foot={<Button variant="primary" onClick={() => openDialog({ kind: 'publish' })}>서명 후 배포하기</Button>}><ChangeList /></Modal>
    case 'addDict': return <AddDict />
    case 'bulk': return <Bulk ids={d.ids} />
    case 'server': return <Server />
  }
}
