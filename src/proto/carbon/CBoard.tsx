// Carbon 작업판: 흐름도(공용) + 지금 한 건 + 다음 목록
import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { Button, ContainedList, ContainedListItem, ProgressIndicator, ProgressStep, Tag, SkeletonText } from '@carbon/react'
import { ChevronRight, Renew } from '@carbon/icons-react'
import { useStore, groupKey, QUEUE_ORDER, QUEUE_NAME, ago, ent, demoReason, advanceBoard } from '../../domain/store'
import type { Case, FpGroup } from '../../domain/types'
import { useBoardModel } from '../../features/board/model'
import { connect } from '../../api/client'
import { refreshAcks } from '../../api/policy'
import { openDialog } from '../../features/dialogs'
import { Sentence, typesOf } from '../../ds'
import { partial } from '../../lib/util'
import { DECIDE, Flow, sentFp, useDecideKeys } from '../shared'

function Decide({ k, title, desc, onClick }: { k: string; title: string; desc: string; onClick: () => void }) {
  return <div className="c-dec"><Button kind="tertiary" size="md" onClick={onClick} data-decide={k} aria-keyshortcuts={k}><span className="c-k">{k}</span>{title}</Button><span>{desc}</span></div>
}

export default function CBoard() {
  useStore()
  useDecideKeys('board')
  const m = useBoardModel()
  const { live, includeTest, truncated, E, raw, caught, wait, opt, P, lastPub, work, SEL, acks, pc, loading, serverEmpty, Q, keyOf, cur, ci, eff, steps, decideCase, keepFp, select, pickItem, allOk, finishEffect, publishDone } = m
  const types = (c: Case) => typesOf(c).join(' · ')
  const other = QUEUE_ORDER.find(k => k !== SEL && work[k])
  const nextWork = serverEmpty
    ? <><Button kind="tertiary" size="md" renderIcon={Renew} onClick={() => connect()}>다시 불러오기</Button><Button kind="ghost" size="md" href="?api=off#home">예시 데이터로 보기</Button></>
    : other ? <Button kind="primary" size="md" renderIcon={ChevronRight} onClick={() => select(other)}>다음 할 일: {QUEUE_NAME[other]} {work[other]}건</Button> : null
  const empty = (t: string) => <div className="c-empty"><h3 className="cds--type-heading-02">{serverEmpty ? '서버에 최근 7일 이벤트가 아직 없어요' : t}</h3>{!other && !serverEmpty && <p>지금 처리할 일이 없어요</p>}<div className="c-row">{nextWork}</div></div>

  let body: ReactNode, side: ReactNode = null, sideTitle = '다음'
  if (loading) body = <SkeletonText paragraph lineCount={4} />
  else if (SEL === 'req' || SEL === 'opt') {
    const c = cur as Case | null
    body = c ? <>
      <div className="c-who">
        <div><b>{c.user}</b> <span className="c-sub">{c.dept} · {ago(c.time)}</span></div>
        <div>{types(c)} → <b>{c.ev.ai}</b></div>
        <div className="c-sub c-12">{c.ev.ver ? <>전송 당시 정책 <code>{c.ev.ver}</code> · </> : '지금 정책 기준 · '}{typesOf(c).map(t => `${t} ${ent(t)?.method ?? '—'}`).join(' · ')}</div>
        <a className="cds--link c-more" href={`#review/${c.id}`}>자세히</a>
      </div>
      <div className="c-text"><Sentence c={c} /></div>
      <dl className="c-kv"><dt>직원 사유</dt><dd>{c.reason?.text}</dd></dl>
      <div className="c-decide" data-coach="decide" data-decide-scope>
        {SEL === 'req' ? DECIDE.map(([k, t, d], i) => <Decide key={k} k={String(i + 1)} title={t} desc={d} onClick={() => decideCase(c, k)} />)
          : <><Decide k="1" title="위반으로 기록" desc="위반 이력이 남아요" onClick={() => decideCase(c, 'violation')} /><Decide k="2" title="문제 없음" desc="정당한 업무 사용으로 종결해요" onClick={() => decideCase(c, 'ok')} /></>}
      </div>
      <p className="c-sub c-12">{SEL === 'req' ? '1·2·3' : '1·2'} 판단 · ↑↓ 다른 건 · Z 되돌리기</p>
    </> : empty(SEL === 'req' ? '결론 낼 건이 없어요' : '확인할 건이 없어요')
    side = <>
      {(Q as Case[]).filter(x => x !== c).map(x => <ContainedListItem key={x.id} onClick={() => pickItem(x.id)} data-pick={x.id}><div className="c-li"><b>{x.user}</b><span>{ago(x.time)}</span></div><div className="c-sub c-12">{types(x)} → {x.ev.ai}</div></ContainedListItem>)}
      {SEL === 'req' && wait.map(x => <ContainedListItem key={x.id} action={live ? <Button kind="ghost" size="sm" onClick={() => openDialog({ kind: 'close', caseId: x.id })}>사유 없이 결론</Button> : <Button kind="ghost" size="sm" onClick={() => demoReason(x)}>사유 도착 · 데모</Button>}>
        <b>{x.user}</b><div className="c-sub c-12">사유 기다리는 중 · {ago(x.time)}</div></ContainedListItem>)}
    </>
  } else if (SEL === 'fp') {
    const g = cur as FpGroup | null
    body = g ? <>
      <div className="c-who"><div className="cds--type-heading-03">{partial(g.type, g.value)}</div><div className="c-sub">{g.type} · 신고 {g.refs.length}회 · 직원 {g.users.size}명</div></div>
      <div className="c-text">{sentFp(g)}</div>
      <div className="c-decide" data-coach="decide" data-decide-scope>
        <Decide k="1" title="탐지 결과 유지" desc="실제 개인정보가 맞아요" onClick={() => keepFp(g)} />
        <Decide k="2" title="탐지 제외 검토" desc="이 값만 앞으로 안 잡도록 초안에 추가" onClick={() => openDialog({ kind: 'exclude', groupKey: groupKey(g), onDone: advanceBoard })} />
      </div>
      <p className="c-sub c-12">1·2 판단 · ↑↓ 다른 값 · Z 되돌리기</p>
    </> : empty('처리할 신고가 없어요')
    side = (Q as FpGroup[]).filter(x => x !== g).map(x => <ContainedListItem key={groupKey(x)} onClick={() => pickItem(groupKey(x))} data-pick={groupKey(x)}><div className="c-li"><b>{partial(x.type, x.value)}</b><span>{x.refs.length}회</span></div><div className="c-sub c-12">{x.type}</div></ContainedListItem>)
  } else {
    sideTitle = '자동 변환 규칙'
    const pcRow = pc && <div className="c-row"><Tag type={acks?.rejected ? 'warm-gray' : acks?.applied ? 'green' : 'gray'}>{pc}</Tag>{live && <Button kind="ghost" size="sm" renderIcon={Renew} onClick={() => refreshAcks()}>새로고침</Button>}</div>
    body = eff ? <>
      <div className="cds--type-heading-05">원문 전송 {raw} → {raw - caught}</div>
      <p className="c-sub"><code>{lastPub}</code> 배포 · 지난 7일에 이 규칙이 있었다면</p>{pcRow}
      <div className="c-row"><Button kind="primary" size="md" renderIcon={ChevronRight} onClick={finishEffect}>다음 할 일</Button></div>
    </> : P.changes.length ? <>
      <ContainedList label={`배포 대기 변경 ${P.changes.length}개`} kind="on-page">{P.changes.map((c, i) => <ContainedListItem key={i}><div className="c-li"><span>{c.what}</span><span className="c-sub">{c.src}</span></div></ContainedListItem>)}</ContainedList>
      <div className="c-row"><Button kind="primary" size="md" data-coach="publish" onClick={() => openDialog({ kind: 'publish', onDone: publishDone })}>서명 후 배포하기</Button><Button kind="ghost" size="md" href="#policy">정책에서 보기</Button></div>
    </> : <><div className="c-empty"><h3 className="cds--type-heading-02">배포할 변경이 없어요</h3><p>{P.version === 'v0' ? '아직 서버에 배포한 정책이 없어요' : `${P.version} 배포됨`}</p><div className="c-row">{nextWork}</div></div>{pcRow}</>
    side = P.learned.slice().reverse().map((r, i) => <ContainedListItem key={i}><div className="c-li"><b>{r.type}</b><span>{r.live ? '적용 중' : '배포 대기'}</span></div><div className="c-sub c-12">{r.when} → {r.method}</div></ContainedListItem>)
  }
  const hasSide = !loading && (SEL === 'pol' ? P.learned.length > 0 : Q.length > 1 || (SEL === 'req' && wait.length > 0))

  return (
    <div className="c-board">
      <section className="c-tile c-flow">
        <div className="c-flowH"><h2 className="cds--type-heading-compact-01">흐름 · 최근 7일</h2>{live && includeTest && <Tag type="warm-gray" size="sm">시험 이벤트 포함</Tag>}{truncated && <Tag type="warm-gray" size="sm">일부만 불러옴</Tag>}<span className="c-sub c-12">{E.length}건</span></div>
        <Flow m={m} />
      </section>
      <div className={'c-panel' + (hasSide ? '' : ' solo')}>
        <section className="c-tile c-cur" aria-label="지금 한 건" data-panel data-coach="panel">
          <div className="c-ph">
            <h2 className="cds--type-heading-03">{QUEUE_NAME[SEL]}</h2>
            {Q.length > 1 && SEL !== 'pol' && <span className="c-sub c-12">{Q.length}건 중 {ci + 1}번째</span>}
            {SEL === 'opt' && opt.length > 1 && <Button kind="ghost" size="sm" onClick={allOk}>모두 문제 없음</Button>}
          </div>
          {steps && <ProgressIndicator className="c-steps" currentIndex={Math.max(0, steps.findIndex(s => s[1] === 'now'))} spaceEqually>
            {steps.map(([t, st]) => <ProgressStep key={t} label={t} complete={st === 'done'} current={st === 'now'} />)}
          </ProgressIndicator>}
          <motion.div key={SEL + ':' + (cur ? keyOf(cur) : 'none') + (eff ? ':eff' : '')} className="c-body" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}>{body}</motion.div>
        </section>
        {hasSide && <aside className="c-tile c-side" aria-label={sideTitle}><ContainedList label={sideTitle} kind="on-page" size="md">{side}</ContainedList></aside>}
      </div>
    </div>
  )
}
