// 작업판: 위는 흐름도(노드 = 대기열), 아래는 고른 노드의 '지금 한 건'.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { ChevronRight, Inbox, RefreshCw, CircleCheck } from 'lucide-react'
import clsx from 'clsx'
import { S, useStore, groupKey, QUEUE_ORDER, QUEUE_NAME, ago, ent, advanceBoard, type Queue } from '../../domain/store'
import { useBoardModel } from './model'
import type { Case, FpGroup } from '../../domain/types'
import { connect } from '../../api/client'
import { applyLatest } from '../../api/policy'
import { requestReason } from '../../api/cases'
import { Button, DecideButton, Empty, LinkButton, Sentence, Skeleton, StepBar, Tag, typesOf } from '../../ds'
import { openDialog } from '../dialogs'
import { partial, rpath } from '../../lib/util'
import b from './board.module.css'

const SW = 1120, SH = 256, W = 200, H = 80, AY = 36, BY = 164, PAD = 24, TOP = 48
const cx = (x: number) => x + W / 2, my = (y: number) => y + H / 2
const POS: Record<string, [number, number]> = { in: [0, AY], conv: [300, AY], raw: [640, AY], fp: [200, BY], opt: [420, BY], req: [640, BY], pol: [920, BY] }
const DECIDE = [['violation', '위반으로 기록', '위반 이력이 남아요'], ['legit', '정당한 사용 · 규칙 추가', '업무상 필요했어요 · 이 항목을 서버 탐지에 더하는 규칙 초안이 생겨요'], ['fp', '오탐으로 기록', '이 건만 닫아요 · 탐지는 그대로예요']] as const
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
  return { scale, boxW, off }
}

export default function Board() {
  useStore()
  const scroller = useRef<HTMLDivElement>(null)
  const { scale, boxW, off } = useFit(scroller)
  const lock = useRef(0)

  const { live, includeTest, truncated, finishEffect, publishDone, E, pub, conf, confOut, sens, raw, req, wait, opt, fps, P, work, SEL, lastPub, now, behind, pc, loading, serverEmpty,
    Q, keyOf, cur, ci, eff, steps, decideCase, keepFp, select, pickItem, allOk } = useBoardModel()

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
    { id: 'in', l: 'AI 입력', v: E.length, s: '' },
    { id: 'conv', l: '개인정보 탐지', v: sens + conf, s: '', t: `민감 ${sens} · 기밀 ${conf}${confOut ? `(원문 전송 ${confOut})` : ''} · 공개 ${pub}` },
    { id: 'raw', l: '원문 전송', v: raw, s: '원문 그대로·되돌림', danger: raw > 0, go: 'req' as Queue },
    { id: 'fp', l: '오탐 신고', v: fps.length, s: '잘못 잡힌 값', q: 'fp' as Queue },
    { id: 'opt', l: '선택 검토', v: opt.length, s: '사유 남기고 보냄', q: 'opt' as Queue },
    { id: 'req', l: '필수 검토', v: req.length, s: wait.length ? `사유 없음 ${wait.length}` : '사유 없이 보냄', q: 'req' as Queue },
    { id: 'pol', l: '재발 방지 배포', v: P.changes.length ? `대기 ${P.changes.length}` : P.version, s: P.changes.length ? '서명 후 배포' : pc ?? (live ? '' : '연결 안 됨'), q: 'pol' as Queue },
  ]
  // 고른 대기열까지 들어오는 길은 강조색으로 이어 보인다
  // 원문 전송은 보낼 때 사유를 남겼는지에 따라 선택 검토(남김)와 필수 검토(안 남김)로 갈린다
  const PATH: Record<Queue, number[]> = { req: [0, 1, 2], opt: [0, 1, 4], fp: [0, 3], pol: [5, 6] }
  const onPath = new Set(PATH[SEL] ?? [])
  const EG: { c: string; p: number[][] }[] = [
    { c: '', p: [[W, my(AY)], [300, my(AY)]] },
    { c: '', p: [[500, my(AY)], [640, my(AY)]] },
    { c: raw ? b.edgeHot : '', p: [[cx(640), AY + H], [cx(640), BY]] },
    { c: '', p: [[330, AY + H], [330, BY]] },
    { c: '', p: [[700, AY + H], [700, (AY + H + BY) / 2], [cx(420), (AY + H + BY) / 2], [cx(420), BY]] },
    { c: b.edgeLoop, p: [[840, my(BY)], [920, my(BY)]] },
    { c: b.edgeLoop, p: [[cx(920), BY], [cx(920), 14], [400, 14], [400, AY]] },
  ].map((e, i) => (onPath.has(i) ? { ...e, c: clsx(e.c, b.edgePath) } : e))

  // ── 패널 내용
  const types = (c: Case) => typesOf(c).join(' · ')
  // 판단 화면 머리에 둘 단축키 안내
  const keyHint = (n: string, what = '건') => <span className={b.hint}>{n} 판단 · ↑↓ 다른 {what} · Z 되돌리기</span>
  const other = QUEUE_ORDER.find(k => k !== SEL && work[k])
  const nextWork = serverEmpty
    ? <><Button icon={<RefreshCw size={16} />} onClick={() => connect()}>다시 불러오기</Button></>
    : other ? <Button variant="primary" onClick={() => select(other)}>다음 할 일: {QUEUE_NAME[other]} {work[other]}건<ChevronRight size={16} /></Button> : null
  const empty = (title: string) => (
    <Empty icon={serverEmpty ? <Inbox size={20} /> : <CircleCheck size={20} />} title={serverEmpty ? '서버에 최근 7일 이벤트가 아직 없어요' : title}
      text={serverEmpty ? '직원 PC에서 AI에 입력하면 여기에 모여요' : other ? undefined : '지금 처리할 일이 없어요'}>{nextWork}{!other && !serverEmpty && E.length > 0 && <LinkButton variant="link" href="#insights">최근 입력 {E.length}건 보기<ChevronRight size={16} /></LinkButton>}</Empty>
  )

  let body: ReactNode, side: ReactNode = null, topAction: ReactNode = null, sideTitle = '다음'
  if (loading) {
    body = <div className={b.pb}><Skeleton w={220} h={18} /><Skeleton h={52} /><Skeleton w="70%" /><Skeleton h={64} /></div>
  } else if (SEL === 'req' || SEL === 'opt') {
    const c = cur as Case | null
    if (SEL === 'opt' && opt.length > 1) topAction = <Button size="sm" onClick={allOk}>모두 문제 없음</Button>
    if (c) topAction = <>{keyHint(SEL === 'req' ? '1·2·3' : '1·2')}{topAction}</>
    body = c ? (
      <div className={b.pb}>
        <div className={b.who}>
          <div className={b.whoT}><span><b className={b.name}>{c.user}</b><span className={b.meta}>{c.dept} · {ago(c.time)} · {c.ev.ai}</span></span></div>
          <a className={b.more} href={`#review/${c.id}`}>자세히<ChevronRight size={16} /></a>
        </div>
        <div className={b.text}><Sentence c={c} /></div>
        <div className={b.reason}><span>정책대로였다면</span><p className={b.polRow}>
          <span>{typesOf(c).map(t => `${t} ${ent(t)?.method ?? '—'}`).join(' · ')}</span>
          <span className={b.actual}>실제: 원문 전송</span>
          <span className={b.polVer}>{c.ev.ver ? `정책 ${c.ev.ver}` : '지금 정책'}</span></p></div>
        <div className={b.reason}><span>직원 사유</span>{c.reason?.text ? <p>{c.reason.text}</p>
          : c.reason?.pick === '오탐' ? <p>'오탐'이라며 원문을 보냈어요 · 개인정보가 아니면 '문제 없음'으로 닫으세요. 값 정보가 없어 탐지 제외로는 이어지지 않아요</p>
          : c.reason?.pick ? <p>사유 글 없이 '{c.reason.pick}'만 골랐어요</p>
          : <p className={clsx(b.none, b.row)}>{SEL === 'req' ? '사유가 없어요 · 직원 프로그램은 아직 나중에 사유를 받지 못해요' : '사유 없음'}{SEL === 'req' && <Button size="sm" variant="quiet" onClick={() => requestReason(c)}>사유 다시 요청</Button>}</p>}</div>
        <div className={b.decide} style={{ '--n': SEL === 'req' ? 3 : 2 } as React.CSSProperties} data-coach="decide">
          {SEL === 'req'
            ? DECIDE.map(([k, t, d], i) => <DecideButton key={k} title={t} desc={d} k={String(i + 1)} onClick={() => decideCase(c, k)} />)
            : <><DecideButton title="위반으로 기록" desc="위반 이력이 남아요" k="1" onClick={() => decideCase(c, 'violation')} />
              <DecideButton title="문제 없음" desc="정당한 업무 사용으로 종결해요" k="2" onClick={() => decideCase(c, 'ok')} /></>}
        </div>
      </div>
    ) : empty(SEL === 'req' ? '결론 낼 건이 없어요' : '확인할 건이 없어요')
    side = <>
      {(Q as Case[]).filter(x => x !== c).map(x => <button key={x.id} type="button" className={clsx(b.nx, SEL === 'req' && !x.reason && b.wait)} data-pick={x.id} onClick={() => pickItem(x.id)}><b>{x.user}<small>{ago(x.time)}</small></b><span>{types(x)} → {x.ev.ai}{SEL === 'req' && !x.reason && ' · 사유 없음'}</span></button>)}
    </>
  } else if (SEL === 'fp') {
    const g = cur as FpGroup | null
    if (g) topAction = keyHint('1·2', '값')
    const sent = (g: FpGroup) => { const r = g.refs[0]; return r.e.tpl.replace(/\{(\d)\}/g, (_, j) => (r.e.items[+j] === r.it ? '⟪' + partial(g.type, r.it.orig) + '⟫' : '…')) }
    body = g ? (
      <div className={b.pb}>
        <div className={b.who}>
          <div className={b.whoT}><b className={b.fpTitle}>{partial(g.type, g.value)}</b><span className={b.dest}>{g.type} · 신고 {g.refs.length}회 · 직원 {g.users.size}명</span></div>
        </div>
        <div className={b.text}><p>{sent(g)}</p></div>
        <div className={b.decide} style={{ '--n': 2 } as React.CSSProperties} data-coach="decide">
          <DecideButton title="탐지 결과 유지" desc="실제 개인정보가 맞아요" k="1" onClick={() => keepFp(g)} />
          <DecideButton title="탐지 제외 검토" desc="이 값만 앞으로 안 잡도록 초안에 추가" k="2" onClick={() => openDialog({ kind: 'exclude', groupKey: groupKey(g), onDone: advanceBoard })} />
        </div>
      </div>
    ) : empty('처리할 신고가 없어요')
    side = (Q as FpGroup[]).filter(x => x !== g).map(x => <button key={groupKey(x)} type="button" className={b.nx} data-pick={groupKey(x)} onClick={() => pickItem(groupKey(x))}><b>{partial(x.type, x.value)}<small>{x.refs.length}회</small></b><span>{x.type}</span></button>)
  } else {
    sideTitle = '자동 변환 규칙'
    const pcRow = pc && <div className={b.row}><Tag tone={behind ? 'warn' : 'ok'} dot>{pc}</Tag>{live && behind && <Button size="sm" variant="ghost" onClick={() => applyLatest()}>{P.version} 서버에 적용하기</Button>}</div>
    body = eff ? (
      <div className={b.pb}>
        {/* 지난 기록은 바뀌지 않는다. 효과는 이후 입력부터라, 추정치를 실측처럼 보여 주지 않고 배포한 내용만 보인다 */}
        <div className={b.big}>{lastPub} 배포</div>
        <ul className={b.effNote}>{(S.history.at(-1)?.changes ?? []).map((c, i) => <li key={i}>{c.what}</li>)}</ul>
        <p className={b.effNote}>이후 직원 입력부터 이 정책으로 검사해요. 지난 기록은 그대로예요.</p>
        {pcRow}
        <div className={clsx(b.row, b.rowGap)}><Button variant="primary" onClick={finishEffect}>다음 할 일<ChevronRight size={16} /></Button></div>
      </div>
    ) : P.changes.length ? (
      <div className={b.pb}>
        <div className={b.changes}>{P.changes.map((c, i) => <div key={i} className={b.change}>{c.what}<em>{c.src}</em></div>)}</div>
        <div className={clsx(b.row, b.rowGap)}>
          <Button variant="now" size="lg" data-coach="publish" onClick={() => openDialog({ kind: 'publish', onDone: publishDone })}>서명 후 배포하기</Button>
          <Button variant="link" onClick={() => { location.hash = 'policy' }}>정책에서 보기</Button>
        </div>
      </div>
    ) : (
      <div className={b.pb}>
        <Empty icon={<CircleCheck size={20} />} title="배포할 변경이 없어요" text={P.version === 'v0' ? '아직 서버에 배포한 정책이 없어요' : `${P.version} 배포됨`}>{nextWork}</Empty>
        {pcRow && <div className={b.pcPad}>{pcRow}</div>}
      </div>
    )
    side = P.learned.slice().reverse().map((r, i) => <div key={i} className={b.nx}><b>{r.type}<small>{r.live ? '배포됨' : '배포 대기'}</small></b><span>{r.when} → {r.method}</span></div>)
  }
  const hasSide = !loading && (SEL === 'pol' ? P.learned.length > 0 : Q.length > 1 || (SEL === 'req' && wait.length > 0))

  return (
    <div className={b.board}>
      <section className={b.flow} aria-label="흐름도" data-coach="flow">
        <div className={b.flowHead}><h2>처리 흐름</h2><span>입력은 최근 7일 · 검토는 열린 건 전체</span>{live && includeTest && <Tag tone="warn">시험 이벤트 포함</Tag>}{truncated && <Tag tone="warn">일부만 불러옴</Tag>}</div>
        <div className={b.scroller} ref={scroller}>
          <div className={b.stageBox} style={{ width: boxW, height: SH * scale + TOP, marginLeft: off, marginRight: off }}>
            <div className={b.stage} style={{ width: SW, height: SH, top: TOP, transform: `scale(${scale})` }}>
              <svg className={b.edges} width={SW} height={SH} aria-hidden="true">
                <defs>
                  <marker id="fa" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path className={b.arrow} d="M1 1 L7 4 L1 7" /></marker>
                  <marker id="fa-on" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path className={clsx(b.arrow, b.arrowOn)} d="M1 1 L7 4 L1 7" /></marker>
                </defs>
                {EG.map((e, i) => <path key={i} className={clsx(b.edge, e.c)} d={rpath(e.p, 12)} markerEnd={`url(#${onPath.has(i) ? 'fa-on' : 'fa'})`} />)}
              </svg>
              {N.map(x => {
                const [lx, ly] = POS[x.id], q = x.q, w = q ? work[q] : 0, isSel = q === SEL
                const inner = <>
                  <span className={b.nl}>{x.l}{q && w > 0 && (isSel || String(w) !== String(x.v)) && <span className={clsx(b.pill, isSel && b.pillNow)}>{isSel ? '지금' : '할 일'} {w}</span>}</span>
                  <span className={b.nb}><span className={clsx(b.nv, x.danger && b.danger)}>{x.v}</span><span className={b.ns}>{x.s}</span></span>
                </>
                if (!q && !x.go) return <div key={x.id} className={clsx(b.node, b.tile, x.danger && b.leak)} style={{ left: lx, top: ly }} title={x.t}>{inner}</div>
                if (x.go) return <button key={x.id} type="button" className={clsx(b.node, b.tile, x.danger && b.leak)} style={{ left: lx, top: ly }} onClick={() => select(x.go!)} aria-label={`${x.l} ${x.v}건, 필수 검토로`}>{inner}</button>
                return <button key={x.id} type="button" className={clsx(b.node, b.act, !w && b.idle, isSel && (now ? b.selNow : b.sel))} style={{ left: lx, top: ly }}
                  onClick={() => select(q!)} aria-pressed={isSel} aria-label={`${x.l} ${x.v}${w ? `, 처리할 일 ${w}건` : ''}`}>{inner}</button>
              })}
            </div>
          </div>
        </div>
      </section>
      <div className={clsx(b.panel, !hasSide && b.solo)}>
        <section className={clsx(b.main, now && b.mainNow)} aria-label="지금 한 건" data-panel data-coach="panel">
          <div className={b.ph}>
            <h2>{QUEUE_NAME[SEL]}</h2>
            {Q.length > 1 && SEL !== 'pol' && <span className={b.prog}>{Q.length}건 중 {ci + 1}번째</span>}
            <div className={b.phR}>{SEL === 'pol' && steps && <StepBar steps={steps} />}{topAction}</div>
          </div>
          <motion.div key={SEL + ':' + (cur ? keyOf(cur) : 'none') + (eff ? ':eff' : '')} style={{ flex: 1, display: 'flex', flexDirection: 'column' }} {...slide}>{body}</motion.div>
        </section>
        {hasSide && <aside className={b.side} aria-label={sideTitle}>{(SEL === 'pol' || Q.length > 1) && <div className={b.sideH}>{sideTitle}</div>}{side}</aside>}
      </div>
    </div>
  )
}
