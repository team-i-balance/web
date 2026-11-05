// 위반 검토: 왼쪽 사건 목록(필수·선택·종결), 오른쪽 상세(사유·결론·사건 경로·보낸 내용)
import { useEffect, useState } from 'react'
import { S, emit, useStore, caseById, openOf, ago, quickClose, reopen, demoReason } from '../domain/store'
import { CAUSES, CONCLUSION } from '../domain/seed'
import type { Case } from '../domain/types'
import { openDialog } from '../ui/Dialogs'
import { SentText } from '../ui/common'
import { partial } from '../lib/util'

const TABS = { req: '필수', opt: '선택', closed: '종결' } as const
const DECIDE = [['violation', '위반으로 기록'], ['legit', '이번 건 예외 인정'], ['fp', '오탐으로 기록']] as const

function listOf(tab: keyof typeof TABS) {
  return S.cases.filter(c => (tab === 'closed' ? c.status === 'closed' : c.need === tab && c.status === 'open'))
    .sort(tab === 'closed' ? (a, b) => +b.close!.at - +a.close!.at : tab === 'req' ? (a, b) => (+!!b.reason - +!!a.reason) || +b.time - +a.time : (a, b) => +b.time - +a.time)
}
const useWide = () => {
  const [w, setW] = useState(innerWidth > 1100)
  useEffect(() => { const f = () => setW(innerWidth > 1100); addEventListener('resize', f); return () => removeEventListener('resize', f) }, [])
  return w
}

function Row({ x, on }: { x: Case; on: boolean }) {
  const tab = S.ui.rqTab
  const tags = Object.entries(x.items.filter(i => i.status !== 'conv').reduce<Record<string, number>>((m, i) => ((m[i.type] = (m[i.type] || 0) + 1), m), {}))
  return (
    <a className={'it' + (on ? ' on' : '')} href={`#review/${x.id}`}>
      <div className="a">
        {tab === 'opt' && <input type="checkbox" className="chk" checked={S.ui.picked.has(x.id)} aria-label={`${x.id} 선택`}
          onClick={e => e.stopPropagation()} onChange={e => { e.target.checked ? S.ui.picked.add(x.id) : S.ui.picked.delete(x.id); emit() }} />}
        <span className="who">{x.user}</span><span className="sub">{x.dept}</span><span className="when">{ago(x.time)}</span>
      </div>
      <div className="types">{tags.map(([t, n]) => <span className="tag" key={t}>{t}{n > 1 ? ` ${n}개` : ''}</span>)}</div>
      <div className="r">
        {x.status === 'closed'
          ? <><span className={'pill ' + (x.close!.k === 'violation' ? 'bad' : '')}>{CONCLUSION[x.close!.k][0]}</span> <span className="sub">{x.reason ? `· "${x.reason.text}"` : '· 사유 미제출'}</span></>
          : x.reason ? <><b>{x.reason.pick ? '업무상 필요' : '사유 도착'}</b> · {x.reason.text}</> : <span className="wait">사유 대기 중</span>}
      </div>
    </a>
  )
}

function CasePath({ c }: { c: Case }) {
  const rv = c.items.filter(i => i.status !== 'conv').length, closed = c.status === 'closed'
  const st: [string, string, string][] = [
    ['done', '입력', c.ev.ai],
    ['done', '탐지', `민감 ${c.items.length}개`],
    [c.need === 'req' ? 'done bad' : 'done', '직원 선택', c.need === 'req' ? '원문 전송' : `${rv}개 되돌림`],
    c.reason ? ['done', '직원 사유', '제출함'] : [closed ? 'done' : 'now', '직원 사유', closed ? '미제출' : '기다리는 중'],
    closed ? ['done', '보안팀 결론', CONCLUSION[c.close!.k][0]] : [c.reason ? 'now' : 'later', '보안팀 결론', c.reason ? '지금 차례' : '사유 도착 후'],
    closed && c.close!.rule ? ['ok', '재발 방지', '자동 변환 등록'] : ['later', '재발 방지', closed ? '없음' : '결론과 함께'],
  ]
  const nowAt = st.findIndex(x => x[0].startsWith('now'))
  return (
    <div className="path">
      {st.map((x, i) => <span key={i} style={{ display: 'contents' }}>
        {i > 0 && <span className={'pe' + (nowAt >= 0 && i <= nowAt ? ' lit' : '')} />}
        <div className={'pn ' + x[0]}><span className="lab">{x[1]}</span><span className="v">{x[2]}</span></div>
      </span>)}
    </div>
  )
}

function Detail({ c }: { c: Case }) {
  const leaked = c.items.filter(i => i.status !== 'conv')
  const decide = (k: 'violation' | 'legit' | 'fp' | 'ok') => { quickClose(c, k); emit() }
  const actions = c.status === 'closed' ? <button className="btn" onClick={() => reopen(c)}>다시 열기</button>
    : !c.reason ? <>{!S.api.live && <button className="btn ghost" onClick={() => demoReason(c)}>사유 도착시키기 · 데모</button>}<button className="btn" onClick={() => openDialog({ kind: 'close', caseId: c.id })}>사유 없이 결론 내기</button></>
    : c.need === 'opt' ? <><button className="btn ghost" onClick={() => openDialog({ kind: 'close', caseId: c.id })}>세부 설정으로 결론</button><button className="btn" onClick={() => decide('violation')}>위반</button><button className="btn p" onClick={() => decide('ok')}>문제 없음으로 종결</button></>
    : <><button className="btn ghost" onClick={() => openDialog({ kind: 'close', caseId: c.id })}>세부 설정으로 결론</button>{DECIDE.map(([k, t]) => <button key={k} className="btn" onClick={() => decide(k)}>{t}</button>)}</>
  const x = c.close
  return (
    <>
      <div className="dhead">
        <div style={{ minWidth: 0 }}>
          <a className="btn sm ghost back" href="#review" style={{ margin: '-8px 0 8px -16px' }}>목록으로</a>
          <div className="badges">
            {c.need === 'req' ? <span className="pill req">필수</span> : <span className="pill opt">선택</span>}
            {c.status === 'closed' ? <span className={'pill ' + (x!.k === 'violation' ? 'bad' : x!.k === 'legit' ? 'ok' : '')}>{CONCLUSION[x!.k][0]}</span> : c.reason ? <span className="pill br">검토 대기</span> : <span className="pill">사유 대기</span>}
          </div>
          <h2 className="t24">{c.user} 님이 {leaked.map(i => i.type).join(', ')} 원문을 {c.ev.ai}에 보냈어요</h2>
          <div className="sub">{c.dept} · {ago(c.time)}</div>
        </div>
        <div className="actbar">{actions}</div>
      </div>
      <div className="dbody">
        <div className="dsec">
          <h3>직원 사유 {c.reason && <span className="sub">{c.reason.pick ? c.reason.pick + ' · ' : ''}{c.reason.when}</span>}</h3>
          {c.reason ? <div className="quote">{c.reason.text}</div> : <div className="note w"><div>직원 사유를 기다리고 있어요</div></div>}
        </div>
        {x && <div className="dsec"><h3>보안팀 결론</h3>
          <div className={'note ' + (x.k === 'violation' ? 'c' : x.k === 'legit' ? 'ok' : '')}><div>
            <div><b>{CONCLUSION[x.k][0]}</b></div>
            {x.cause && <div>원인: {CAUSES[x.cause].t}</div>}
            {x.memo && <div>판단 근거: {x.memo}</div>}
            {x.rule && <div>재발 방지: {x.rule}</div>}
          </div></div></div>}
        <div className="dsec"><h3>사건 경로</h3><CasePath c={c} /></div>
        <div className="dsec"><h3>보낸 내용 <span className="sub">원문은 일부만 보여요</span></h3>
          <div className="text"><SentText c={c} /></div>
          {c.items.some(i => i.reason === '오탐') && <div className="note mt"><div>{c.items.filter(i => i.reason === '오탐').map(i => i.type).join(', ')} 항목은 "오탐"으로 되돌려 <a href="#fp">오탐 신고</a>에서 따로 처리해요</div></div>}
          <div className="scroll mt"><table className="nw"><thead><tr><th>항목</th><th>나간 값</th><th>변환했다면</th><th>직원 처리</th></tr></thead><tbody>
            {c.items.map((it, i) => <tr key={i}><td>{it.type}</td>
              <td>{it.status === 'conv' ? <span className="muted">{it.conv || '(삭제)'}</span> : <b style={{ color: 'var(--text-danger)' }}>{partial(it.type, it.orig)}</b>}</td>
              <td>{it.conv === '' ? <span className="muted">(삭제)</span> : it.conv}</td>
              <td>{it.status === 'conv' ? <span className="pill">변환 유지</span> : it.status === 'revert' ? <span className="pill">되돌림 · {it.reason}</span> : <span className="pill bad">원문 전송</span>}</td></tr>)}
          </tbody></table></div>
          {c.file && <div className={'note mt ' + (c.need === 'req' ? 'c' : '')}><div><b>{c.file.name}</b> · {c.need === 'req' ? '원본 파일이 올라갔어요 · 숨은 정보 포함' : '변환 사본이 올라갔어요 · 숨은 정보 제거'}</div></div>}
        </div>
      </div>
    </>
  )
}

export default function Review({ id: idArg }: { id?: string }) {
  useStore()
  const wide = useWide()
  if (idArg) { const c = caseById(idArg); if (c) S.ui.rqTab = c.status === 'closed' ? 'closed' : c.need }
  const tab = S.ui.rqTab
  const list = listOf(tab)
  const id = idArg || (wide && list[0] ? list[0].id : undefined)
  const c = id ? caseById(id) : undefined
  const count = (k: keyof typeof TABS) => (k === 'closed' ? S.cases.filter(c => c.status === 'closed').length : openOf(k).length)

  // ↑↓ 로 목록 이동
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (S.ui.dialog || /INPUT|TEXTAREA|SELECT/.test((document.activeElement as HTMLElement)?.tagName)) return
      const dir = e.key === 'ArrowDown' || e.key === 'j' ? 1 : e.key === 'ArrowUp' || e.key === 'k' ? -1 : 0
      if (!dir) return
      const items = [...document.querySelectorAll<HTMLAnchorElement>('.it')]
      if (!items.length) return
      e.preventDefault()
      const i = items.findIndex(a => a.classList.contains('on')), nx = items[Math.max(0, Math.min(items.length - 1, i + dir))]
      location.hash = nx.getAttribute('href')!
      requestAnimationFrame(() => document.querySelector('.it.on')?.scrollIntoView({ block: 'nearest' }))
    }
    addEventListener('keydown', f)
    return () => removeEventListener('keydown', f)
  }, [])

  const setTab = (k: keyof typeof TABS) => { S.ui.rqTab = k; S.ui.picked.clear(); if (location.hash === '#review') emit(); else location.hash = 'review' }
  const ready = list.filter(x => x.reason), wait = list.filter(x => !x.reason)
  return (
    <div className={'split' + (c ? ' has' : '')}>
      <section className="card listpane" aria-label="사건 목록">
        <div className="card-h" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 24 }}>
          <h1 className="t32">위반 검토</h1>
          <div className="tabs" role="tablist">
            {(Object.keys(TABS) as (keyof typeof TABS)[]).map(k => (
              <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{TABS[k]}<span className={'n' + (k === 'req' ? ' hot' : '')}>{count(k)}</span></button>
            ))}
          </div>
        </div>
        <div className="card-b">
          {tab === 'opt' && <div className="toolbar"><span className="sub">체크해서 한 번에 종결해요</span>
            <button className="btn sm" disabled={!S.ui.picked.size} onClick={() => openDialog({ kind: 'bulk', ids: [...S.ui.picked] })}>{S.ui.picked.size ? S.ui.picked.size + '건 ' : ''}종결하기</button></div>}
          <div className="list">
            {!list.length ? <div className="empty"><b>{tab === 'closed' ? '종결된 사건이 없어요' : '검토할 사건이 없어요'}</b><span className="sub">다른 탭을 확인해 보세요</span></div>
              : tab === 'req' ? <>
                {ready.length > 0 && <><div className="lh"><b>사유 도착 · 지금 결론</b><span className="n">{ready.length}</span></div>{ready.map(x => <Row key={x.id} x={x} on={x.id === c?.id} />)}</>}
                {wait.length > 0 && <><div className="lh"><b>사유 기다리는 중</b><span className="n">{wait.length}</span></div>{wait.map(x => <Row key={x.id} x={x} on={x.id === c?.id} />)}</>}
              </> : list.map(x => <Row key={x.id} x={x} on={x.id === c?.id} />)}
          </div>
        </div>
      </section>
      <section className="card detailpane" aria-label="사건 상세">
        {c ? <Detail key={c.id} c={c} /> : <div className="empty"><b>사건을 고르세요</b><span className="sub">왼쪽 목록에서 사건을 누르면 여기에 열려요</span></div>}
      </section>
    </div>
  )
}
