// Cloudscape 위반 검토: 왼쪽 표(필수·선택·종결) · 오른쪽 상세(사유·결론·보낸 내용 표·사건 경로·처리 기록)
import { useEffect, useState } from 'react'
import Container from '@cloudscape-design/components/container'
import Header from '@cloudscape-design/components/header'
import Button from '@cloudscape-design/components/button'
import SpaceBetween from '@cloudscape-design/components/space-between'
import Box from '@cloudscape-design/components/box'
import Grid from '@cloudscape-design/components/grid'
import Table from '@cloudscape-design/components/table'
import SegmentedControl from '@cloudscape-design/components/segmented-control'
import StatusIndicator from '@cloudscape-design/components/status-indicator'
import Steps from '@cloudscape-design/components/steps'
import Badge from '@cloudscape-design/components/badge'
import Link from '@cloudscape-design/components/link'
import { S, emit, useStore, ago, quickClose, reopen, demoReason, caseById } from '../../domain/store'
import { CAUSES, CONCLUSION } from '../../domain/seed'
import type { Case } from '../../domain/types'
import { useReviewModel, type Tab as RTab } from '../../features/review/model'
import { loadCaseDetail } from '../../api/cases'
import { openDialog } from '../../features/dialogs'
import { Sentence, typesOf } from '../../ds'
import { fmt, partial } from '../../lib/util'
import { useDecideKeys } from '../shared'

const useWide = () => { const [w, setW] = useState(innerWidth > 1100); useEffect(() => { const f = () => setW(innerWidth > 1100); addEventListener('resize', f); return () => removeEventListener('resize', f) }, []); return w }

function Detail({ c }: { c: Case }) {
  useEffect(() => { loadCaseDetail(c) }, [c.id])
  const leaked = c.items.filter(i => i.status !== 'conv'), x = c.close, closed = c.status === 'closed'
  const decide = (k: 'violation' | 'legit' | 'fp' | 'ok') => { quickClose(c, k); emit() }
  const D = ({ k, t, f }: { k: string; t: string; f: () => void }) => <Button onClick={f} data-decide={k}><span className="s-k">{k}</span>{t}</Button>
  const detail = <Button variant="link" iconName="settings" onClick={() => openDialog({ kind: 'close', caseId: c.id })}>세부 설정으로 결론</Button>
  const actions = closed ? <Button onClick={() => reopen(c)}>다시 열기</Button>
    : !c.reason ? <SpaceBetween direction="horizontal" size="xs">{!S.api.live && <Button variant="link" onClick={() => demoReason(c)}>사유 도착시키기 · 데모</Button>}<Button variant="primary" onClick={() => openDialog({ kind: 'close', caseId: c.id })}>사유 없이 결론 내기</Button></SpaceBetween>
    : <SpaceBetween direction="horizontal" size="xs">{detail}<D k="1" t="위반으로 기록" f={() => decide('violation')} />
      {c.need === 'opt' ? <D k="2" t="문제 없음" f={() => decide('ok')} /> : <><D k="2" t="이번 건 예외 인정" f={() => decide('legit')} /><D k="3" t="오탐으로 기록" f={() => decide('fp')} /></>}</SpaceBetween>
  const path: { header: string; details: string; status: 'success' | 'info' | 'error' | 'pending' }[] = [
    { header: '입력', details: c.ev.ai, status: 'success' }, { header: '탐지', details: `민감 ${c.items.length}개`, status: 'success' },
    { header: '직원 선택', details: c.need === 'req' ? '원문 전송' : `${leaked.length}개 되돌림`, status: c.need === 'req' ? 'error' : 'success' },
    { header: '직원 사유', details: c.reason ? c.reason.when : closed ? '미제출' : '기다리는 중', status: c.reason || closed ? 'success' : 'info' },
    { header: '보안팀 결론', details: closed ? CONCLUSION[x!.k][0] : c.reason ? '지금 차례' : '사유 도착 후', status: closed ? 'success' : c.reason ? 'info' : 'pending' },
    { header: '재발 방지', details: closed && x!.rule ? '자동 변환 등록' : closed ? '없음' : '결론과 함께', status: closed && x!.rule ? 'success' : 'pending' },
  ]
  const tl = [{ t: c.time, who: c.user, what: `${leaked.map(i => i.type).join(', ')} ${c.need === 'req' ? '원문 전송' : '되돌림'}`, quote: null as string | null }, ...c.timeline.map(e => ({ ...e, quote: e.quote ?? null }))]
  return (
    <Container
      header={<Header variant="h1"
        description={<>{c.dept} · <Box variant="code" display="inline">{fmt(c.time)}</Box> ({ago(c.time)}){c.ev.ver ? <> · 정책 <Box variant="code" display="inline">{c.ev.ver}</Box></> : ''} · <Box variant="code" display="inline">{c.id}</Box></>}
        info={<span className="s-tags">{c.need === 'req' ? <Badge color="red">필수</Badge> : <Badge color="grey">선택</Badge>}
          {x ? <StatusIndicator type={x.k === 'violation' ? 'error' : x.k === 'legit' ? 'success' : 'stopped'}>{CONCLUSION[x.k][0]}</StatusIndicator> : <StatusIndicator type={c.reason ? 'info' : 'pending'}>{c.reason ? '결론 차례' : '사유 대기'}</StatusIndicator>}</span>}>
        <span className="s-back"><Link href="#review">← 목록</Link></span>{c.user} 님이 {leaked.map(i => i.type).join(', ')} 원문을 {c.ev.ai === 'AI 미전송' ? 'AI' : c.ev.ai}에 보냈어요</Header>}
      footer={<div className="s-foot" data-decide-scope>{actions}</div>}>
      <Grid gridDefinition={[{ colspan: { default: 12, l: 8 } }, { colspan: { default: 12, l: 4 } }]}>
        <SpaceBetween size="l">
          <SpaceBetween size="xs"><Box variant="awsui-key-label">직원 사유 {c.reason && <Box variant="small" display="inline" color="text-body-secondary">{c.reason.pick ? c.reason.pick + ' · ' : ''}{c.reason.when}</Box>}</Box>
            {c.reason ? <div className="s-text">{c.reason.text}</div> : <Box color="text-body-secondary">직원 사유를 기다리고 있어요</Box>}</SpaceBetween>
          {x && <SpaceBetween size="xs"><Box variant="awsui-key-label">보안팀 결론</Box><div className="s-text"><b>{CONCLUSION[x.k][0]}</b>
            {x.cause && <div>원인 · {CAUSES[x.cause].t}</div>}{x.memo && <div>판단 근거 · {x.memo}</div>}{x.rule && <div>재발 방지 · {x.rule}</div>}</div>
            {(x.rule || S.policy.changes.some(ch => ch.src === c.id)) && S.policy.changes.length > 0 && <SpaceBetween direction="horizontal" size="xs" alignItems="center"><StatusIndicator type="pending">규칙 초안이 배포를 기다려요 · 아직 PC에 적용 전</StatusIndicator><Button variant="primary" onClick={() => openDialog({ kind: 'publish' })}>서명 후 배포하기</Button></SpaceBetween>}
          </SpaceBetween>}
          <SpaceBetween size="xs"><Box variant="awsui-key-label">보낸 내용 <Box variant="small" display="inline" color="text-body-secondary">원문은 일부만 보여요</Box></Box>
            <div className="s-text"><Sentence c={c} /></div>
            <Table variant="borderless" items={c.items} ariaLabels={{ tableLabel: '항목별 처리' }} columnDefinitions={[
              { id: 't', header: '항목', cell: it => it.type },
              { id: 'o', header: '나간 값', cell: it => it.status === 'conv' ? <Box color="text-body-secondary">{it.conv || '(삭제)'}</Box> : <Box color="text-status-error" fontWeight="bold">{partial(it.type, it.orig)}</Box> },
              { id: 'p', header: '정책대로였다면', cell: it => it.conv === '' ? <Box color="text-body-secondary">(삭제)</Box> : it.conv },
              { id: 's', header: '직원 처리', cell: it => it.status === 'conv' ? <StatusIndicator type="success">변환 유지</StatusIndicator> : it.status === 'revert' ? <StatusIndicator type="stopped">되돌림 · {it.reason}</StatusIndicator> : <StatusIndicator type="error">원문 전송</StatusIndicator> },
            ]} />
            {c.file && <Box color="text-body-secondary"><b>{c.file.name}</b> · {c.need === 'req' ? '원본 파일이 올라갔어요 · 숨은 정보 포함' : '변환 사본이 올라갔어요 · 숨은 정보 제거'}</Box>}
          </SpaceBetween>
        </SpaceBetween>
        <SpaceBetween size="l">
          <SpaceBetween size="xs"><Box variant="awsui-key-label">사건 경로</Box><Steps steps={path} /></SpaceBetween>
          <SpaceBetween size="xs"><Box variant="awsui-key-label">처리 기록</Box>
            <ol className="s-tl">{tl.map((e, i) => <li key={i}><Box variant="small" color="text-body-secondary"><Box variant="code" display="inline">{fmt(e.t)}</Box> · {e.who}</Box><b>{e.what}</b>{e.quote && <q>{e.quote}</q>}</li>)}</ol></SpaceBetween>
        </SpaceBetween>
      </Grid>
    </Container>
  )
}

export default function SReview({ id }: { id?: string }) {
  useStore()
  useDecideKeys('review')
  const wide = useWide()
  const { tab, list, c, picked, setTab, count } = useReviewModel(id, wide)
  const pickedCases = picked.map(caseById).filter((x): x is Case => !!x)
  const listPane = (
    <Table
      variant="container" stickyHeader
      header={<Header variant="h1" counter={`(${list.length})`}
        actions={tab === 'opt' && picked.length > 0 ? <Button variant="primary" onClick={() => openDialog({ kind: 'bulk', ids: picked })}>{picked.length}건 문제 없음으로 종결</Button> : undefined}>위반 검토</Header>}
      filter={<SegmentedControl label="목록" selectedId={tab} onChange={({ detail }) => setTab(detail.selectedId as RTab)}
        options={[{ id: 'req', text: `필수 ${count('req')}` }, { id: 'opt', text: `선택 ${count('opt')}` }, { id: 'closed', text: `종결 ${count('closed')}` }]} />}
      items={list} trackBy="id"
      selectionType={tab === 'opt' ? 'multi' : 'single'}
      selectedItems={tab === 'opt' ? pickedCases : c ? [c] : []}
      onSelectionChange={({ detail }) => {
        if (tab === 'opt') { S.ui.picked.clear(); detail.selectedItems.forEach(x => S.ui.picked.add(x.id)); emit() }
        else if (detail.selectedItems[0]) location.hash = 'review/' + detail.selectedItems[0].id
      }}
      onRowClick={({ detail }) => { location.hash = 'review/' + detail.item.id }}
      ariaLabels={{ tableLabel: '건 목록', selectionGroupLabel: '건 고르기', itemSelectionLabel: (_, x) => `${x.user} 고르기`, allItemsSelectionLabel: () => '모두 고르기' }}
      columnDefinitions={[
        { id: 'u', header: '직원', cell: x => <span data-row={x.id} data-on={x.id === c?.id}><b>{x.user}</b> <Box variant="small" display="inline" color="text-body-secondary">{x.dept}</Box></span> },
        { id: 'i', header: '항목 → AI', cell: x => `${typesOf(x).join(', ')} → ${x.ev.ai}` },
        { id: 's', header: '상태', cell: x => x.status === 'closed' ? CONCLUSION[x.close!.k][0] : x.reason ? <StatusIndicator type="info">사유 도착</StatusIndicator> : <StatusIndicator type="pending">사유 대기</StatusIndicator> },
        { id: 'w', header: '시각', cell: x => ago(x.time) },
      ]}
      empty={<Box textAlign="center" color="text-body-secondary">{tab === 'closed' ? '종결한 건이 없어요' : '검토할 건이 없어요'}</Box>}
    />
  )
  if (!wide) return id && c ? <div data-detail><Detail key={c.id} c={c} /></div> : listPane
  return (
    <Grid gridDefinition={[{ colspan: 5 }, { colspan: 7 }]}>
      {listPane}
      <div data-detail>{c ? <Detail key={c.id} c={c} /> : <Container><Box textAlign="center" color="text-body-secondary">왼쪽 목록에서 건을 고르세요</Box></Container>}</div>
    </Grid>
  )
}
