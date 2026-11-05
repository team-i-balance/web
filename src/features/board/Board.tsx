// 작업판: 위는 흐름도(노드 = 대기열), 아래는 고른 노드의 '지금 한 건'. 고른 노드와 패널이 선으로 이어진다.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { ChevronRight, Inbox, RefreshCw, CircleCheck, Database } from 'lucide-react'
import clsx from 'clsx'
import { S, emit, useStore, openOf, fpGroups, groupKey, boardWork, QUEUE_ORDER, QUEUE_NAME, ago, ent, quickClose, fpKeep, demoReason, advanceBoard, closeCase, undoToast, type Queue } from '../../domain/store'
import type { Case, FpGroup } from '../../domain/types'
import { connect } from '../../api/client'
import { acksNow, pcStatus, refreshAcks } from '../../api/policy'
import { Button, DecideButton, Empty, LinkButton, Sentence, Skeleton, StepBar, Tag, typesOf, type Step } from '../../ds'
import { openDialog } from '../dialogs'
import { partial, rpath } from '../../lib/util'
import b from './board.module.css'

const SW = 1120, SH = 284, W = 200, H = 84, AY = 36, BY = 180, PAD = 20, TOP = 26
const cx = (x: number) => x + W / 2, my = (y: number) => y + H / 2
const POS: Record<string, [number, number]> = { in: [0, AY], conv: [300, AY], raw: [640, AY], fp: [200, BY], opt: [420, BY], req: [640, BY], pol: [920, BY] }
const DECIDE = [['violation', '위반으로 기록', '위반 이력이 남아요', true], ['legit', '이번 건 예외 인정', '같은 입력 자동 변환 규칙 초안이 생겨요', false], ['fp', '오탐으로 기록', '개인정보가 아닌 값을 잡았어요', false]] as const
const slide = { initial: { opacity: 0, x: 16 }, animate: { opacity: 1, x: 0 }, transition: { duration: 0.2, ease: [0.2, 0.8, 0.2, 1] as const } }

// 흐름도 크기: 폭에 맞춰 줄이고(최소 0.62배), 그보다 좁으면 가로로 밀어 본다
function useFit(ref: React.RefObject<HTMLDivElement | null>) {
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth)); ro.observe(el); setW(el.clientWidth)
    return () => ro.disconnect()
  }, [ref])
  const scale = w ? Math.max(0.62, Math.min(1, (w - PAD * 2) / SW)) : 1
  const boxW = SW * scale, off = Math.max(PAD, (w - boxW) / 2)
  return { scale, boxW, off, w }
}

export default function Board() {
  useStore()
  const scroller = useRef<HTMLDivElement>(null)
  const [scrollX, setScrollX] = useState(0)
  const { scale, boxW, off, w: vw } = useFit(scroller)
  const lock = useRef(0)

  // ── 데이터
  const wk = new Date(+S.now - 7 * 864e5)
  const E = S.events.filter(e => e.time >= wk), n = (f: (e: (typeof E)[number]) => boolean) => E.filter(f).length
  const pub = n(e => e.grade === 'O'), conf = n(e => e.grade === 'C'), sens = n(e => e.grade === 'S'), raw = n(e => e.action === 'raw')
  const req = openOf('req'), ready = req.filter(c => c.reason).sort((a, b2) => +b2.time - +a.time), wait = req.filter(c => !c.reason)
  const opt = openOf('opt').sort((a, b2) => +b2.time - +a.time), fps = fpGroups(true), P = S.policy
  const fresh = P.learned.filter(r => r.live && r.fresh).map(r => r.type)
  const caught = fresh.length ? E.filter(e => e.action === 'raw' && e.items.some(i => i.status === 'raw' && fresh.includes(i.type))).length : 0
  const work = boardWork()
  if (!S.ui.sel) S.ui.sel = QUEUE_ORDER.find(k => work[k]) || 'req'
  const SEL = S.ui.sel, lastPub = S.ui.lastPub, now = work[SEL] > 0
  const acks = acksNow(), pc = pcStatus()
  const loading = S.api.state === 'connecting'
  const serverEmpty = S.api.live && !S.api.count

  // ── 대기열과 지금 한 건
  type QItem = Case | FpGroup | typeof P.changes
  const Q: QItem[] = ({ req: ready, opt, fp: fps, pol: P.changes.length ? [P.changes] : [] } as Record<Queue, QItem[]>)[SEL] || []
  const keyOf = (x: QItem) => (SEL === 'fp' ? groupKey(x as FpGroup) : SEL === 'pol' ? 'pol' : (x as Case).id)
  const cur = Q.find(x => keyOf(x) === S.ui.cur[SEL]) || Q[0] || null
  if (cur) S.ui.cur[SEL] = keyOf(cur)
  const ci = cur ? Q.indexOf(cur) : -1
  const eff = SEL === 'pol' && !!lastPub && fresh.length > 0 && !P.changes.length

  const steps: Step[] | null = !cur && SEL !== 'pol' ? null : ({
    req: [['원문 전송', 'done'], ['사유 도착', 'done'], ['판단', 'now'], ['규칙 배포', 'next'], ['PC 적용', 'next']],
    opt: [['되돌림', 'done'], ['사유 남김', 'done'], ['확인', 'now'], ['종결', 'next']],
    fp: [['오탐으로 되돌림', 'done'], ['판단', 'now'], ['배포', 'next'], ['PC 적용', 'next']],
    pol: eff ? [['판단', 'done'], ['규칙 생성', 'done'], ['서명 후 배포', 'done'], ['PC 적용', 'now']]
      : P.changes.length ? [['판단', 'done'], ['규칙 생성', 'done'], ['서명 후 배포', 'now'], ['PC 적용', 'next']]
      : [['서명 후 배포', 'done'], ['PC 적용', acks && !acks.applied ? 'now' : 'done']],
  } as Record<Queue, Step[]>)[SEL]

  // ── 처리
  const act = (fn: () => void) => { fn(); advanceBoard() }
  // 사라지는 중인 카드에서 눌러도 이미 처리한 건은 다시 처리하지 않는다
  const decideCase = (c: Case, k: 'violation' | 'legit' | 'fp' | 'ok') => { if (c.status === 'open') act(() => quickClose(c, k)) }
  const keepFp = (g: FpGroup) => { if (g.refs.some(r => r.it.fp === 'open')) act(() => fpKeep(g)) }
  const select = (q: Queue) => { S.ui.sel = q; emit() }
  const pickItem = (k: string) => { S.ui.cur[SEL] = k; emit() }
  const allOk = () => {
    const list = [...opt]
    list.forEach(c => closeCase(c, { k: 'legit', cause: null, memo: '사유 확인', rule: null }))
    undoToast(`선택 검토 ${list.length}건 문제 없음`, () => { list.forEach(c => { c.status = 'open'; c.close = null }); S.ui.sel = 'opt' })
    advanceBoard()
  }

  // ── 단축키: 1·2·3 판단, ↑↓ 다른 건, Z 되돌리기
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (S.ui.dialog || S.ui.palette || S.ui.help || /INPUT|TEXTAREA|SELECT/.test((document.activeElement as HTMLElement)?.tagName) || e.metaKey || e.ctrlKey || e.altKey) return
      if (/^[1-3]$/.test(e.key)) {
        const btn = document.querySelector<HTMLButtonElement>(`[data-panel] [data-decide="${e.key}"]`)
        if (!btn) return
        e.preventDefault(); if (Date.now() < lock.current) return
        lock.current = Date.now() + 450; btn.click(); return
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const p = [...document.querySelectorAll<HTMLButtonElement>('[data-pick]')]
        if (!p.length) return
        e.preventDefault(); (e.key === 'ArrowDown' ? p[0] : p[p.length - 1]).click()
      }
    }
    addEventListener('keydown', f)
    return () => removeEventListener('keydown', f)
  }, [])

  // ── 흐름도
  const N = [
    { id: 'in', l: 'AI 입력', v: E.length, s: '최근 7일' },
    { id: 'conv', l: '개인정보 변환', v: sens, s: `공개 ${pub} · 기밀 차단 ${conf}` },
    { id: 'raw', l: '원문 전송', v: lastPub && fresh.length ? `${raw} → ${raw - caught}` : raw, s: '사유 선택 건너뜀', danger: raw > 0, go: 'req' as Queue },
    { id: 'fp', l: '오탐 신고', v: fps.length, s: '잘못 잡힌 값', q: 'fp' as Queue },
    { id: 'opt', l: '선택 검토', v: opt.length, s: '사유 남기고 보냄', q: 'opt' as Queue },
    { id: 'req', l: '필수 검토', v: req.length, s: `판단 가능 ${ready.length} · 사유 대기 ${wait.length}`, q: 'req' as Queue },
    { id: 'pol', l: '재발 방지 배포', v: P.changes.length ? `대기 ${P.changes.length}` : P.version, s: P.changes.length ? '서명 후 배포' : pc ?? '적용 중', q: 'pol' as Queue },
  ]
  const [sx] = POS[SEL]
  const EG: { c: string; p: number[][] }[] = [
    { c: '', p: [[W, my(AY)], [300, my(AY)]] },
    { c: '', p: [[500, my(AY)], [640, my(AY)]] },
    { c: raw ? b.edgeHot : '', p: [[cx(640), AY + H], [cx(640), BY]] },
    { c: '', p: [[330, AY + H], [330, BY]] },
    { c: '', p: [[470, AY + H], [470, BY]] },
    { c: clsx(b.edgeLoop, P.changes.length && b.edgeOn), p: [[840, my(BY)], [920, my(BY)]] },
    { c: clsx(b.edgeLoop, lastPub && b.edgeOn), p: [[cx(920), BY], [cx(920), 12], [400, 12], [400, AY]] },
  ]
  const bridgeX = Math.min(Math.max(off - scrollX + (sx + W / 2) * scale, 24), Math.max(24, vw - 24))

  // ── 패널 내용
  const types = (c: Case) => typesOf(c).join(' · ')
  const other = QUEUE_ORDER.find(k => k !== SEL && work[k])
  const nextWork = serverEmpty
    ? <><Button icon={<RefreshCw size={15} />} onClick={() => connect()}>다시 불러오기</Button><LinkButton variant="ghost" icon={<Database size={15} />} href="?api=off#home">예시 데이터로 보기</LinkButton></>
    : other ? <Button variant="primary" onClick={() => select(other)}>다음 할 일: {QUEUE_NAME[other]} {work[other]}건<ChevronRight size={15} /></Button> : null
  const empty = (title: string) => (
    <Empty icon={serverEmpty ? <Inbox size={20} /> : <CircleCheck size={20} />} title={serverEmpty ? '서버에 최근 7일 이벤트가 아직 없어요' : title}
      text={serverEmpty ? '직원 PC에서 AI에 입력하면 여기에 모여요' : other ? undefined : '지금 처리할 일이 없어요'}>{nextWork}</Empty>
  )

  let body: ReactNode, side: ReactNode = null, topAction: ReactNode = null, sideTitle = '다음'
  if (loading) {
    body = <div className={b.pb}><Skeleton w={220} h={18} /><Skeleton h={52} /><Skeleton w="70%" /><Skeleton h={64} /></div>
  } else if (SEL === 'req' || SEL === 'opt') {
    const c = cur as Case | null
    if (SEL === 'opt' && opt.length > 1) topAction = <Button size="sm" onClick={allOk}>모두 문제 없음</Button>
    body = c ? (
      <div className={b.pb}>
        <div className={b.who}>
          <span className={b.avatar} aria-hidden="true">{c.user.replace(/^직원 /, '').slice(0, 1)}</span>
          <div className={b.whoT}><b>{c.user} <span>{c.dept} · {ago(c.time)}</span></b><span>{types(c)} → <b>{c.ev.ai}</b></span>
            <small>전송 당시 정책 {c.ev.ver} · {typesOf(c).map(t => `${t} ${ent(t)?.method ?? '—'}`).join(' · ')}</small></div>
          <a className={b.more} href={`#review/${c.id}`}>자세히<ChevronRight size={14} /></a>
        </div>
        <div className={b.text}><Sentence c={c} /></div>
        <div className={b.reason}><span>직원 사유</span><p>{c.reason?.text}</p></div>
        <div className={b.decide} style={{ '--n': SEL === 'req' ? 3 : 2 } as React.CSSProperties} data-coach="decide">
          {SEL === 'req'
            ? DECIDE.map(([k, t, d, dg], i) => <DecideButton key={k} title={t} desc={d} k={String(i + 1)} danger={dg} onClick={() => decideCase(c, k)} />)
            : <><DecideButton title="위반으로 기록" desc="위반 이력이 남아요" k="1" danger onClick={() => decideCase(c, 'violation')} />
              <DecideButton title="문제 없음" desc="정당한 업무 사용으로 종결해요" k="2" onClick={() => decideCase(c, 'ok')} /></>}
        </div>
        <div className={b.hint}>{SEL === 'req' ? '1·2·3' : '1·2'} 판단 · ↑↓ 다른 건 · Z 되돌리기</div>
      </div>
    ) : empty(SEL === 'req' ? '결론 낼 건이 없어요' : '확인할 건이 없어요')
    side = <>
      {(Q as Case[]).filter(x => x !== c).map(x => <button key={x.id} type="button" className={b.nx} data-pick={x.id} onClick={() => pickItem(x.id)}><b>{x.user}<small>{ago(x.time)}</small></b><span>{types(x)} → {x.ev.ai}</span></button>)}
      {SEL === 'req' && wait.length > 0 && <>
        <div className={b.sideH}>사유 기다리는 중 <span>{wait.length}</span></div>
        {wait.map(x => <div key={x.id} className={clsx(b.nx, b.wait)}><b>{x.user}<small>{ago(x.time)}</small></b><span>{types(x)} → {x.ev.ai}</span>
          <div className={b.row}>{S.api.live
            ? <Button size="sm" onClick={() => openDialog({ kind: 'close', caseId: x.id })}>사유 없이 결론</Button>
            : <Button size="sm" variant="ghost" onClick={() => demoReason(x)}>사유 도착시키기 · 데모</Button>}</div></div>)}
      </>}
    </>
  } else if (SEL === 'fp') {
    const g = cur as FpGroup | null
    const sent = (g: FpGroup) => { const r = g.refs[0]; return r.e.tpl.replace(/\{(\d)\}/g, (_, j) => (r.e.items[+j] === r.it ? '⟪' + partial(g.type, r.it.orig) + '⟫' : '…')) }
    body = g ? (
      <div className={b.pb}>
        <div className={b.who}>
          <div className={b.whoT}><b style={{ fontSize: 'var(--t-20)' }}>{partial(g.type, g.value)}</b><span>{g.type} · 신고 {g.refs.length}회 · 직원 {g.users.size}명</span></div>
        </div>
        <div className={b.text}><p>{sent(g)}</p></div>
        <div className={b.decide} style={{ '--n': 2 } as React.CSSProperties} data-coach="decide">
          <DecideButton title="탐지 결과 유지" desc="실제 개인정보가 맞아요" k="1" onClick={() => keepFp(g)} />
          <DecideButton title="탐지 제외 검토" desc="이 값만 앞으로 안 잡도록 초안에 추가" k="2" onClick={() => openDialog({ kind: 'exclude', groupKey: groupKey(g), onDone: advanceBoard })} />
        </div>
        <div className={b.hint}>1·2 판단 · ↑↓ 다른 값 · Z 되돌리기</div>
      </div>
    ) : empty('처리할 신고가 없어요')
    side = (Q as FpGroup[]).filter(x => x !== g).map(x => <button key={groupKey(x)} type="button" className={b.nx} data-pick={groupKey(x)} onClick={() => pickItem(groupKey(x))}><b>{partial(x.type, x.value)}<small>{x.refs.length}회</small></b><span>{x.type}</span></button>)
  } else {
    sideTitle = '자동 변환 규칙'
    const pcRow = pc && <div className={b.row}><Tag tone={acks?.rejected ? 'warn' : acks?.applied ? 'ok' : undefined} dot>{pc}</Tag>{S.api.live && <Button size="sm" variant="ghost" icon={<RefreshCw size={14} />} onClick={() => refreshAcks()}>새로고침</Button>}</div>
    body = eff ? (
      <div className={b.pb}>
        <div className={b.big}>원문 전송 {raw} → <em>{raw - caught}</em></div>
        <p style={{ color: 'var(--sub)' }}>{lastPub} 배포 · 지난 7일에 이 규칙이 있었다면</p>
        {pcRow}
        <div className={b.row} style={{ marginTop: 'auto' }}><Button variant="primary" onClick={() => { S.ui.lastPub = null; advanceBoard() }}>다음 할 일<ChevronRight size={15} /></Button></div>
      </div>
    ) : P.changes.length ? (
      <div className={b.pb}>
        <div className={b.changes}>{P.changes.map((c, i) => <div key={i} className={b.change}>{c.what}<em>{c.src}</em></div>)}</div>
        <div className={b.row} style={{ marginTop: 'auto' }}>
          <Button variant="now" size="lg" data-coach="publish" onClick={() => openDialog({ kind: 'publish', onDone: () => { S.ui.lastPub = S.policy.version; emit() } })}>서명 후 배포하기</Button>
          <Button variant="ghost" onClick={() => { location.hash = 'policy' }}>정책에서 보기</Button>
        </div>
      </div>
    ) : (
      <div className={b.pb}>
        <Empty icon={<CircleCheck size={20} />} title="배포할 변경이 없어요" text={P.version === 'v0' ? '아직 서버에 배포한 정책이 없어요' : `${P.version} 배포됨`}>{nextWork}</Empty>
        {pcRow && <div style={{ padding: '0 32px' }}>{pcRow}</div>}
      </div>
    )
    side = P.learned.slice().reverse().map((r, i) => <div key={i} className={b.nx}><b>{r.type}<small>{r.live ? '적용 중' : '배포 대기'}</small></b><span>{r.when} → {r.method}</span></div>)
  }
  const hasSide = !loading && (SEL === 'pol' ? P.learned.length > 0 : Q.length > 1 || (SEL === 'req' && wait.length > 0))

  return (
    <div className={b.board}>
      <section className={b.flow} aria-label="흐름도" data-coach="flow">
        <div className={b.flowHead}>흐름 · 최근 7일</div>
        <div className={b.scroller} ref={scroller} onScroll={e => setScrollX(e.currentTarget.scrollLeft)}>
          <div className={b.stageBox} style={{ width: boxW, height: SH * scale + TOP, marginLeft: off, marginRight: off }}>
            <div className={b.stage} style={{ width: SW, height: SH, top: TOP, transform: `scale(${scale})` }}>
              <svg className={b.edges} width={SW} height={SH} aria-hidden="true">
                {EG.map((e, i) => <path key={i} className={clsx(b.edge, e.c)} d={rpath(e.p, 12)} />)}
                <path className={clsx(b.edge, b.edgeOn)} style={now ? undefined : { stroke: 'var(--fg)' }} d={`M${sx + W / 2},${POS[SEL][1] + H} V${SH}`} />
              </svg>
              <span className={b.chip} style={{ left: 330, top: 150 }}>오탐</span>
              <span className={b.chip} style={{ left: 470, top: 132 }}>업무상 필요</span>
              <span className={b.chip} style={{ left: 660, top: 12 }}>배포 → 다음부터 자동 변환</span>
              {N.map(x => {
                const [lx, ly] = POS[x.id], q = x.q, w = q ? work[q] : 0, isSel = q === SEL
                const inner = <>
                  <span className={b.nl}>{x.l}{q && w > 0 && <span className={clsx(b.pill, isSel && b.pillNow)}>{isSel ? '지금' : '할 일'} {w}</span>}</span>
                  <span className={b.nb}><span className={clsx(b.nv, x.danger && b.danger)}>{x.v}</span><span className={b.ns}>{x.s}</span></span>
                  {x.id === 'pol' && acks && acks.devices > 0 && <span className={b.nmeter}><i style={{ width: `${(acks.applied / acks.devices) * 100}%` }} /></span>}
                </>
                if (!q && !x.go) return <div key={x.id} className={clsx(b.node, b.tile)} style={{ left: lx, top: ly }}>{inner}</div>
                if (x.go) return <button key={x.id} type="button" className={clsx(b.node, b.tile)} style={{ left: lx, top: ly }} onClick={() => select(x.go!)} aria-label={`${x.l} ${x.v}건, 필수 검토로`}>{inner}</button>
                return <button key={x.id} type="button" className={clsx(b.node, b.act, !w && b.idle, isSel && (now ? b.selNow : b.sel))} style={{ left: lx, top: ly }}
                  onClick={() => select(q!)} aria-pressed={isSel} aria-label={`${x.l} ${x.v}${w ? `, 처리할 일 ${w}건` : ''}`}>{inner}</button>
              })}
            </div>
          </div>
        </div>
      </section>
      <div className={b.bridge} aria-hidden="true"><i className={clsx(now && b.now)} style={{ left: bridgeX }} /></div>
      <div className={clsx(b.panel, !hasSide && b.solo)}>
        <section className={clsx(b.main, now && b.mainNow)} aria-label="지금 한 건" data-panel data-coach="panel">
          <div className={b.ph}>
            <h2>{QUEUE_NAME[SEL]}</h2>
            {Q.length > 1 && SEL !== 'pol' && <><span className={b.pips} aria-hidden="true">{Q.slice(0, 10).map((_, i) => <i key={i} className={i === ci ? b.on : ''} />)}</span><span className={b.prog}>{Q.length}건 중 {ci + 1}번째</span></>}
            <div className={b.phR}>{steps && <StepBar steps={steps} />}{topAction}</div>
          </div>
          <motion.div key={SEL + ':' + (cur ? keyOf(cur) : 'none') + (eff ? ':eff' : '')} style={{ flex: 1, display: 'flex', flexDirection: 'column' }} {...slide}>{body}</motion.div>
        </section>
        {hasSide && <aside className={b.side} aria-label={sideTitle}><div className={b.sideH}>{sideTitle}</div>{side}</aside>}
      </div>
    </div>
  )
}
