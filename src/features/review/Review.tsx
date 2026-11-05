// 위반 검토: 왼쪽 건 목록(필수·선택·종결), 오른쪽 상세(사유·결론·보낸 내용·처리 기록)
import { useEffect, useState } from 'react'
import { ArrowLeft, Inbox, SlidersHorizontal } from 'lucide-react'
import clsx from 'clsx'
import { S, emit, useStore, ago, quickClose, reopen, ent } from '../../domain/store'
import { CAUSES, CONCLUSION } from '../../domain/defaults'
import type { Case, Conclusion } from '../../domain/types'
import { Button, Checkbox, DecideButton, Dot, Empty, LinkButton, Notice, Segmented, Sentence, Tag, ds, typesOf } from '../../ds'
import { openDialog } from '../dialogs'
import { useReviewModel } from './model'
import { loadCaseDetail, requestReason } from '../../api/cases'
import { hashOf } from '../../api/fp'
import { fmt, partial } from '../../lib/util'
import r from './review.module.css'

const useWide = () => {
  const [w, setW] = useState(innerWidth > 1100)
  useEffect(() => { const f = () => setW(innerWidth > 1100); addEventListener('resize', f); return () => removeEventListener('resize', f) }, [])
  return w
}

// 결론 점 색: 위반 빨강 · 정당한 사용 초록 · 오탐 회색
const DOT: Record<Conclusion, 'danger' | 'ok' | 'none'> = { violation: 'danger', legit: 'ok', fp: 'none' }

function Row({ x, on, pick }: { x: Case; on: boolean; pick: boolean }) {
  const counts = typesOf(x).map(t => [t, x.items.filter(i => i.type === t && i.status !== 'conv').length] as const)
  const closed = x.status === 'closed'
  return (
    <a className={clsx(r.row, !pick && r.rowNoCheck)} href={`#review/${x.id}`} aria-current={on} data-row>
      {pick && <Checkbox checked={S.ui.picked.has(x.id)} label={`${x.user} 고르기`} onChange={v => { v ? S.ui.picked.add(x.id) : S.ui.picked.delete(x.id); emit() }} />}
      <span className={r.who}>
        <span className={r.name}>{x.user}</span>
        <span className={r.dept}>{x.dept}</span>
        <span className={r.tags}>{counts.map(([t, n]) => <Tag key={t}>{t}{n > 1 ? ` ${n}` : ''}</Tag>)}</span>
      </span>
      <span className={r.when}>{x.ev.ai} · {ago(x.time)}</span>
      {(closed || x.reason) && <span className={r.snip}>
        {closed ? <><Dot tone={DOT[x.close!.k]}>{CONCLUSION[x.close!.k][0]}</Dot>{x.reason?.text ? ` “${x.reason.text}”` : x.reason ? ` ${x.reason.pick}` : ' 사유 없음'}</> : x.reason?.text || x.reason?.pick || '사유 없음'}
      </span>}
    </a>
  )
}

function Detail({ c }: { c: Case }) {
  useEffect(() => { loadCaseDetail(c) }, [c.id])
  const leaked = c.items.filter(i => i.status !== 'conv'), x = c.close, closed = c.status === 'closed'
  const decide = (k: 'violation' | 'legit' | 'fp' | 'ok') => { quickClose(c, k); emit() }
  const detail = <Button className={r.detailBtn} icon={<SlidersHorizontal size={16} />} onClick={() => openDialog({ kind: 'close', caseId: c.id })}>세부 설정으로 결론</Button>
  // 판단 버튼: 1·2·3 단축키는 버튼 안 kbd 글자로 찾는다(아래 keydown)
  const actions = closed ? <Button onClick={() => reopen(c)}>다시 열기</Button>
    : !c.reason ? <><Button variant="ghost" onClick={() => requestReason(c)}>사유 다시 요청</Button><Button variant="primary" onClick={() => openDialog({ kind: 'close', caseId: c.id })}>사유 없이 결론 내기</Button></>
    : c.need === 'opt' ? <><div className={r.decide}>
        <DecideButton title="위반으로 기록" desc="위반 이력이 남아요" k="1" onClick={() => decide('violation')} />
        <DecideButton title="문제 없음" desc="정당한 업무 사용으로 종결해요" k="2" onClick={() => decide('ok')} /></div>{detail}</>
    : <><div className={r.decide}>
        <DecideButton title="위반으로 기록" desc="위반 이력이 남아요" k="1" onClick={() => decide('violation')} />
        <DecideButton title="정당한 사용 · 규칙 추가" desc="업무상 필요했어요 · 이 항목을 서버 탐지에 더하는 규칙 초안이 생겨요" k="2" onClick={() => decide('legit')} />
        <DecideButton title="오탐으로 기록" desc="이 건만 닫아요 · 탐지는 그대로예요" k="3" onClick={() => decide('fp')} /></div>{detail}</>
  // 직원 처리 열: 행마다 처리가 섞일 때만
  const mixed = new Set(c.items.map(i => i.status)).size > 1
  const del = <span className={clsx(ds.mask, ds.maskDel)}>삭제</span>
  return (
    <>
      <div className={r.dh}>
        <div className={clsx(r.meta, !closed && r.metaBackOnly)}>
          <LinkButton className={r.back} variant="ghost" size="sm" href="#review" icon={<ArrowLeft size={16} />}>목록</LinkButton>
          {closed && <>{c.need === 'req' ? <Tag>필수</Tag> : <Tag>선택</Tag>}{x && <Dot tone={DOT[x.k]}>{CONCLUSION[x.k][0]}</Dot>}</>}
        </div>
        <h2>{c.ev.grade === 'C' && <Tag tone="danger">기밀</Tag>} {c.user} 님이 {leaked.map(i => i.type).join(', ')} 원문을 {c.ev.ai === 'AI 미전송' ? 'AI' : c.ev.ai}에 보냈어요</h2>
        <div className={r.metaT} title={ago(c.time)}>{fmt(c.time)}{c.ev.ver ? ` · 정책 ${c.ev.ver}` : ''}</div>
      </div>
      <div className={r.dbody}>
        <div className={r.col}>
          <section className={r.sec}><h3>직원 사유 {c.reason?.pick && <Tag>{c.reason.pick}</Tag>}</h3>
            {c.reason?.text ? <blockquote className={r.quote}>{c.reason.text}</blockquote>
              : c.reason?.pick === '오탐' ? <div className={r.note}>{c.items.some(i => hashOf(i.orig)) ? "'오탐'이라며 원문을 보냈어요 · 개인정보가 아니면 '문제 없음'으로 닫고, 값을 빼려면 오탐 신고에서 탐지 제외하세요" : "'오탐'이라며 원문을 보냈어요 · 개인정보가 아니면 '문제 없음'으로 닫으세요. 값 해시가 없어 탐지 제외로는 이어지지 않아요"}</div>
              : c.reason ? <div className={r.note}>사유 글 없이 '{c.reason.pick}'만 골랐어요</div>
              : <div className={r.note}>사유가 없어요 · 지금 직원 프로그램은 나중에 사유를 낼 방법이 없어요</div>}</section>
          {x && <section className={r.sec}><h3>보안팀 결론</h3>
            <div className={r.verdict}>
              <b><Dot tone={DOT[x.k]} />{CONCLUSION[x.k][0]}</b>
              {x.cause && <span>원인 · {CAUSES[x.cause].t}</span>}
              {x.memo && <span>판단 근거 · {x.memo}</span>}
              {x.rule && <span>재발 방지 · {x.rule}</span>}
            </div>
            {S.policy.changes.some(ch => ch.src === c.id) && <Notice tone="now" actions={<><LinkButton size="sm" variant="link" href="#policy">정책에서 보기</LinkButton><Button size="sm" variant="now" onClick={() => openDialog({ kind: 'publish' })}>서명 후 배포하기</Button></>}>규칙 초안이 배포를 기다려요 · 아직 서버 탐지에 적용 전</Notice>}
          </section>}
          <section className={r.sec}><h3>보낸 내용</h3>
            <div className={r.text}><Sentence c={c} /></div>
            {c.items.some(i => i.reason === '오탐') && <div className={r.note}>{c.items.filter(i => i.reason === '오탐').map(i => i.type).join(', ')} 항목은 "오탐"으로 되돌려 <a href="#fp">오탐 신고</a>에서 따로 처리해요</div>}
            <div className={r.tbox}><table className={clsx(ds.table, r.tbl)}><thead><tr><th>항목</th><th>나간 값</th><th>지금 정책</th>{mixed && <th>직원 처리</th>}</tr></thead><tbody>
              {c.items.map((it, i) => <tr key={i}><td className={r.type}>{it.type}</td>
                <td>{it.status === 'conv' ? (it.conv === '' ? del : <span className={r.pol}>{it.conv}</span>) : <span className={r.leak}>{partial(it.type, it.orig)}</span>}</td>
                {/* 서버에는 변환 결과가 없어 이 항목에 지금 정책이 정한 방식을 보인다 */}
                <td><span className={r.pol}>{ent(it.type) ? ent(it.type)!.method : '—'}</span></td>
                {mixed && <td>{it.status === 'conv' ? <Tag>변환 유지</Tag> : it.status === 'revert' ? <Tag>되돌림 · {it.reason}</Tag> : <Tag>원문 전송</Tag>}</td>}</tr>)}
            </tbody></table></div>
          </section>
          {c.timeline.length > 0 && <section className={r.sec}>
            {c.timeline.length <= 2
              ? <details className={r.fold}><summary><h3>기록 {c.timeline.length}</h3></summary><Timeline c={c} /></details>
              : <><h3>처리 기록</h3><Timeline c={c} /></>}
          </section>}
        </div>
      </div>
      <div className={r.foot}>{actions}</div>
    </>
  )
}

// 처리 기록: 직원·보안팀이 남긴 줄만(자동 생성 첫 줄 없음)
function Timeline({ c }: { c: Case }) {
  return <ol className={r.tl}>{c.timeline.map((e, i) => <li key={i} className={r.tli}><span>{fmt(e.t)} · {e.who}</span><b>{e.what}</b>{e.quote && <q>{e.quote}</q>}</li>)}</ol>
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
    <div className={ds.page}>
    <div className={ds.pageHead}>
      <h1>위반 검토</h1>
      <Segmented label="목록" value={tab} onChange={setTab} items={[
        { k: 'req', t: '필수', n: count('req'), now: anyReady }, { k: 'opt', t: '선택', n: count('opt') }, { k: 'closed', t: '종결', n: count('closed') }]} />
    </div>
    <div className={clsx(r.wrap, idArg && r.has)}>
      <section className={clsx(r.pane, r.listPane)} aria-label="건 목록">
        {tab === 'opt' && picked.length > 0 && <div className={r.bulk}><b>{picked.length}건 골랐어요</b>
          <Button size="sm" variant="ghost" onClick={() => { S.ui.picked.clear(); emit() }}>해제</Button>
          <Button size="sm" variant="primary" onClick={() => openDialog({ kind: 'bulk', ids: picked })}>문제 없음으로 종결</Button></div>}
        <div className={r.list}>
          {!list.length ? <Empty icon={<Inbox size={20} />} title={tab === 'closed' ? '종결한 건이 없어요' : '검토할 건이 없어요'} />
            : tab === 'req' ? <>
              {ready.length > 0 && <><div className={r.lh}>사유 도착 · 지금 결론<span className="num">{ready.length}</span></div>{rows(ready)}</>}
              {wait.length > 0 && <><div className={r.lh}>사유 없음<span className="num">{wait.length}</span></div>{rows(wait)}</>}
            </> : rows(list)}
        </div>
      </section>
      <section className={clsx(r.pane, r.detailPane)} aria-label="건 상세" data-detail>
        {c ? <Detail key={c.id} c={c} /> : <Empty center icon={<Inbox size={20} />} title="건을 고르세요" text="왼쪽 목록에서 고르면 여기에 열려요" />}
      </section>
    </div>
    </div>
  )
}
