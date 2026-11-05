// 대화상자: 결론 내기 · 탐지 제외(오른쪽 패널) · 서명 후 배포 · 변경 내용 · 고유 단어 추가 · 일괄 종결 · 서버
import { useState, type ReactNode } from 'react'
import { S, emit, useStore, hooks, caseById, closeCase, addRule, suggestRule, change, fpGroups, groupKey, fpExclude, publish, addDict, ent, toast, type Dialog } from '../domain/store'
import { CAUSES, CONCLUSION, METHODS } from '../domain/defaults'
import type { Cause, Conclusion, Method } from '../domain/types'
import { convert, fmt, josa, partial } from '../lib/util'
import { hashOf, syncExcludeDecisions } from '../api/fp'
import { QUEUE_KO, connect } from '../api/client'
import { afterServerPublish, applyOnServer, publishToServer, reasonKo } from '../api/policy'
import { EVERY } from '../api/live'
import { Button, Checkbox, Field, Input, KV, Notice, Select, Tag, TextArea } from '../ds'
import { Modal } from '../ds/Overlay'
import f from './dialogs.module.css'

export const PERSONAL = ['이름', '주민등록번호', '카드번호', '계좌번호', '전화번호', '이메일', '주소', '생년월일']
const SECRET = ['API 키', '비밀번호', '토큰', '사업자번호']
export const closeDialog = () => { S.ui.dialog = null; emit() }
export const openDialog = (d: Dialog) => { S.ui.dialog = d; emit() }

const Note = ({ warn, error, children }: { warn?: boolean; error?: boolean; children: ReactNode }) => <Notice tone={error ? 'error' : warn ? 'warning' : 'info'}>{children}</Notice>
const Foot = ({ ok, onOk, busy, okLabel, disabled }: { ok: string; onOk: () => void; busy?: boolean; okLabel?: string; disabled?: boolean }) => <>
  <Button variant="ghost" onClick={closeDialog}>취소</Button>
  <Button variant="primary" onClick={onOk} disabled={busy || disabled}>{busy ? okLabel : ok}</Button>
</>

function CloseCase({ caseId, onDone }: { caseId: string; onDone?: () => void }) {
  const c = caseById(caseId)!
  const leaked = c.items.filter(i => i.status !== 'conv')
  const hashed = leaked.filter(i => hashOf(i.orig)) // 값 해시가 있어야 서버가 같은 값을 알아본다
  const types = [...new Set(leaked.map(i => i.type))]
  const s0 = suggestRule(c)
  const [k, setK] = useState<Conclusion>(c.need === 'opt' ? 'legit' : 'violation')
  // 원인은 위반일 때만 고른다. 정당한 업무 사용은 '변환 결과가 업무에 맞지 않음'(fit)으로 정해져 있다(빠른 판단 2와 같음)
  const VIOLATION_CAUSES: Cause[] = ['care', 'intent']
  const [vCause, setVCause] = useState<Cause>('care')
  const cause: Cause | null = k === 'violation' ? vCause : k === 'legit' ? 'fit' : null
  const [mk, setMk] = useState(true)
  const [type, setType] = useState(s0.type)
  const sug = suggestRule(c, type)
  const [when, setWhen] = useState<string | null>(null)
  const [method, setMethod] = useState<Method>(s0.method)
  const [ex, setEx] = useState(false)
  const [exi, setExi] = useState(0)
  const [memo, setMemo] = useState('')
  const [err, setErr] = useState(false)
  const ruleable = !!cause && !!CAUSES[cause].rule
  const src = c.items.find(i => i.type === type) || sug.item
  const w = (when ?? sug.when)
  const ok = () => {
    if (!memo.trim()) { setErr(true); return }
    let rule: string | null = null
    if (ruleable && mk) rule = addRule(c, type, w.trim(), method)
    if (k === 'fp' && ex && hashed[exi]) {
      const it = hashed[exi]
      S.policy.exclude.unshift({ term: it.orig, why: '위반 검토에서 탐지 오류로 확인', from: c.id, draft: true })
      change(`탐지 제외 추가: ${it.type} "${partial(it.type, it.orig)}"`, c.id)
    }
    closeCase(c, { k, cause, memo: memo.trim(), rule })
    S.ui.dialog = null
    toast(rule || (k === 'fp' && ex) ? '종결했어요 · 서명 후 배포하면 적용돼요' : '종결했어요')
    onDone?.()
  }
  return (
    <Modal open onClose={closeDialog} title={c.reason ? '결론 내기' : '사유 없이 결론 내기'} desc={`${c.user} · ${c.dept} · ${leaked.map(i => i.type).join(', ')} → ${c.ev.ai}`} foot={<Foot ok="종결하기" onOk={ok} />} wide>
      {c.reason?.text ? <blockquote className={f.quote}>{c.reason.text}</blockquote> : c.reason ? <Note>사유 글 없이 '{c.reason.pick}'만 골랐어요</Note> : <Note warn>직원 사유가 없어요</Note>}
      <div className={f.group} role="radiogroup" aria-label="결론">
        {(Object.entries(CONCLUSION) as [Conclusion, [string, string]][]).map(([key, [t, d]]) => (
          <label key={key} className={f.radio} data-on={k === key || undefined}>
            <input type="radio" name="k" checked={k === key} onChange={() => setK(key)} /><span><b>{t}</b><small>{d}</small></span>
          </label>
        ))}
      </div>
      {k === 'violation' && <Field label="원인" htmlFor="cause"><Select id="cause" value={vCause} onChange={e => setVCause(e.target.value as Cause)}>
        {VIOLATION_CAUSES.map(key => <option key={key} value={key}>{CAUSES[key].t}</option>)}
      </Select></Field>}
      {ruleable && <div className={f.box}>
        <label className={f.checkRow}><Checkbox checked={mk} onChange={setMk} label="재발 방지 규칙 만들기" /><b>재발 방지 — 같은 입력은 다음부터 자동 변환</b></label>
        {mk && <div className={f.grid}>
          <Field label="항목" htmlFor="rtype"><Select id="rtype" value={type} onChange={e => { setType(e.target.value); setMethod(suggestRule(c, e.target.value).method) }}>{types.map(t => <option key={t}>{t}</option>)}</Select></Field>
          <Field label="이렇게 바꿔요" htmlFor="rmethod"><Select id="rmethod" value={method} onChange={e => setMethod(e.target.value as Method)}>{METHODS.map(m => <option key={m}>{m}</option>)}</Select></Field>
          <div className={f.span}><Field label="이런 경우에" htmlFor="rwhen" count={w.length} max={40}><Input id="rwhen" value={w} onChange={e => setWhen(e.target.value)} /></Field></div>
          <div className={f.span + ' ' + f.preview}>{partial(type, src.orig)} → <b>{convert(type, src.orig, method)}</b></div>
          {method === (ent(type)?.method ?? '') && <div className={f.span}><Note warn>지금 기본 방식과 같아서 바뀌는 게 없어요</Note></div>}
        </div>}
      </div>}
      {k === 'violation' && <Note>위반은 자동 변환 규칙 없이 결론과 판단 근거만 남겨요.</Note>}
      {k === 'fp' && <div className={f.box}>
        {hashed.length ? <label className={f.checkRow}><Checkbox checked={ex} onChange={setEx} label="탐지 제외에 추가" /><b>잘못 잡힌 값을 탐지 제외에 추가</b></label>
          : <Note>이 건은 서버에 값 정보가 없어 탐지 제외에 넣을 수 없어요</Note>}
        {ex && hashed.length > 0 && <><Select value={exi} onChange={e => setExi(+e.target.value)} aria-label="제외할 값">{hashed.map((i, n) => <option key={n} value={n}>{i.type} · {partial(i.type, i.orig)}</option>)}</Select>
          {PERSONAL.includes(hashed[exi]?.type) && <Note warn>공개된 값일 때만 제외하세요</Note>}</>}
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
  const noHash = g.value.includes('#nohash-') // 서버가 값 해시를 주지 않아 정책으로 이 값을 알아볼 수 없다
  const ok = () => { if (noHash) return; if (!why.trim()) { setErr(true); return } fpExclude(g, why.trim()); S.ui.dialog = null; onDone?.(); emit() }
  return (
    <Modal open sheet onClose={closeDialog} title="탐지 제외" desc="정책 초안에 추가돼요. 서명 후 배포하면 서버 탐지에 적용돼요." foot={<Foot ok="초안에 추가하기" onOk={ok} disabled={noHash} />}>
      <div className={f.valueCard}><span className={f.mut}>{g.type}</span><b className={f.big}>{partial(g.type, g.value)}</b></div>
      {/* 서버는 같은 값(조사가 붙은 형태 포함)을 탐지기·유형과 상관없이 모든 직원에게서 뺀다(backend policy_apply.py) */}
      <KV rows={[['범위', '이 값(조사가 붙은 형태 포함) · 모든 탐지 유형 · 모든 직원'], ['근거', `오탐 신고 ${g.refs.length}회 · 최근 7일 ${less}회`]]} />
      {noHash && <Note warn>이 신고에는 서버의 값 해시가 없어 제외 규칙을 만들 수 없어요. 직원 앱이 값 해시를 보내야 해요.</Note>}
      {PERSONAL.includes(g.type) && <Note warn>{josa(g.type, '은', '는')} 개인정보예요. 회사 대표번호처럼 공개된 값일 때만 제외하세요.</Note>}
      {SECRET.includes(g.type) && <Note error>{josa(g.type, '은', '는')} 비밀값일 수 있어요. 제외하면 이 값이 그대로 외부 AI로 나가요.</Note>}
      <Field label="제외 사유" htmlFor="why" error={err && '제외 사유를 적어 주세요'}>
        <Input id="why" autoFocus placeholder="예: 회사 대표번호 (홈페이지 공개)" value={why} aria-invalid={err} onChange={e => { setWhy(e.target.value); setErr(false) }} onKeyDown={e => { if (e.key === 'Enter') ok() }} />
      </Field>
    </Modal>
  )
}

export const ChangeList = () => <ul className={f.changes}>{S.policy.changes.map((c, i) => <li key={i}><span>{c.what}</span><em>{c.src}</em></li>)}</ul>

function Bulk({ ids }: { ids: string[] }) {
  const [memo, setMemo] = useState('사유 확인 — 업무 범위 내 사용')
  const ok = () => { const cs = ids.map(caseById).filter((c): c is NonNullable<typeof c> => !!c); cs.forEach(c => closeCase(c, { k: 'legit', cause: null, memo, rule: null }, false)); hooks.closeMany?.(cs); S.ui.picked.clear(); S.ui.dialog = null; toast(`${ids.length}건을 종결했어요`) }
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
      <Field label="함께 잡을 표현" htmlFor="dalias" hint="쉼표로 여러 개 · 띄어쓰기로 나뉜 4낱말 이하, 대소문자까지 똑같을 때만 잡아요"><Input id="dalias" placeholder="예: BAEKDU, 백두 PJT" value={alias} onChange={e => setAlias(e.target.value)} /></Field>
      <Field label="어떤 정보로 잡을까요" htmlFor="dtype"><Select id="dtype" value={type} onChange={e => setType(e.target.value)}><option value="프로젝트 코드명">프로젝트 코드명 · 사내정보로 가려요</option><option value="미공개 실적">미공개 실적 · 기밀로 판정해요</option></Select></Field>
    </Modal>
  )
}

// 서버가 /policy/publish 로 서명·저장하고 /policy/deploy 로 적용한다. 연결이 없으면 배포하지 않는다
function Publish({ onDone }: { onDone?: () => void }) {
  const [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null)
  const ok = async () => {
    if (busy) return
    // 서명·저장·적용은 서버가 한다. 연결이 없으면 배포하지 않는다(화면 안에서만 버전을 올리지 않음)
    if (!S.api.live) return
    let v: string, msg: string
    setBusy(true); setErr(null)
    try {
      v = await publishToServer()
      // 배포는 서버에 저장만 한다. 서버 탐지가 이 버전을 쓰도록 바로 적용한다
      const no = await applyOnServer(+v.slice(1)).catch(e => (e as Error).message)
      msg = no ? `${v}를 저장했지만 서버에 적용하지 못했어요 (${reasonKo(no)}) · 배포 화면에서 다시 적용해 주세요` : `${v}를 서명해 배포했고 서버 탐지에 적용했어요`
    } catch (e) {
      const m = (e as Error).message
      setErr(/signing key/i.test(m) ? '서버의 서명 키를 찾을 수 없어요. 백엔드 담당자에게 알려 주세요' : m); setBusy(false); return
    }
    S.ui.dialog = null; publish(v, msg); afterServerPublish().then(syncExcludeDecisions); onDone?.(); emit()
  }
  return (
    <Modal open onClose={closeDialog} title="서명 후 배포"
      desc="서버가 버전을 매겨 서명하고, 서버 탐지에 바로 적용해요. 직원 입력은 모두 서버에서 검사하니 따로 내려보낼 필요가 없어요."
      foot={<Foot ok="서명 후 배포하기" okLabel="서명하는 중…" busy={busy} onOk={ok} disabled={!S.api.live} />}>
      <ChangeList />
      {!S.api.live && <Note error>서버에 연결되지 않아 배포할 수 없어요. 다시 연결한 뒤 배포해 주세요.</Note>}
      {err && <Note error>배포하지 못했어요: {err}</Note>}
    </Modal>
  )
}

function Server() {
  const a = S.api, st = a.stats, pct = (x?: number) => Math.round((x || 0) * 100) + '%'
  const reload = async () => { S.ui.dialog = null; emit(); toast((await connect()) ? `서버 데이터 ${S.api.count}건을 불러왔어요` : '서버에 연결하지 못했어요') }
  if (!a.live) return (
    <Modal open onClose={closeDialog} title={a.state === 'auth' ? '서버 인증이 필요해요' : '서버에 연결되지 않았어요'}
      desc="서버 데이터만 보여 줘요. 연결되면 바로 채워져요" foot={<><Button variant="ghost" onClick={closeDialog}>닫기</Button><Button variant="primary" onClick={reload}>다시 연결하기</Button></>}>
      {a.state === 'auth' ? <Note warn>서버가 보안팀 토큰을 요구해요. 배포 환경의 BACKEND_TOKEN 에 보안팀(security) 토큰을 넣어 주세요.</Note>
        : <Note>배포 환경이라면 BACKEND_URL 이 맞는지 확인해 주세요.</Note>}
    </Modal>
  )
  return (
    <Modal open onClose={closeDialog} title="백엔드 서버" foot={<Button variant="primary" onClick={reload}>다시 불러오기</Button>}>
      <KV rows={[
        ['주소', a.base === '/api' ? '같은 주소 프록시 → 백엔드' : a.base],
        ['불러온 시각', a.synced ? fmt(a.synced) : '—'],
        ['실시간 갱신', a.stale ? '서버 응답이 없어 다시 시도하는 중' : `${EVERY / 1000}초마다 변경 확인`],
        ['최근 7일', `${a.count}건${a.truncated ? ' (너무 많아 일부만 불러옴)' : ''}`],
        ...(st ? [['최근 7일 서버 집계', `${st.total}건`], ['수용률 · 되돌림률', `${pct(st.acceptance_rate)} · ${pct(st.revert_rate)}`]] as [string, string][] : []),
      ]} />
      {st && Object.keys(st.by_queue).length > 0 && <div className={f.tags}>{Object.entries(st.by_queue).map(([k, v]) => <Tag key={k}>{QUEUE_KO[k] || k} {v}</Tag>)}</div>}
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
