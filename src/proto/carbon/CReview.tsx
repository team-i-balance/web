// Carbon 위반 검토: 왼쪽 목록(탭: 필수·선택·종결) · 오른쪽 상세(사유·결론·보낸 내용 표·사건 경로·처리 기록)
import { useEffect, useState } from 'react'
import { Button, Tabs, TabList, Tab, Tag, Checkbox, ProgressIndicator, ProgressStep, Table, TableHead, TableRow, TableHeader, TableBody, TableCell } from '@carbon/react'
import { ArrowLeft, Settings } from '@carbon/icons-react'
import { S, emit, useStore, ago, quickClose, reopen, demoReason } from '../../domain/store'
import { CAUSES, CONCLUSION } from '../../domain/seed'
import type { Case } from '../../domain/types'
import { useReviewModel, type Tab as RTab } from '../../features/review/model'
import { loadCaseDetail } from '../../api/cases'
import { openDialog } from '../../features/dialogs'
import { Sentence, typesOf } from '../../ds'
import { fmt, partial } from '../../lib/util'
import { useDecideKeys } from '../shared'

const TABS: RTab[] = ['req', 'opt', 'closed']
const useWide = () => { const [w, setW] = useState(innerWidth > 1100); useEffect(() => { const f = () => setW(innerWidth > 1100); addEventListener('resize', f); return () => removeEventListener('resize', f) }, []); return w }

function Row({ x, on, pick }: { x: Case; on: boolean; pick: boolean }) {
  const counts = typesOf(x).map(t => [t, x.items.filter(i => i.type === t && i.status !== 'conv').length] as const)
  return (
    <div className={'c-rrow' + (on ? ' on' : '')} data-row={x.id} data-on={on}>
      {pick && <Checkbox id={'pk-' + x.id} labelText="" hideLabel aria-label={`${x.user} 고르기`} checked={S.ui.picked.has(x.id)} onChange={(_, { checked }) => { checked ? S.ui.picked.add(x.id) : S.ui.picked.delete(x.id); emit() }} />}
      <a href={`#review/${x.id}`} aria-current={on || undefined}>
        <span className="c-li"><b>{x.user} <span className="c-sub c-12">{x.dept}</span></b><span className="c-sub c-12">{ago(x.time)}</span></span>
        <span className="c-tags">{counts.map(([t, n]) => <Tag key={t} type="gray" size="sm">{t}{n > 1 ? ` ${n}` : ''}</Tag>)}<Tag type="outline" size="sm">{x.ev.ai}</Tag></span>
        <span className="c-snip">{x.status === 'closed' ? <>{CONCLUSION[x.close!.k][0]}{x.reason ? ` · “${x.reason.text}”` : ' · 사유 미제출'}</> : x.reason ? x.reason.text : <span className="c-sub">사유 기다리는 중</span>}</span>
      </a>
    </div>
  )
}

function Detail({ c }: { c: Case }) {
  useEffect(() => { loadCaseDetail(c) }, [c.id])
  const leaked = c.items.filter(i => i.status !== 'conv'), x = c.close, closed = c.status === 'closed'
  const decide = (k: 'violation' | 'legit' | 'fp' | 'ok') => { quickClose(c, k); emit() }
  const D = ({ k, t, f }: { k: string; t: string; f: () => void }) => <Button kind="tertiary" size="md" onClick={f} data-decide={k}><span className="c-k">{k}</span>{t}</Button>
  const detail = <Button kind="ghost" size="md" renderIcon={Settings} onClick={() => openDialog({ kind: 'close', caseId: c.id })}>세부 설정으로 결론</Button>
  const actions = closed ? <><span /><Button kind="tertiary" size="md" onClick={() => reopen(c)}>다시 열기</Button></>
    : !c.reason ? <>{S.api.live ? <span /> : <Button kind="ghost" size="md" onClick={() => demoReason(c)}>사유 도착시키기 · 데모</Button>}<Button kind="primary" size="md" onClick={() => openDialog({ kind: 'close', caseId: c.id })}>사유 없이 결론 내기</Button></>
    : c.need === 'opt' ? <>{detail}<D k="1" t="위반으로 기록" f={() => decide('violation')} /><D k="2" t="문제 없음" f={() => decide('ok')} /></>
    : <>{detail}<D k="1" t="위반으로 기록" f={() => decide('violation')} /><D k="2" t="이번 건 예외 인정" f={() => decide('legit')} /><D k="3" t="오탐으로 기록" f={() => decide('fp')} /></>
  const rv = leaked.length
  const path: [string, string, 'done' | 'now' | 'bad' | ''][] = [
    ['입력', c.ev.ai, 'done'], ['탐지', `민감 ${c.items.length}개`, 'done'],
    ['직원 선택', c.need === 'req' ? '원문 전송' : `${rv}개 되돌림`, c.need === 'req' ? 'bad' : 'done'],
    ['직원 사유', c.reason ? c.reason.when : closed ? '미제출' : '기다리는 중', c.reason || closed ? 'done' : 'now'],
    ['보안팀 결론', closed ? CONCLUSION[x!.k][0] : c.reason ? '지금 차례' : '사유 도착 후', closed ? 'done' : c.reason ? 'now' : ''],
    ['재발 방지', closed && x!.rule ? '자동 변환 등록' : closed ? '없음' : '결론과 함께', closed && x!.rule ? 'done' : ''],
  ]
  const tl = [{ t: c.time, who: c.user, what: `${leaked.map(i => i.type).join(', ')} ${c.need === 'req' ? '원문 전송' : '되돌림'}`, quote: null as string | null }, ...c.timeline.map(e => ({ ...e, quote: e.quote ?? null }))]
  return (
    <>
      <div className="c-dh">
        <div className="c-row c-meta">
          <Button className="c-back" kind="ghost" size="sm" renderIcon={ArrowLeft} href="#review">목록</Button>
          {c.need === 'req' ? <Tag type="red" size="sm">필수</Tag> : <Tag type="gray" size="sm">선택</Tag>}
          {x ? <Tag type={x.k === 'violation' ? 'red' : x.k === 'legit' ? 'green' : 'gray'} size="sm">{CONCLUSION[x.k][0]}</Tag> : <Tag type={c.reason ? 'blue' : 'gray'} size="sm">{c.reason ? '결론 차례' : '사유 대기'}</Tag>}
        </div>
        <h2 className="cds--type-heading-04">{c.user} 님이 {leaked.map(i => i.type).join(', ')} 원문을 {c.ev.ai === 'AI 미전송' ? 'AI' : c.ev.ai}에 보냈어요</h2>
        <p className="c-sub">{c.dept} · <code>{fmt(c.time)}</code> ({ago(c.time)}){c.ev.ver ? <> · 정책 <code>{c.ev.ver}</code></> : ''} · <code>{c.id}</code></p>
      </div>
      <div className="c-dbody">
        <div className="c-col">
          <section><h3 className="c-h3">직원 사유 {c.reason && <span className="c-sub c-12">{c.reason.pick ? c.reason.pick + ' · ' : ''}{c.reason.when}</span>}</h3>
            {c.reason ? <blockquote className="c-text">{c.reason.text}</blockquote> : <p className="c-sub">직원 사유를 기다리고 있어요</p>}</section>
          {x && <section><h3 className="c-h3">보안팀 결론</h3><div className="c-text"><b>{CONCLUSION[x.k][0]}</b>
            {x.cause && <div>원인 · {CAUSES[x.cause].t}</div>}{x.memo && <div>판단 근거 · {x.memo}</div>}{x.rule && <div>재발 방지 · {x.rule}</div>}</div>
            {(x.rule || S.policy.changes.some(ch => ch.src === c.id)) && S.policy.changes.length > 0 && <div className="c-row c-next"><span>규칙 초안이 배포를 기다려요 · 아직 PC에 적용 전</span><Button kind="primary" size="sm" onClick={() => openDialog({ kind: 'publish' })}>서명 후 배포하기</Button></div>}
          </section>}
          <section><h3 className="c-h3">보낸 내용 <span className="c-sub c-12">원문은 일부만 보여요</span></h3>
            <div className="c-text"><Sentence c={c} /></div>
            <div className="c-tbox"><Table size="md" aria-label="항목별 처리">
              <TableHead><TableRow><TableHeader>항목</TableHeader><TableHeader>나간 값</TableHeader><TableHeader>정책대로였다면</TableHeader><TableHeader>직원 처리</TableHeader></TableRow></TableHead>
              <TableBody>{c.items.map((it, i) => <TableRow key={i}><TableCell className="c-nw">{it.type}</TableCell>
                <TableCell>{it.status === 'conv' ? <span className="c-sub">{it.conv || '(삭제)'}</span> : <span className="c-leak">{partial(it.type, it.orig)}</span>}</TableCell>
                <TableCell>{it.conv === '' ? <span className="c-sub">(삭제)</span> : it.conv}</TableCell>
                <TableCell>{it.status === 'conv' ? <Tag type="gray" size="sm">변환 유지</Tag> : it.status === 'revert' ? <Tag type="gray" size="sm">되돌림 · {it.reason}</Tag> : <Tag type="red" size="sm">원문 전송</Tag>}</TableCell></TableRow>)}</TableBody>
            </Table></div>
            {c.file && <p className="c-sub"><b>{c.file.name}</b> · {c.need === 'req' ? '원본 파일이 올라갔어요 · 숨은 정보 포함' : '변환 사본이 올라갔어요 · 숨은 정보 제거'}</p>}
          </section>
        </div>
        <div className="c-col">
          <section><h3 className="c-h3">사건 경로</h3>
            <ProgressIndicator vertical currentIndex={Math.max(0, path.findIndex(p => p[2] === 'now'))}>
              {path.map(([t, v, st]) => <ProgressStep key={t} label={t} secondaryLabel={v} complete={st === 'done'} current={st === 'now'} invalid={st === 'bad'} />)}
            </ProgressIndicator></section>
          <section><h3 className="c-h3">처리 기록</h3>
            <ol className="c-tl">{tl.map((e, i) => <li key={i}><span className="c-sub c-12"><code>{fmt(e.t)}</code> · {e.who}</span><b>{e.what}</b>{e.quote && <q>{e.quote}</q>}</li>)}</ol></section>
        </div>
      </div>
      <div className="c-foot" data-decide-scope>{actions}</div>
    </>
  )
}

export default function CReview({ id }: { id?: string }) {
  useStore()
  useDecideKeys('review')
  const wide = useWide()
  const { tab, list, c, ready, wait, picked, setTab, count } = useReviewModel(id, wide)
  const rows = (xs: Case[]) => xs.map(x => <Row key={x.id} x={x} on={x.id === c?.id} pick={tab === 'opt'} />)
  return (
    <div className={'c-review' + (id ? ' has' : '')}>
      <section className="c-tile c-list" aria-label="건 목록">
        <div className="c-lh"><h1 className="cds--type-heading-03">위반 검토</h1></div>
        <Tabs selectedIndex={TABS.indexOf(tab)} onChange={({ selectedIndex }) => setTab(TABS[selectedIndex])}>
          <TabList aria-label="목록" fullWidth>{TABS.map(k => <Tab key={k}>{{ req: '필수', opt: '선택', closed: '종결' }[k]} {count(k)}</Tab>)}</TabList>
        </Tabs>
        {tab === 'opt' && picked.length > 0 && <div className="c-row c-bulk"><b>{picked.length}건 골랐어요</b><Button kind="ghost" size="sm" onClick={() => { S.ui.picked.clear(); emit() }}>해제</Button><Button kind="primary" size="sm" onClick={() => openDialog({ kind: 'bulk', ids: picked })}>문제 없음으로 종결</Button></div>}
        <div className="c-rows">
          {!list.length ? <p className="c-sub c-pad">{tab === 'closed' ? '종결한 건이 없어요' : '검토할 건이 없어요'}</p>
            : tab === 'req' ? <>
              {ready.length > 0 && <><div className="c-lg"><span>사유 도착 · 지금 결론</span><span>{ready.length}</span></div>{rows(ready)}</>}
              {wait.length > 0 && <><div className="c-lg"><span>사유 기다리는 중</span><span>{wait.length}</span></div>{rows(wait)}</>}
            </> : rows(list)}
        </div>
      </section>
      <section className="c-tile c-detail" aria-label="건 상세" data-detail>
        {c ? <Detail key={c.id} c={c} /> : <p className="c-sub c-pad">왼쪽 목록에서 건을 고르세요</p>}
      </section>
    </div>
  )
}
