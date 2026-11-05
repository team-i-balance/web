// 대화상자: 결론 내기 · 탐지 제외 검토 · 서명 후 배포 · 변경 내용 · 고유 단어 추가 · 일괄 종결 · 서버
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { S, emit, useStore, caseById, closeCase, addRule, suggestRule, change, fpGroups, groupKey, fpExclude, publish, nextVersion, addDict, ent, toast, type Dialog } from '../domain/store'
import { CAUSES, CONCLUSION, METHODS } from '../domain/seed'
import type { Cause, Conclusion, Method } from '../domain/types'
import { convert, fmt, partial } from '../lib/util'
import { QUEUE_KO, connect, post } from '../api/client'

const PERSONAL = ['이름', '주민등록번호', '카드번호', '계좌번호', '전화번호', '이메일', '주소', '생년월일']
export const closeDialog = () => { S.ui.dialog = null; emit() }
export const openDialog = (d: Dialog) => { S.ui.dialog = d; emit() }

function Shell({ title, children, ok, onOk, noCancel, okDisabled }: { title: string; children: ReactNode; ok: string; onOk: () => void; noCancel?: boolean; okDisabled?: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const last = document.activeElement as HTMLElement | null
    const first = box.current?.querySelector<HTMLElement>('input[type=text],textarea') || box.current?.querySelector<HTMLElement>('.mfoot .btn.p')
    first?.focus()
    return () => last?.focus?.()
  }, [])
  return (
    <div className="modal open" role="dialog" aria-modal="true" aria-label={title} onClick={e => { if (e.target === e.currentTarget) closeDialog() }}>
      <div className="mbox" ref={box}>
        <h3>{title}</h3>
        {children}
        <div className="mfoot">
          {!noCancel && <button className="btn ghost" onClick={closeDialog}>취소</button>}
          <button className="btn p" onClick={onOk} disabled={okDisabled}>{ok}</button>
        </div>
      </div>
    </div>
  )
}

function CloseCaseDialog({ caseId, onDone }: { caseId: string; onDone?: () => void }) {
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
  const onType = (t: string) => { setType(t); setMethod(suggestRule(c, t).method) }
  const ok = () => {
    if (!memo.trim()) { setErr(true); return }
    let rule: string | null = null
    if (ruleable && mk) rule = addRule(c, type, (when ?? sug.when).trim(), method)
    if (k === 'fp' && ex) {
      const it = leaked[exi]
      S.policy.exclude.unshift({ term: it.orig, why: '위반 검토에서 탐지 오류로 확인', from: c.id, draft: true })
      change(`탐지 제외 추가: ${it.type} "${partial(it.type, it.orig)}"`, c.id)
    }
    closeCase(c, { k, cause: k === 'fp' ? null : cause, memo: memo.trim(), rule })
    S.ui.dialog = null
    toast(rule || (k === 'fp' && ex) ? '종결했어요 · 변환 정책에서 서명 후 배포하면 적용돼요' : '종결했어요')
    onDone?.()
  }
  return (
    <Shell title="결론 내기" ok="종결하기" onOk={ok}>
      {c.reason ? <div className="quote">{c.reason.text}</div> : <div className="note w"><div>직원 사유 없이 결론을 내요</div></div>}
      <label className="f">결론</label>
      {(Object.entries(CONCLUSION) as [Conclusion, [string, string]][]).map(([key, [t]]) => (
        <label className="choice" key={key}><input type="radio" name="k" checked={k === key} onChange={() => setK(key)} /><span><b>{t}</b></span></label>
      ))}
      {k !== 'fp' && <><label className="f" htmlFor="cause">원인</label>
        <select id="cause" value={cause} onChange={e => setCause(e.target.value as Cause)}>
          {(Object.entries(CAUSES) as [Cause, { t: string }][]).map(([key, v]) => <option key={key} value={key}>{v.t}</option>)}
        </select></>}
      {ruleable && <>
        <label className="choice plain"><input type="checkbox" checked={mk} onChange={e => setMk(e.target.checked)} /><span><b>재발 방지 — 같은 입력은 다음부터 자동 변환</b></span></label>
        {mk && <div className="rulebox">
          <label className="f" htmlFor="rtype">항목</label>
          <select id="rtype" value={type} onChange={e => onType(e.target.value)}>{types.map(t => <option key={t}>{t}</option>)}</select>
          <label className="f" htmlFor="rwhen">이런 경우에</label>
          <input id="rwhen" type="text" value={when ?? sug.when} onChange={e => setWhen(e.target.value)} />
          <label className="f" htmlFor="rmethod">이렇게 바꿔요</label>
          <select id="rmethod" value={method} onChange={e => setMethod(e.target.value as Method)}>{METHODS.map(m => <option key={m}>{m}</option>)}</select>
          <div className="sub">결과: {partial(type, src.orig)} → <b>{convert(type, src.orig, method) || '(삭제)'}</b></div>
          {method === (ent(type)?.method ?? '') && <div className="err" style={{ display: 'block', color: 'var(--text-warning)' }}>지금 기본 방식과 같아서 바뀌는 게 없어요. 직원이 원문을 써야 했던 이유에 맞게 고르세요.</div>}
        </div>}
      </>}
      {k !== 'fp' && !CAUSES[cause].rule && <div className="note mt">이 원인은 자동 변환으로 막을 수 없어요. 결론과 판단 근거만 남겨요.</div>}
      {k === 'fp' && <>
        <label className="choice plain"><input type="checkbox" checked={ex} onChange={e => setEx(e.target.checked)} /><span><b>잘못 잡힌 값을 탐지 제외에 추가</b></span></label>
        {ex && <>
          <select value={exi} onChange={e => setExi(+e.target.value)} aria-label="제외할 값">{leaked.map((i, n) => <option key={n} value={n}>{i.type} · {partial(i.type, i.orig)}</option>)}</select>
          {PERSONAL.includes(leaked[exi]?.type) && <div className="note w mt"><div>공개된 값일 때만 제외하세요</div></div>}
        </>}
      </>}
      <label className="f" htmlFor="memo">판단 근거</label>
      <textarea id="memo" placeholder="판단 근거" value={memo} onChange={e => { setMemo(e.target.value); setErr(false) }} />
      {err && <div className="err" style={{ display: 'block' }}>판단 근거를 적어 주세요.</div>}
    </Shell>
  )
}

function ExcludeDialog({ groupKey: key, onDone }: { groupKey: string; onDone?: () => void }) {
  const g = fpGroups(true).find(x => groupKey(x) === key)
  const [why, setWhy] = useState('')
  const [err, setErr] = useState(false)
  if (!g) return null
  return (
    <Shell title="탐지 제외 검토" ok="정책 초안에 추가하기" onOk={() => { if (!why.trim()) { setErr(true); return } fpExclude(g, why.trim()); S.ui.dialog = null; onDone?.(); emit() }}>
      <div className="kv"><span>값</span><b>{partial(g.type, g.value)}</b></div>
      <div className="kv"><span>범위</span><b>정확히 이 값만 · {g.type}</b></div>
      <div className="kv"><span>근거</span><b>오탐 신고 {g.refs.length}회 · 직원 {g.users.size}명</b></div>
      <div className="kv"><span>적용</span><b>정책 초안에 추가 → 서명 후 배포하면 적용</b></div>
      {PERSONAL.includes(g.type) && <div className="note w mt"><div>공개된 값일 때만 제외하세요</div></div>}
      <label className="f" htmlFor="why">제외 사유</label>
      <input id="why" type="text" placeholder="예: 회사 대표번호 (홈페이지 공개)" value={why} onChange={e => { setWhy(e.target.value); setErr(false) }} />
      {err && <div className="err" style={{ display: 'block' }}>제외 사유를 적어 주세요.</div>}
    </Shell>
  )
}

const ChangeList = () => <div className="mt">{S.policy.changes.map((c, i) => <div className="chg" key={i}>{c.what}</div>)}</div>

function BulkDialog({ ids }: { ids: string[] }) {
  const [memo, setMemo] = useState('사유 확인 — 업무 범위 내 사용')
  return (
    <Shell title={`선택 검토 ${ids.length}건 — 문제 없음`} ok="종결하기" onOk={() => {
      ids.forEach(id => { const c = caseById(id); if (c) closeCase(c, { k: 'legit', cause: null, memo, rule: null }) })
      S.ui.picked.clear(); S.ui.dialog = null; toast(`${ids.length}건을 종결했어요`)
    }}>
      <p>정당한 업무 사용으로 종결해요.</p>
      <label className="f" htmlFor="bmemo">판단 근거</label>
      <textarea id="bmemo" value={memo} onChange={e => setMemo(e.target.value)} />
    </Shell>
  )
}

function AddDictDialog() {
  const [term, setTerm] = useState(''), [alias, setAlias] = useState(''), [type, setType] = useState('프로젝트 코드명'), [err, setErr] = useState(false)
  return (
    <Shell title="회사 고유 단어 추가" ok="추가하기" onOk={() => { if (!term.trim()) { setErr(true); return } S.ui.dialog = null; addDict(term.trim(), alias.trim(), type) }}>
      <label className="f" htmlFor="dterm">단어</label>
      <input id="dterm" type="text" placeholder="예: 프로젝트 백두" value={term} onChange={e => { setTerm(e.target.value); setErr(false) }} />
      <label className="f" htmlFor="dalias">함께 잡을 표현</label>
      <input id="dalias" type="text" placeholder="예: BAEKDU, 백두 PJT" value={alias} onChange={e => setAlias(e.target.value)} />
      <label className="f" htmlFor="dtype">어떤 정보로 잡을까요</label>
      <select id="dtype" value={type} onChange={e => setType(e.target.value)}><option>프로젝트 코드명</option><option>미공개 실적</option></select>
      {err && <div className="err" style={{ display: 'block' }}>단어를 적어 주세요.</div>}
    </Shell>
  )
}

function ServerDialog() {
  const a = S.api, st = a.stats, pct = (x?: number) => Math.round((x || 0) * 100) + '%'
  const [out, setOut] = useState<ReactNode>('보안팀 공개키로 암호화한 파일을 서버에 만들어요.')
  const [busy, setBusy] = useState(false)
  const exp = async () => {
    setBusy(true); setOut('내보내는 중…')
    try { const r = await post<{ exported: number; public_key_fingerprint: string }>('/logs/export'); setOut(<>{r.exported}건을 내보냈어요 · 키 지문 <code>{String(r.public_key_fingerprint).slice(0, 16)}…</code></>) }
    catch (e) { setOut('내보내지 못했어요: ' + (e as Error).message) }
    finally { setBusy(false) }
  }
  if (!a.live) return (
    <Shell title="서버에 연결되지 않았어요" ok="다시 연결하기" onOk={async () => { S.ui.dialog = null; emit(); toast((await connect()) ? `서버 데이터 ${S.api.count}건을 불러왔어요` : '서버에 연결하지 못했어요') }}>
      <p>예시 데이터를 보여주고 있어요. 배포 환경에서는 BACKEND_URL 이 맞는지 확인해 주세요.</p>
    </Shell>
  )
  return (
    <Shell title="백엔드 서버" ok="다시 불러오기" onOk={async () => { S.ui.dialog = null; emit(); toast((await connect()) ? `서버 데이터 ${S.api.count}건을 다시 불러왔어요` : '서버에 연결하지 못했어요') }}>
      <div className="kv"><span>주소</span><b>{a.base === '/api' ? '/api (같은 주소 프록시 → 백엔드)' : a.base}</b></div>
      <div className="kv"><span>불러온 시각</span><b>{a.synced ? fmt(a.synced) : '—'}</b></div>
      <div className="kv"><span>최근 7일 이벤트</span><b>{a.count}건</b></div>
      {st && <>
        <label className="f">서버 전체 통계</label>
        <div className="kv"><span>전체</span><b>{st.total}건</b></div>
        <div className="kv"><span>수용률 · 되돌림률</span><b>{pct(st.acceptance_rate)} · {pct(st.revert_rate)}</b></div>
        {Object.entries(st.by_queue).length ? Object.entries(st.by_queue).map(([k, v]) => <div className="kv" key={k}><span>{QUEUE_KO[k] || k}</span><b>{v}건</b></div>)
          : <div className="kv"><span>큐</span><b>아직 없어요</b></div>}
      </>}
      <div className="mt"><button className="btn sm" onClick={exp} disabled={busy}>로그 암호화 내보내기</button></div>
      <p className="mt">{out}</p>
    </Shell>
  )
}

export function DialogHost() {
  useStore()
  const d = S.ui.dialog
  useEffect(() => {
    if (!d) return
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') closeDialog() }
    addEventListener('keydown', f)
    return () => removeEventListener('keydown', f)
  }, [d])
  if (!d) return null
  switch (d.kind) {
    case 'close': return <CloseCaseDialog key={d.caseId} caseId={d.caseId} onDone={d.onDone} />
    case 'exclude': return <ExcludeDialog groupKey={d.groupKey} onDone={d.onDone} />
    case 'publish': return (
      <Shell title={`${nextVersion()} 서명 후 배포`} ok="서명 후 배포하기" onOk={() => { S.ui.dialog = null; publish(); d.onDone?.() }}>
        <p>서명한 정책만 직원 PC가 받아요.</p><ChangeList />
      </Shell>)
    case 'changes': return <Shell title={`배포 대기 변경 ${S.policy.changes.length}건`} ok="닫기" noCancel onOk={closeDialog}><ChangeList /></Shell>
    case 'addDict': return <AddDictDialog />
    case 'bulk': return <BulkDialog ids={d.ids} />
    case 'server': return <ServerDialog />
  }
}
