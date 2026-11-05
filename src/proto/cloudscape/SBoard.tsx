// Cloudscape 작업판: 흐름도(공용) + 지금 한 건 + 다음 목록
import type { ReactNode } from 'react'
import Container from '@cloudscape-design/components/container'
import Header from '@cloudscape-design/components/header'
import Button from '@cloudscape-design/components/button'
import SpaceBetween from '@cloudscape-design/components/space-between'
import Box from '@cloudscape-design/components/box'
import Grid from '@cloudscape-design/components/grid'
import Steps from '@cloudscape-design/components/steps'
import StatusIndicator from '@cloudscape-design/components/status-indicator'
import Link from '@cloudscape-design/components/link'
import Badge from '@cloudscape-design/components/badge'
import Spinner from '@cloudscape-design/components/spinner'
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
  return <div className="s-dec"><Button fullWidth onClick={onClick} data-decide={k} ariaLabel={`${title} (${k})`}><span className="s-k">{k}</span>{title}</Button><Box variant="small" color="text-body-secondary">{desc}</Box></div>
}
function Item({ pick, title, meta, sub, action }: { pick?: string; title: ReactNode; meta?: ReactNode; sub: ReactNode; action?: ReactNode }) {
  return <li className="s-li" data-pick={pick}>
    <div className="s-lt">{pick ? <Link onFollow={e => { e.preventDefault() }} href="#home">{title}</Link> : <b>{title}</b>}{meta && <Box variant="small" color="text-body-secondary">{meta}</Box>}</div>
    <Box variant="small" color="text-body-secondary">{sub}</Box>{action}
  </li>
}

export default function SBoard() {
  useStore()
  useDecideKeys('board')
  const m = useBoardModel()
  const { live, includeTest, truncated, E, raw, caught, wait, opt, P, lastPub, work, SEL, acks, pc, loading, serverEmpty, Q, cur, ci, eff, steps, decideCase, keepFp, select, pickItem, allOk, finishEffect, publishDone } = m
  const types = (c: Case) => typesOf(c).join(' · ')
  const other = QUEUE_ORDER.find(k => k !== SEL && work[k])
  const nextWork = serverEmpty
    ? <SpaceBetween direction="horizontal" size="xs"><Button iconName="refresh" onClick={() => connect()}>다시 불러오기</Button><Button variant="link" href="?api=off#home">예시 데이터로 보기</Button></SpaceBetween>
    : other ? <Button variant="primary" iconName="angle-right" iconAlign="right" onClick={() => select(other)}>다음 할 일: {QUEUE_NAME[other]} {work[other]}건</Button> : null
  const empty = (t: string) => <Box textAlign="center" padding={{ vertical: 'l' }}><SpaceBetween size="s"><Box variant="strong">{serverEmpty ? '서버에 최근 7일 이벤트가 아직 없어요' : t}</Box>{!other && !serverEmpty && <Box color="text-body-secondary">지금 처리할 일이 없어요</Box>}{nextWork}</SpaceBetween></Box>
  const pickOn = (k: string) => (e: React.MouseEvent) => { if ((e.target as HTMLElement).closest('a')) pickItem(k) }

  let body: ReactNode, side: ReactNode = null, sideTitle = '다음', actions: ReactNode = null
  if (loading) body = <Spinner size="large" />
  else if (SEL === 'req' || SEL === 'opt') {
    const c = cur as Case | null
    if (SEL === 'opt' && opt.length > 1) actions = <Button onClick={allOk}>모두 문제 없음</Button>
    body = c ? <SpaceBetween size="l">
      <div className="s-who">
        <div><Box variant="strong" display="inline">{c.user}</Box> <Box variant="span" color="text-body-secondary">{c.dept} · {ago(c.time)}</Box></div>
        <div>{types(c)} → <b>{c.ev.ai}</b></div>
        <Box variant="small" color="text-body-secondary">{c.ev.ver ? <>전송 당시 정책 <Box variant="code" display="inline">{c.ev.ver}</Box> · </> : '지금 정책 기준 · '}{typesOf(c).map(t => `${t} ${ent(t)?.method ?? '—'}`).join(' · ')}</Box>
        <span className="s-more"><Link href={`#review/${c.id}`}>자세히</Link></span>
      </div>
      <div className="s-text"><Sentence c={c} /></div>
      <div className="s-kv"><Box variant="awsui-key-label">직원 사유</Box><div>{c.reason?.text}</div></div>
      <div className="s-decide" data-coach="decide" data-decide-scope>
        {SEL === 'req' ? DECIDE.map(([k, t, d], i) => <Decide key={k} k={String(i + 1)} title={t} desc={d} onClick={() => decideCase(c, k)} />)
          : <><Decide k="1" title="위반으로 기록" desc="위반 이력이 남아요" onClick={() => decideCase(c, 'violation')} /><Decide k="2" title="문제 없음" desc="정당한 업무 사용으로 종결해요" onClick={() => decideCase(c, 'ok')} /></>}
      </div>
      <Box variant="small" color="text-body-secondary">{SEL === 'req' ? '1·2·3' : '1·2'} 판단 · ↑↓ 다른 건 · Z 되돌리기</Box>
    </SpaceBetween> : empty(SEL === 'req' ? '결론 낼 건이 없어요' : '확인할 건이 없어요')
    side = <>
      {(Q as Case[]).filter(x => x !== c).map(x => <div key={x.id} onClick={pickOn(x.id)}><Item pick={x.id} title={x.user} meta={ago(x.time)} sub={`${types(x)} → ${x.ev.ai}`} /></div>)}
      {SEL === 'req' && wait.map(x => <Item key={x.id} title={x.user} meta={<StatusIndicator type="pending">사유 대기</StatusIndicator>} sub={`${types(x)} → ${x.ev.ai} · ${ago(x.time)}`}
        action={<div className="s-act">{live ? <Button variant="inline-link" onClick={() => openDialog({ kind: 'close', caseId: x.id })}>사유 없이 결론</Button> : <Button variant="inline-link" onClick={() => demoReason(x)}>사유 도착시키기 · 데모</Button>}</div>} />)}
    </>
  } else if (SEL === 'fp') {
    const g = cur as FpGroup | null
    body = g ? <SpaceBetween size="l">
      <div className="s-who"><Box variant="h3" padding="n">{partial(g.type, g.value)}</Box><Box color="text-body-secondary">{g.type} · 신고 {g.refs.length}회 · 직원 {g.users.size}명</Box></div>
      <div className="s-text">{sentFp(g)}</div>
      <div className="s-decide" data-coach="decide" data-decide-scope>
        <Decide k="1" title="탐지 결과 유지" desc="실제 개인정보가 맞아요" onClick={() => keepFp(g)} />
        <Decide k="2" title="탐지 제외 검토" desc="이 값만 앞으로 안 잡도록 초안에 추가" onClick={() => openDialog({ kind: 'exclude', groupKey: groupKey(g), onDone: advanceBoard })} />
      </div>
      <Box variant="small" color="text-body-secondary">1·2 판단 · ↑↓ 다른 값 · Z 되돌리기</Box>
    </SpaceBetween> : empty('처리할 신고가 없어요')
    side = (Q as FpGroup[]).filter(x => x !== g).map(x => <div key={groupKey(x)} onClick={pickOn(groupKey(x))}><Item pick={groupKey(x)} title={partial(x.type, x.value)} meta={`${x.refs.length}회`} sub={x.type} /></div>)
  } else {
    sideTitle = '자동 변환 규칙'
    const pcRow = pc && <SpaceBetween direction="horizontal" size="xs" alignItems="center"><StatusIndicator type={acks?.rejected ? 'warning' : acks?.applied ? 'success' : 'pending'}>{pc}</StatusIndicator>{live && <Button variant="inline-icon" iconName="refresh" ariaLabel="새로고침" onClick={() => refreshAcks()} />}</SpaceBetween>
    body = eff ? <SpaceBetween size="m">
      <Box variant="awsui-value-large">원문 전송 {raw} → {raw - caught}</Box>
      <Box color="text-body-secondary"><Box variant="code" display="inline">{lastPub}</Box> 배포 · 지난 7일에 이 규칙이 있었다면</Box>{pcRow}
      <Button variant="primary" iconName="angle-right" iconAlign="right" onClick={finishEffect}>다음 할 일</Button>
    </SpaceBetween> : P.changes.length ? <SpaceBetween size="m">
      <ul className="s-list">{P.changes.map((c, i) => <Item key={i} title={c.what} meta={c.src} sub="" />)}</ul>
      <SpaceBetween direction="horizontal" size="xs"><Button variant="primary" data-coach="publish" onClick={() => openDialog({ kind: 'publish', onDone: publishDone })}>서명 후 배포하기</Button><Button variant="link" href="#policy">정책에서 보기</Button></SpaceBetween>
    </SpaceBetween> : <SpaceBetween size="m">{empty('배포할 변경이 없어요')}<Box textAlign="center" color="text-body-secondary">{P.version === 'v0' ? '아직 서버에 배포한 정책이 없어요' : `${P.version} 배포됨`}</Box>{pcRow}</SpaceBetween>
    side = P.learned.slice().reverse().map((r, i) => <Item key={i} title={r.type} meta={r.live ? <StatusIndicator type="success">적용 중</StatusIndicator> : <StatusIndicator type="pending">배포 대기</StatusIndicator>} sub={`${r.when} → ${r.method}`} />)
  }
  const hasSide = !loading && (SEL === 'pol' ? P.learned.length > 0 : Q.length > 1 || (SEL === 'req' && wait.length > 0))
  const st = (s: string) => (s === 'done' ? 'success' : s === 'now' ? 'info' : 'pending') as 'success' | 'info' | 'pending'

  return (
    <SpaceBetween size="l">
      <Container disableContentPaddings header={<Header variant="h2" counter={`(${E.length})`} actions={<SpaceBetween direction="horizontal" size="xs">{live && includeTest && <Badge color="severity-medium">시험 이벤트 포함</Badge>}{truncated && <Badge color="severity-medium">일부만 불러옴</Badge>}</SpaceBetween>}>흐름 · 최근 7일</Header>}>
        <div className="s-flow"><Flow m={m} /></div>
      </Container>
      <Grid gridDefinition={hasSide ? [{ colspan: { default: 12, m: 8 } }, { colspan: { default: 12, m: 4 } }] : [{ colspan: 12 }]}>
        <div data-panel data-coach="panel">
          <Container header={<Header variant="h2" counter={Q.length > 1 && SEL !== 'pol' ? `(${ci + 1}/${Q.length})` : undefined} actions={actions}>{QUEUE_NAME[SEL]}</Header>}>
            <SpaceBetween size="l">
              {steps && <div className="s-steps"><Steps orientation="horizontal" steps={steps.map(([t, s]) => ({ header: t, status: st(s) }))} /></div>}
              {body}
            </SpaceBetween>
          </Container>
        </div>
        {hasSide && <Container header={<Header variant="h3">{sideTitle}</Header>} disableContentPaddings><ul className="s-list">{side}</ul></Container>}
      </Grid>
    </SpaceBetween>
  )
}
