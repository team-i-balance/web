// 작업판: 위는 흐름도(노드 = 대기열), 아래 트레이는 고른 노드의 '지금 한 건'. 노드에서 내려온 선이 트레이 꼬리로 이어진다.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { S, emit, useStore, openOf, fpGroups, groupKey, boardWork, QUEUE_ORDER, QUEUE_NAME, ago, ent, quickClose, fpKeep, demoReason, advanceBoard, closeCase, undoToast, type Queue } from '../domain/store'
import { openDialog } from '../ui/Dialogs'
import { connect } from '../api/client'
import { pcStatus, refreshAcks } from '../api/policy'
import { undoLast } from '../ui/Toasts'
import { SentText, StepBar, typesOf, type Step } from '../ui/common'
import { partial, rpath } from '../lib/util'
import type { Case, FpGroup } from '../domain/types'

const SW = 1216, SH = 300, W = 176, H = 88, AY = 40, BY = 200
const cx = (x: number) => x + W / 2, my = (y: number) => y + H / 2
const DECIDE = [['violation', '위반으로 기록', '위반 이력이 남아요'], ['legit', '이번 건 예외 인정', '같은 입력 자동 변환 규칙 초안이 생겨요'], ['fp', '오탐으로 기록', '탐지 개선 목록으로 가요']] as const


export default function Board() {
  useStore()
  const [leaving, setLeaving] = useState(false)
  const lock = useRef(0)
  const placed = useRef(false) // 화면에 처음 그릴 때는 꼬리가 왼쪽에서 쓸려 오지 않게
  const vp = useRef<HTMLDivElement>(null), stage = useRef<HTMLDivElement>(null), board = useRef<HTMLElement>(null)
  const tray = useRef<HTMLDivElement>(null), tail = useRef<HTMLSpanElement>(null), wireP = useRef<SVGPathElement>(null), wireA = useRef<SVGCircleElement>(null)

  // ── 데이터
  const wk = new Date(+S.now - 7 * 864e5)
  const E = S.events.filter(e => e.time >= wk), n = (f: (e: typeof E[number]) => boolean) => E.filter(f).length
  const pub = n(e => e.grade === 'O'), conf = n(e => e.grade === 'C'), sens = n(e => e.grade === 'S'), raw = n(e => e.action === 'raw')
  const req = openOf('req'), ready = req.filter(c => c.reason).sort((a, b) => +b.time - +a.time), wait = req.filter(c => !c.reason)
  const opt = openOf('opt').sort((a, b) => +b.time - +a.time), fps = fpGroups(true), P = S.policy
  const fresh = P.learned.filter(r => r.live && r.fresh).map(r => r.type)
  const caught = fresh.length ? E.filter(e => e.action === 'raw' && e.items.some(i => i.status === 'raw' && fresh.includes(i.type))).length : 0
  const work = boardWork()
  if (!S.ui.sel) S.ui.sel = QUEUE_ORDER.find(k => work[k]) || 'req'
  const SEL = S.ui.sel, lastPub = S.ui.lastPub

  const N = [
    { id: 'in', x: 0, y: AY, l: 'AI 입력', v: E.length, s: '최근 7일' },
    { id: 'conv', x: 260, y: AY, l: '개인정보 변환', v: sens, s: `공개 ${pub} · 기밀 차단 ${conf}` },
    { id: 'raw', x: 740, y: AY, l: '원문 전송', v: lastPub && fresh.length ? `${raw} → ${raw - caught}` : raw, s: '사유 선택 건너뜀', cls: raw ? 'danger' : '', go: 'req' as Queue },
    { id: 'fp', x: 140, y: BY, l: '오탐 신고', v: fps.length, s: '잘못 잡힌 값', w: work.fp, act: true },
    { id: 'opt', x: 380, y: BY, l: '선택 검토', v: opt.length, s: '사유 남기고 보냄', w: work.opt, act: true },
    { id: 'req', x: 740, y: BY, l: '필수 검토', v: req.length, s: `판단 가능 ${ready.length} · 사유 대기 ${wait.length}`, w: work.req, act: true },
    { id: 'pol', x: 1040, y: BY, l: '재발 방지 배포', v: P.changes.length ? `대기 ${P.changes.length}` : P.version, s: P.changes.length ? '서명 후 배포' : '적용 중', w: work.pol, act: true },
  ]
  const EG = [
    { c: 'main', p: [[W, my(AY)], [260, my(AY)]] },
    { c: 'main', p: [[260 + W, my(AY)], [740, my(AY)]] },
    { c: raw ? 'hot' : '', p: [[cx(740), AY + H], [cx(740), BY]] },
    { c: '', p: [[310, AY + H], [310, 164], [cx(140), 164], [cx(140), BY]] },
    { c: '', p: [[386, AY + H], [386, 164], [cx(380), 164], [cx(380), BY]] },
    { c: 'loop' + (P.changes.length ? ' on' : ''), p: [[740 + W, my(BY)], [1040, my(BY)]] },
    { c: 'loop' + (lastPub ? ' on' : ''), p: [[cx(1040), BY], [cx(1040), 14], [cx(260), 14], [cx(260), AY]] },
  ]
  const CH = [{ x: 262, y: 164, t: '오탐' }, { x: 428, y: 164, t: '업무상 필요' }, { x: 978, y: my(BY), t: '결론 → 규칙', cls: 'loop' }, { x: 760, y: 14, t: '배포 → 다음부터 자동 변환', cls: 'loop' }]

  // ── 트레이: 지금 한 건 + 다음
  type QItem = Case | FpGroup | typeof P.changes
  const Q: QItem[] = ({ req: ready, opt, fp: fps, pol: P.changes.length ? [P.changes] : [] } as Record<Queue, QItem[]>)[SEL] || []
  const keyOf = (x: QItem) => SEL === 'fp' ? groupKey(x as FpGroup) : SEL === 'pol' ? 'pol' : (x as Case).id
  const cur = Q.find(x => keyOf(x) === S.ui.cur[SEL]) || Q[0] || null
  if (cur) S.ui.cur[SEL] = keyOf(cur)
  const ci = cur ? Q.indexOf(cur) : -1
  const eff = SEL === 'pol' && !!lastPub && fresh.length > 0 && !P.changes.length

  const pc = pcStatus()
  const steps: Step[] | null = !cur && SEL !== 'pol' ? null : ({
    req: [['원문 전송', 'done'], ['사유 도착', 'done'], ['판단', 'now'], ['규칙 배포', 'next', '예외 인정일 때'], ['PC 적용', 'next']],
    opt: [['되돌림', 'done', '업무상 필요'], ['사유 남김', 'done'], ['확인', 'now'], ['종결', 'next']],
    fp: [['오탐으로 되돌림', 'done', `${(cur as FpGroup | null)?.refs?.length ?? 0}회`], ['판단', 'now'], ['배포', 'next', '제외할 때'], ['PC 적용', 'next']],
    pol: eff ? [['판단', 'done'], ['규칙 생성', 'done'], ['서명 후 배포', 'done', lastPub!], ['PC 적용', 'now', '5분 안에 받아요']]
      : P.changes.length ? [['판단', 'done'], ['규칙 생성', 'done', `${P.changes.length}건`], ['서명 후 배포', 'now'], ['PC 적용', 'next']]
      : [['서명 후 배포', 'done', P.version], ['PC 적용', pc && !S.api.pol?.acks?.applied ? 'now' : 'done', pc ?? undefined]],
  } as Record<Queue, Step[]>)[SEL]

  // ── 처리: 카드를 살짝 밀어낸 뒤 판단을 기록하고, 칸을 다 비우면 다음 할 일로
  const act = (fn: () => void) => { setLeaving(true); setTimeout(() => { fn(); setLeaving(false); advanceBoard() }, 200) }
  const decideCase = (c: Case, k: 'violation' | 'legit' | 'fp' | 'ok') => act(() => quickClose(c, k))
  const keep = (g: FpGroup) => act(() => fpKeep(g))
  const exclude = (g: FpGroup) => openDialog({ kind: 'exclude', groupKey: groupKey(g), onDone: advanceBoard })
  const allOk = () => {
    const list = [...opt]
    list.forEach(c => closeCase(c, { k: 'legit', cause: null, memo: '사유 확인', rule: null }))
    undoToast(`선택 검토 ${list.length}건 문제 없음`, () => { list.forEach(c => { c.status = 'open'; c.close = null }); S.ui.sel = 'opt' })
    advanceBoard()
  }
  const select = (q: Queue) => { S.ui.sel = q; emit() }
  const pickItem = (k: string) => { S.ui.cur[SEL] = k; emit() }

  // ── 단축키: 1·2·3 판단, ↑↓ 다른 건, Z 되돌리기
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (S.ui.dialog || /INPUT|TEXTAREA|SELECT/.test((document.activeElement as HTMLElement)?.tagName) || e.metaKey || e.ctrlKey || e.altKey) return
      const bs = [...document.querySelectorAll<HTMLButtonElement>('.nc-a .dbtn')]
      if (/^[1-3]$/.test(e.key) && bs[+e.key - 1]) { e.preventDefault(); if (Date.now() < lock.current) return; lock.current = Date.now() + 450; bs[+e.key - 1].click(); return }
      if ((e.key === 'z' || e.key === 'Z') && undoLast()) { e.preventDefault(); return }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const p = [...document.querySelectorAll<HTMLButtonElement>('.nexts [data-pick]')]
        if (!p.length) return
        e.preventDefault(); (e.key === 'ArrowDown' ? p[0] : p[p.length - 1]).click()
      }
    }
    addEventListener('keydown', f)
    return () => removeEventListener('keydown', f)
  }, [])

  // ── 확대·이동, 꼬리 위치, 연결선
  const view = useRef(S.ui.view)
  const wire = () => {
    const el = stage.current?.querySelector('.wn.sel'), p = wireP.current, a = wireA.current
    if (!el || !p || !a || !board.current || !vp.current || !tail.current) return
    const b = board.current.getBoundingClientRect(), r = el.getBoundingClientRect(), v = vp.current.getBoundingClientRect(), t = tail.current.getBoundingClientRect()
    if (r.bottom < v.top || r.top > v.bottom || r.right < v.left || r.left > v.right) { p.setAttribute('d', ''); a.setAttribute('r', '0'); return }
    const x1 = r.left + r.width / 2 - b.left, y1 = Math.min(r.bottom, v.bottom) - b.top, x2 = t.left + t.width / 2 - b.left, y2 = t.top + t.height / 2 - b.top, mid = (y1 + y2) / 2
    p.setAttribute('d', Math.abs(x1 - x2) < 4 ? `M${x1},${y1} V${y2}` : rpath([[x1, y1], [x1, mid], [x2, mid], [x2, y2]], 12))
    a.setAttribute('cx', String(x1)); a.setAttribute('cy', String(y1)); a.setAttribute('r', '5')
  }
  const raf = useRef(0)
  const follow = (ms: number) => { const t0 = performance.now(); cancelAnimationFrame(raf.current); const f = () => { wire(); if (performance.now() - t0 < ms) raf.current = requestAnimationFrame(f) }; f() }
  const placeTail = () => {
    const el = stage.current?.querySelector('.wn.sel'), tb = tray.current, tl = tail.current
    if (!el || !tb || !tl) return
    const b = tb.getBoundingClientRect(), r = el.getBoundingClientRect()
    if (!placed.current) tl.style.transition = 'none'
    tl.style.left = Math.min(Math.max(r.left + r.width / 2 - b.left, 40), b.width - 40) + 'px'
    if (!placed.current) { tl.getBoundingClientRect(); tl.style.transition = ''; placed.current = true }
  }
  const apply = (v: NonNullable<typeof S.ui.view>, anim = false) => {
    const st = stage.current; if (!st) return
    st.classList.toggle('anim', anim)
    st.style.transform = `translate(${v.x}px,${v.y}px) scale(${v.s})`
    view.current = S.ui.view = v
    placeTail(); follow(500)
  }
  const fit = (anim = false) => {
    const el = vp.current; if (!el) return
    const w = el.clientWidth - 64, h = el.clientHeight, s = Math.min(1.1, Math.max(.66, Math.min((w - 32) / SW, (h - 40) / SH)))
    let x = Math.max(16, (w - SW * s) / 2)
    if (SW * s > w - 16) { // 다 안 들어가면 고른 노드가 가운데 오게 (나머지는 끌어서 보기)
      const sel = stage.current?.querySelector<HTMLElement>('.wn.sel'), c = sel ? sel.offsetLeft + sel.offsetWidth / 2 : SW / 2
      x = Math.min(16, Math.max(w - SW * s - 16, w / 2 - c * s))
    }
    let y = Math.max(8, (h - SH * s) / 2)
    if (SH * s > h - 8) { // 세로로도 넘치면 고른 노드(아래 줄 할 일)가 다 보이게
      const sel = stage.current?.querySelector<HTMLElement>('.wn.sel'), b = sel ? sel.offsetTop + sel.offsetHeight + 16 : SH
      y = Math.min(8, h - b * s)
    }
    apply({ s, x, y }, anim)
  }
  const zoomAt = (ns: number, mx: number, myy: number) => {
    const v = view.current!; ns = Math.min(2, Math.max(.35, ns))
    apply({ s: ns, x: mx - ((mx - v.x) * ns) / v.s, y: myy - ((myy - v.y) * ns) / v.s, keep: true })
  }
  useLayoutEffect(() => { if (view.current?.keep) apply(view.current); else fit() })
  useEffect(() => {
    const el = vp.current; if (!el) return
    const onResize = () => fit()
    const onWheel = (e: WheelEvent) => { e.preventDefault(); const r = el.getBoundingClientRect(); zoomAt(view.current!.s * Math.exp(-e.deltaY * (e.ctrlKey ? .01 : .0015)), e.clientX - r.left, e.clientY - r.top) }
    let drag: null | { x: number; y: number; v: NonNullable<typeof S.ui.view> } = null
    const down = (e: PointerEvent) => { if ((e.target as HTMLElement).closest('button,a')) return; drag = { x: e.clientX, y: e.clientY, v: view.current! }; el.setPointerCapture(e.pointerId); el.classList.add('grab') }
    const move = (e: PointerEvent) => { if (drag) apply({ s: drag.v.s, x: drag.v.x + e.clientX - drag.x, y: drag.v.y + e.clientY - drag.y, keep: true }) }
    const up = () => { drag = null; el.classList.remove('grab') }
    const tl = tail.current, te = () => wire()
    addEventListener('resize', onResize); el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up)
    tl?.addEventListener('transitionend', te)
    return () => {
      removeEventListener('resize', onResize); el.removeEventListener('wheel', onWheel)
      el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up)
      tl?.removeEventListener('transitionend', te); cancelAnimationFrame(raf.current)
    }
  }, [])

  const hasNext = SEL === 'pol' ? P.learned.length > 0 : Q.length > 1 || (SEL === 'req' && wait.length > 0)
  const other = QUEUE_ORDER.find(k => k !== SEL && work[k])
  const nextWork = S.api.live && !S.api.count
    ? <><span className="sub">서버에 최근 7일 이벤트가 아직 없어요</span><div className="empty-acts"><button className="btn sm" onClick={() => connect()}>다시 불러오기</button><a className="btn sm ghost" href="?api=off#home">예시 데이터로 보기</a></div></>
    : other ? <button className="btn sm" onClick={() => select(other)}>다음 할 일: {QUEUE_NAME[other]} {work[other]}건</button> : null
  // ── 트레이 내용
  const types = (c: Case) => typesOf(c).join('·')
  const kbdHint = (t: string) => <div className="kbd-hint">{t}</div>
  let big: React.ReactNode, next: React.ReactNode = null, topAction: React.ReactNode = null
  if (SEL === 'req' || SEL === 'opt') {
    const c = cur as Case | null
    if (SEL === 'opt' && opt.length) topAction = <button className="btn sm" onClick={allOk}>모두 문제 없음</button>
    big = c ? <>
      <div className="nc-who"><b>{c.user}</b><span className="sub">{c.dept} · {ago(c.time)}</span><a className="qi-more" href={`#review/${c.id}`}>자세히</a></div>
      <div className="nc-t">{types(c)} → {c.ev.ai}</div>
      <div className="nc-p">전송 당시 정책 {c.ev.ver} · {typesOf(c).map((t, i) => <span key={t}>{i ? ' · ' : ''}{t} <b>{ent(t)?.method ?? '—'}</b> 필요</span>)}</div>
      <div className="nc-x"><SentText c={c} /></div>
      <div className="nc-r"><span className="nc-l">직원이 낸 설명</span>{c.reason?.text}</div>
      <div className="nc-a">
        {SEL === 'req'
          ? DECIDE.map(([k, t, d], i) => <button key={k} className="btn dbtn" aria-keyshortcuts={String(i + 1)} onClick={() => decideCase(c, k)}><span>{t}</span><small>{d}</small><kbd>{i + 1}</kbd></button>)
          : <>
            <button className="btn dbtn" aria-keyshortcuts="1" onClick={() => decideCase(c, 'violation')}><span>위반으로 기록</span><small>위반 이력이 남아요</small><kbd>1</kbd></button>
            <button className="btn p dbtn" aria-keyshortcuts="2" onClick={() => decideCase(c, 'ok')}><span>문제 없음</span><small>정당한 업무 사용으로 종결</small><kbd>2</kbd></button>
          </>}
        {kbdHint(SEL === 'req' ? '1·2·3 판단 · ↑↓ 다른 건 · Z 되돌리기' : '1·2 판단 · ↑↓ 다른 건 · Z 되돌리기')}
      </div>
    </> : <div className="empty"><b>{SEL === 'req' ? '결론 낼 건이 없어요' : '확인할 건이 없어요'}</b>{nextWork}</div>
    next = <>
      {(Q as Case[]).filter(x => x !== c).map(x => <button key={x.id} className="nx" data-pick={x.id} onClick={() => pickItem(x.id)}><b>{x.user}</b><span>{types(x)} → {x.ev.ai}</span><em>{ago(x.time)}</em></button>)}
      {SEL === 'req' && wait.length > 0 && <>
        <div className="nx-h">사유 대기 {wait.length}</div>
        {wait.map(x => <div key={x.id} className="nx dim"><b>{x.user}</b><span>{types(x)} → {x.ev.ai}</span>{S.api.live
          ? <button className="btn sm ghost" onClick={() => openDialog({ kind: 'close', caseId: x.id })}>사유 없이 결론</button>
          : <button className="btn sm ghost" onClick={() => demoReason(x)}>사유 도착시키기 · 데모</button>}</div>)}
      </>}
    </>
  } else if (SEL === 'fp') {
    const g = cur as FpGroup | null
    const sent = (g: FpGroup) => { const r = g.refs[0]; return r.e.tpl.replace(/\{(\d)\}/g, (_, j) => (r.e.items[+j] === r.it ? '⟪' + partial(g.type, r.it.orig) + '⟫' : '…')) }
    big = g ? <>
      <div className="nc-who"><b>{partial(g.type, g.value)}</b><span className="sub">{g.type} · 신고 {g.refs.length}회</span></div>
      <div className="nc-x">{sent(g)}</div>
      <div className="nc-a">
        <button className="btn dbtn" aria-keyshortcuts="1" onClick={() => keep(g)}><span>탐지 결과 유지</span><small>실제 개인정보가 맞아요</small><kbd>1</kbd></button>
        <button className="btn dbtn" aria-keyshortcuts="2" onClick={() => exclude(g)}><span>탐지 제외 검토</span><small>이 값만 앞으로 안 잡도록 정책 초안에 추가</small><kbd>2</kbd></button>
        {kbdHint('1·2 판단 · ↑↓ 다른 값 · Z 되돌리기')}
      </div>
    </> : <div className="empty"><b>처리할 신고가 없어요</b>{nextWork}</div>
    next = (Q as FpGroup[]).filter(x => x !== g).map(x => <button key={groupKey(x)} className="nx" data-pick={groupKey(x)} onClick={() => pickItem(groupKey(x))}><b>{partial(x.type, x.value)}</b><span>{x.type}</span><em>{x.refs.length}회</em></button>)
  } else {
    big = eff ? <>
      <div className="nc-big">원문 전송 {raw} → {raw - caught}</div>
      <div className="nc-who"><span className="sub">{lastPub} 배포 · 지난 7일에 이 규칙이 있었다면</span></div>
      {pc && <div className="nc-who"><span className="sub">{pc}</span><button className="btn sm ghost" onClick={() => refreshAcks()}>적용 현황 새로고침</button></div>}
      <div className="nc-a"><button className="btn p" onClick={() => { S.ui.lastPub = null; advanceBoard() }}>다음 할 일</button></div>
    </> : P.changes.length ? <>
      <div className="qlist">{P.changes.map((c, i) => <div className="chg" key={i}>{c.what}</div>)}</div>
      <div className="nc-a"><button className="btn p" id="pubBtn" onClick={() => openDialog({ kind: 'publish', onDone: () => { S.ui.lastPub = S.policy.version; emit() } })}>서명 후 배포</button></div>
    </> : <div className="empty"><b>배포할 변경이 없어요</b><span className="sub">{P.version === 'v0' ? '아직 서버에 배포한 정책이 없어요' : `${P.version} 배포됨`}{pc ? ` · ${pc}` : ''}</span>{pc && <button className="btn sm ghost" onClick={() => refreshAcks()}>적용 현황 새로고침</button>}{nextWork}</div>
    next = P.learned.slice().reverse().map((r, i) => <div key={i} className="nx static"><b>{r.type}</b><span>{r.when} → {r.method}</span><em>{r.live ? '적용 중' : '배포 대기'}</em></div>)
  }

  return (
    <section className="card board tray-board" ref={board}>
      <div className="bd-vp" ref={vp}>
        <div className="stage" ref={stage} style={{ width: SW, height: SH }}>
          <svg aria-hidden="true" style={{ width: SW, height: SH }}>{EG.map((e, i) => <path key={i} className={'bedge ' + e.c} d={rpath(e.p)} />)}</svg>
          {CH.map((c, i) => <span key={i} className={'bchip ' + (c.cls || '')} style={{ left: c.x, top: c.y }}>{c.t}</span>)}
          {N.map(x => {
            const cls = `wn ${x.cls || ''}${SEL === x.id ? ' sel' : ''}${x.act && !x.w ? ' idle' : ''}`
            const inner = <>{x.w ? <span className="wn-n">{x.w}</span> : null}<span className="wn-l">{x.l}</span><span className="wn-v">{x.v}</span><span className="wn-s">{x.s}</span></>
            return x.act || x.go
              ? <button key={x.id} className={cls} style={{ left: x.x, top: x.y }} onClick={() => select((x.go || x.id) as Queue)} aria-pressed={SEL === x.id} aria-label={`${x.l} ${x.v}${x.w ? `, 처리할 일 ${x.w}건` : ''}`}>{inner}</button>
              : <div key={x.id} className={cls} style={{ left: x.x, top: x.y }}>{inner}</div>
          })}
        </div>
        <div className="zoom">
          <button className="btn sm ghost" aria-label="확대" onClick={() => zoomAt(view.current!.s * 1.2, vp.current!.clientWidth / 2, vp.current!.clientHeight / 2)}>+</button>
          <button className="btn sm ghost" onClick={() => { S.ui.view = null; fit(true) }}>맞춤</button>
          <button className="btn sm ghost" aria-label="축소" onClick={() => zoomAt(view.current!.s / 1.2, vp.current!.clientWidth / 2, vp.current!.clientHeight / 2)}>−</button>
        </div>
      </div>
      <svg className="bwire" aria-hidden="true"><path ref={wireP} /><circle ref={wireA} r="0" /></svg>
      <div className="tray" ref={tray}>
        <span className="tail" ref={tail} />
        <div className={'tray-in' + (hasNext ? '' : ' solo')}>
          <section className="nowc" aria-label="지금 한 건">
            <div className="nc-h">
              <h2 className="h20">{QUEUE_NAME[SEL]}</h2>
              {Q.length > 1 && <div className="prog">{Q.slice(0, 12).map((_, i) => <i key={i} className={i === ci ? 'on' : ''} />)}<span>{Q.length}건 중 {ci + 1}번째</span></div>}
              {topAction}
            </div>
            {steps && <StepBar steps={steps} />}
            <div className={'nc-b' + (leaving ? ' out' : '')}>{big}</div>
          </section>
          <aside className="nexts" aria-label="다음">{hasNext && <><div className="nx-h">{SEL === 'pol' ? '규칙' : '다음'}</div>{next}</>}</aside>
        </div>
      </div>
    </section>
  )
}
