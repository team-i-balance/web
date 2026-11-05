// 위반 검토: 왼쪽 건 목록(필수·선택·종결), 오른쪽 상세(사유·결론·사건 경로·보낸 내용·처리 기록)
import { useEffect, useState } from 'react'
import { ArrowLeft, Inbox, SlidersHorizontal } from 'lucide-react'
import clsx from 'clsx'
import { S, emit, useStore, ago, quickClose, reopen, demoReason } from '../../domain/store'
import { CAUSES, CONCLUSION } from '../../domain/seed'
import type { Case } from '../../domain/types'
import { Button, Checkbox, Empty, Id, LinkButton, Segmented, Sentence, Tag, typesOf } from '../../ds'
import { isNext } from '../../shell/theme'
import { openDialog } from '../dialogs'
import { useReviewModel } from './model'
import { loadCaseDetail } from '../../api/cases'
import { fmt, partial } from '../../lib/util'
import r from './review.module.css'

const useWide = () => {
  const [w, setW] = useState(innerWidth > 1100)
  useEffect(() => { const f = () => setW(innerWidth > 1100); addEventListener('resize', f); return () => removeEventListener('resize', f) }, [])
  return w
}

function Row({ x, on, pick }: { x: Case; on: boolean; pick: boolean }) {
  const counts = typesOf(x).map(t => [t, x.items.filter(i => i.type === t && i.status !== 'conv').length] as const)
  return (
    <a className={clsx(r.row, !pick && r.rowNoCheck)} href={`#review/${x.id}`} aria-current={on} data-row>
      {pick && <Checkbox checked={S.ui.picked.has(x.id)} label={`${x.user} 고르기`} onChange={v => { v ? S.ui.picked.add(x.id) : S.ui.picked.delete(x.id); emit() }} />}
      <span className={r.who}><b>{x.user}</b><span>{x.dept}</span></span>
      <span className={r.when}>{ago(x.time)}</span>
      <span className={r.sub}>
        <span className={r.tags}>{counts.map(([t, n]) => <Tag key={t}>{t}{n > 1 ? ` ${n}` : ''}</Tag>)}<Tag tone="outline">{x.ev.ai}</Tag></span>
        <span className={r.snip}>
          {x.status === 'closed' ? <>{CONCLUSION[x.close!.k][0]}{x.reason ? ` · “${x.reason.text}”` : ' · 사유 미제출'}</>
            : x.reason ? x.reason.text : <span className={r.waitT}>사유 기다리는 중</span>}
        </span>
      </span>
    </a>
  )
}

function Path({ c }: { c: Case }) {
  const rv = c.items.filter(i => i.status !== 'conv').length, closed = c.status === 'closed'
  const st: [string, string, string][] = [
    ['done', '입력', c.ev.ai],
    ['done', '탐지', `민감 ${c.items.length}개`],
    [c.need === 'req' ? 'bad' : 'done', '직원 선택', c.need === 'req' ? '원문 전송' : `${rv}개 되돌림`],
    c.reason ? ['done', '직원 사유', c.reason.when] : [closed ? 'done' : 'now', '직원 사유', closed ? '미제출' : '기다리는 중'],
    closed ? ['done', '보안팀 결론', CONCLUSION[c.close!.k][0]] : [c.reason ? 'now' : '', '보안팀 결론', c.reason ? '지금 차례' : '사유 도착 후'],
    closed && c.close!.rule ? ['done', '재발 방지', '자동 변환 등록'] : ['', '재발 방지', closed ? '없음' : '결론과 함께'],
  ]
  const cls: Record<string, string> = { done: r.piDone, bad: r.piBad, now: r.piNow }
  return <ol className={r.path}>{st.map(([s, t, v]) => <li key={t} className={clsx(r.pi, cls[s])} aria-current={s === 'now' ? 'step' : undefined}><span className={r.pd} /><span className={r.pt}><b>{t}</b><span>{v}</span></span></li>)}</ol>
}

function Detail({ c }: { c: Case }) {
  useEffect(() => { loadCaseDetail(c) }, [c.id])
  const leaked = c.items.filter(i => i.status !== 'conv'), x = c.close
  const decide = (k: 'violation' | 'legit' | 'fp' | 'ok') => { quickClose(c, k); emit() }
  const detail = <Button variant="ghost" icon={<SlidersHorizontal size={15} />} onClick={() => openDialog({ kind: 'close', caseId: c.id })}>세부 설정으로 결론</Button>
  const actions = c.status === 'closed' ? <><span /><Button onClick={() => reopen(c)}>다시 열기</Button></>
    : !c.reason ? <>{S.api.live ? <span /> : <Button variant="ghost" onClick={() => demoReason(c)}>사유 도착시키기 · 데모</Button>}<Button variant="primary" onClick={() => openDialog({ kind: 'close', caseId: c.id })}>사유 없이 결론 내기</Button></>
    : c.need === 'opt' ? <>{detail}<Button danger onClick={() => decide('violation')} kbd="1">위반으로 기록</Button><Button variant={isNext() ? undefined : 'primary'} onClick={() => decide('ok')} kbd="2">문제 없음</Button></>
    : <>{detail}<Button danger onClick={() => decide('violation')} kbd="1">위반으로 기록</Button><Button onClick={() => decide('legit')} kbd="2">이번 건 예외 인정</Button><Button onClick={() => decide('fp')} kbd="3">오탐으로 기록</Button></>
  const tl = [{ t: c.time, who: c.user, what: `${leaked.map(i => i.type).join(', ')} ${c.need === 'req' ? '원문 전송' : '되돌림'}`, quote: null as string | null }, ...c.timeline.map(e => ({ ...e, quote: e.quote ?? null }))]
  return (
    <>
      <div className={r.dh}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className={r.meta}>
            <LinkButton className={r.back} variant="ghost" size="sm" href="#review" icon={<ArrowLeft size={15} />}>목록</LinkButton>
            {c.need === 'req' ? <Tag tone="danger">필수</Tag> : <Tag>선택</Tag>}
            {x ? <Tag tone={x.k === 'violation' ? 'danger' : x.k === 'legit' ? 'ok' : undefined} dot>{CONCLUSION[x.k][0]}</Tag> : c.reason ? <Tag tone="now" dot>결론 차례</Tag> : <Tag dot>사유 대기</Tag>}
          </div>
          <h2>{c.user} 님이 {leaked.map(i => i.type).join(', ')} 원문을 {c.ev.ai === 'AI 미전송' ? 'AI' : c.ev.ai}에 보냈어요</h2>
          <div className={r.metaT}>{c.dept} · <Id>{fmt(c.time)}</Id> ({ago(c.time)}){c.ev.ver ? <> · 정책 <Id>{c.ev.ver}</Id></> : ''}{isNext() && <> · <Id>{c.id}</Id></>}</div>
        </div>
      </div>
      <div className={r.dbody}>
        <div className={r.col}>
          <section className={r.sec}><h3>직원 사유 {c.reason && <small>{c.reason.pick ? c.reason.pick + ' · ' : ''}{c.reason.when}</small>}</h3>
            {c.reason ? <blockquote className={r.quote}>{c.reason.text}</blockquote> : <div className={r.note}>직원 사유를 기다리고 있어요</div>}</section>
          {x && <section className={r.sec}><h3>보안팀 결론</h3>
            <div className={clsx(r.verdict, x.k === 'violation' && r.vBad, x.k === 'legit' && r.vOk)}>
              <b>{CONCLUSION[x.k][0]}</b>
              {x.cause && <span>원인 · {CAUSES[x.cause].t}</span>}
              {x.memo && <span>판단 근거 · {x.memo}</span>}
              {x.rule && <span>재발 방지 · {x.rule}</span>}
            </div>
            {(x.rule || S.policy.changes.some(ch => ch.src === c.id)) && S.policy.changes.length > 0 && <div className={r.next}><span>규칙 초안이 배포를 기다려요 · 아직 PC에 적용 전</span><Button size="sm" variant="now" onClick={() => openDialog({ kind: 'publish' })}>서명 후 배포하기</Button><LinkButton size="sm" variant="ghost" href="#policy">정책에서 보기</LinkButton></div>}
          </section>}
          <section className={r.sec}><h3>보낸 내용 <small>원문은 일부만 보여요</small></h3>
            <div className={r.text}><Sentence c={c} /></div>
            {c.items.some(i => i.reason === '오탐') && <div className={r.note}>{c.items.filter(i => i.reason === '오탐').map(i => i.type).join(', ')} 항목은 "오탐"으로 되돌려 <a href="#fp">오탐 신고</a>에서 따로 처리해요</div>}
            <div className={r.tbox}><table className={r.table}><thead><tr><th>항목</th><th>나간 값</th><th>정책대로였다면</th><th>직원 처리</th></tr></thead><tbody>
              {c.items.map((it, i) => <tr key={i}><td>{it.type}</td>
                <td>{it.status === 'conv' ? <span className={r.faint}>{it.conv || '(삭제)'}</span> : <span className={r.leak}>{partial(it.type, it.orig)}</span>}</td>
                <td>{it.conv === '' ? <span className={r.faint}>(삭제)</span> : it.conv}</td>
                <td>{it.status === 'conv' ? <Tag>변환 유지</Tag> : it.status === 'revert' ? <Tag>되돌림 · {it.reason}</Tag> : <Tag tone="danger">원문 전송</Tag>}</td></tr>)}
            </tbody></table></div>
            {c.file && <div className={r.note}><b>{c.file.name}</b> · {c.need === 'req' ? '원본 파일이 올라갔어요 · 숨은 정보 포함' : '변환 사본이 올라갔어요 · 숨은 정보 제거'}</div>}
          </section>
        </div>
        <div className={r.col}>
          <section className={r.sec}><h3>사건 경로</h3><Path c={c} /></section>
          <section className={r.sec}><h3>처리 기록</h3>
            <ol className={r.tl}>{tl.map((e, i) => <li key={i} className={r.tli}><span><Id>{fmt(e.t)}</Id> · {e.who}</span><b>{e.what}</b>{e.quote && <q>{e.quote}</q>}</li>)}</ol></section>
        </div>
      </div>
      <div className={r.foot}>{actions}</div>
    </>
  )
}

export default function Review({ id: idArg }: { id?: string }) {
  useStore()
  const wide = useWide()
  const { tab, list, c, ready, wait, picked, setTab, count, anyReady } = useReviewModel(idArg, wide)

  // ↑↓·j/k 목록 이동, 1·2·3 판단, Z 되돌리기
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (S.ui.dialog || S.ui.palette || S.ui.help || /INPUT|TEXTAREA|SELECT/.test((document.activeElement as HTMLElement)?.tagName) || e.metaKey || e.ctrlKey || e.altKey) return
      if (/^[1-3]$/.test(e.key)) {
        const b = [...document.querySelectorAll<HTMLButtonElement>('[data-detail] button')].find(x => x.querySelector('kbd')?.textContent === e.key)
        if (b) { e.preventDefault(); b.click() }
        return
      }
      const dir = e.key === 'ArrowDown' || e.key === 'j' ? 1 : e.key === 'ArrowUp' || e.key === 'k' ? -1 : 0
      if (!dir) return
      const items = [...document.querySelectorAll<HTMLAnchorElement>('[data-row]')]
      if (!items.length) return
      e.preventDefault()
      const i = items.findIndex(a => a.getAttribute('aria-current') === 'true'), nx = items[Math.max(0, Math.min(items.length - 1, i + dir))]
      location.hash = nx.getAttribute('href')!
      requestAnimationFrame(() => document.querySelector('[data-row][aria-current="true"]')?.scrollIntoView({ block: 'nearest' }))
    }
    addEventListener('keydown', f)
    return () => removeEventListener('keydown', f)
  }, [])

  const rows = (xs: Case[]) => xs.map(x => <Row key={x.id} x={x} on={x.id === c?.id} pick={tab === 'opt'} />)
  return (
    <div className={clsx(r.wrap, idArg && r.has)}>
      <section className={clsx(r.pane, r.listPane)} aria-label="건 목록">
        <div className={r.listH}>
          <h1>위반 검토</h1>
          <Segmented label="목록" value={tab} onChange={setTab} items={[
            { k: 'req', t: '필수', n: count('req'), now: anyReady }, { k: 'opt', t: '선택', n: count('opt') }, { k: 'closed', t: '종결', n: count('closed') }]} />
        </div>
        {tab === 'opt' && picked.length > 0 && <div className={r.bulk}><b>{picked.length}건 골랐어요</b>
          <Button size="sm" variant="ghost" onClick={() => { S.ui.picked.clear(); emit() }}>해제</Button>
          <Button size="sm" variant="primary" onClick={() => openDialog({ kind: 'bulk', ids: picked })}>문제 없음으로 종결</Button></div>}
        <div className={r.list}>
          {!list.length ? <Empty icon={<Inbox size={20} />} title={tab === 'closed' ? '종결한 건이 없어요' : '검토할 건이 없어요'} />
            : tab === 'req' ? <>
              {ready.length > 0 && <><div className={r.lh}>사유 도착 · 지금 결론<span>{ready.length}</span></div>{rows(ready)}</>}
              {wait.length > 0 && <><div className={r.lh}>사유 기다리는 중<span>{wait.length}</span></div>{rows(wait)}</>}
            </> : rows(list)}
        </div>
      </section>
      <section className={clsx(r.pane, r.detailPane)} aria-label="건 상세" data-detail>
        {c ? <Detail key={c.id} c={c} /> : <Empty center icon={<Inbox size={20} />} title="건을 고르세요" text="왼쪽 목록에서 고르면 여기에 열려요" />}
      </section>
    </div>
  )
}
