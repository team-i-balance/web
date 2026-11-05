// 디자인 시스템 시안 공용: 흐름도(어느 시스템에도 없는 부품), 단축키, 작업판에 보여 줄 값.
// 데이터·동작은 features/*/model.ts 의 훅과 domain/store 만 쓴다. 모양은 각 시안의 CSS 변수(--pf-*)가 정한다.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { S, groupKey, QUEUE_NAME, type Queue } from '../domain/store'
import type { BoardModel } from '../features/board/model'
import type { Case, FpGroup } from '../domain/types'
import { partial, rpath } from '../lib/util'
import './flow.css'

// 시스템 부품은 data-* 를 바깥 요소에 붙이기도 해서, 안쪽 버튼을 찾아 누른다
const press = (el: HTMLElement | null) => (el && (el.matches('button') ? el : el.querySelector('button'))) as HTMLButtonElement | null

// ── 단축키: 1·2·3 판단([data-decide]), ↑↓ 다른 건. 키는 지금 화면(Board·Review)과 같다.
export function useDecideKeys(mode: 'board' | 'review') {
  useEffect(() => {
    let lock = 0
    const f = (e: KeyboardEvent) => {
      if (S.ui.dialog || S.ui.palette || S.ui.help || /INPUT|TEXTAREA|SELECT/.test((document.activeElement as HTMLElement)?.tagName) || e.metaKey || e.ctrlKey || e.altKey) return
      if (/^[1-3]$/.test(e.key)) {
        const btn = press(document.querySelector<HTMLElement>(`[data-decide-scope] [data-decide="${e.key}"]`))
        if (!btn) return
        e.preventDefault(); if (Date.now() < lock) return
        lock = Date.now() + 450; btn.click(); return
      }
      const dir = e.key === 'ArrowDown' || (mode === 'review' && e.key === 'j') ? 1 : e.key === 'ArrowUp' || (mode === 'review' && e.key === 'k') ? -1 : 0
      if (!dir) return
      if (mode === 'board') {
        const p = [...document.querySelectorAll<HTMLElement>('[data-pick]')]
        if (!p.length) return
        e.preventDefault(); press(dir > 0 ? p[0] : p[p.length - 1])?.click(); return
      }
      const items = [...document.querySelectorAll<HTMLElement>('[data-row]')]
      if (!items.length) return
      e.preventDefault()
      const i = items.findIndex(a => a.dataset.on === 'true'), nx = items[Math.max(0, Math.min(items.length - 1, i + dir))]
      location.hash = 'review/' + nx.dataset.row
    }
    addEventListener('keydown', f)
    return () => removeEventListener('keydown', f)
  }, [mode])
}

// ── 작업판에서 보여 줄 값(지금 Board.tsx 와 같은 계산)
export const DECIDE = [['violation', '위반으로 기록', '위반 이력이 남아요'], ['legit', '이번 건 예외 인정', '같은 입력 자동 변환 규칙 초안이 생겨요'], ['fp', '오탐으로 기록', '개인정보가 아닌 값을 잡았어요']] as const
export const sentFp = (g: FpGroup) => { const r = g.refs[0]; return r.e.tpl.replace(/\{(\d)\}/g, (_, j) => (r.e.items[+j] === r.it ? '⟪' + partial(g.type, r.it.orig) + '⟫' : '…')) }
export const keyOfItem = (sel: Queue, x: unknown) => (sel === 'fp' ? groupKey(x as FpGroup) : sel === 'pol' ? 'pol' : (x as Case).id)

// ── 흐름도: 노드 = 대기열. 폭에 맞춰 줄이고(최소 0.62배) 더 좁으면 가로로 민다.
const SW = 1120, SH = 236, W = 200, H = 76, AY = 28, BY = 160, PAD = 16
const cx = (x: number) => x + W / 2, my = (y: number) => y + H / 2
const POS: Record<string, [number, number]> = { in: [0, AY], conv: [300, AY], raw: [640, AY], fp: [200, BY], opt: [420, BY], req: [640, BY], pol: [920, BY] }

export function Flow({ m, unit = '건' }: { m: BoardModel; unit?: string }) {
  const { E, sens, pub, conf, raw, caught, fps, opt, req, ready, wait, P, lastPub, fresh, pc, work, SEL, select, acks } = m
  const box = useRef<HTMLDivElement>(null), [w, setW] = useState(0)
  useLayoutEffect(() => { const el = box.current; if (!el) return; const ro = new ResizeObserver(() => setW(el.clientWidth)); ro.observe(el); setW(el.clientWidth); return () => ro.disconnect() }, [])
  const scale = w ? Math.max(0.62, Math.min(1, (w - PAD * 2) / SW)) : 1, boxW = SW * scale, off = Math.max(PAD, (w - boxW) / 2)
  const N = [
    { id: 'in', l: 'AI 입력', v: E.length, s: '최근 7일' },
    { id: 'conv', l: '개인정보 변환', v: sens, s: `공개 ${pub} · 기밀 차단 ${conf}` },
    { id: 'raw', l: '원문 전송', v: lastPub && fresh.length ? `${raw} → ${raw - caught}` : raw, s: '사유 선택 건너뜀', danger: raw > 0, go: 'req' as Queue },
    { id: 'fp', l: '오탐 신고', v: fps.length, s: '잘못 잡힌 값', q: 'fp' as Queue },
    { id: 'opt', l: '선택 검토', v: opt.length, s: '사유 남기고 보냄', q: 'opt' as Queue },
    { id: 'req', l: '필수 검토', v: req.length, s: `판단 ${ready.length} · 사유 대기 ${wait.length}`, q: 'req' as Queue },
    { id: 'pol', l: '재발 방지 배포', v: P.changes.length ? `대기 ${P.changes.length}` : P.version, s: P.changes.length ? '서명 후 배포' : pc ?? '적용 중', q: 'pol' as Queue },
  ]
  const EG: [string, number[][]][] = [
    ['', [[W, my(AY)], [300, my(AY)]]], ['', [[500, my(AY)], [640, my(AY)]]],
    [raw ? 'hot' : '', [[cx(640), AY + H], [cx(640), BY]]], ['', [[330, AY + H], [330, BY]]], ['', [[470, AY + H], [470, BY]]],
    ['loop', [[840, my(BY)], [920, my(BY)]]], ['loop', [[cx(920), BY], [cx(920), 10], [400, 10], [400, AY]]],
  ]
  return (
    <div className="pf" ref={box} data-coach="flow" aria-label="흐름도">
      <div className="pf-box" style={{ width: boxW, height: SH * scale, marginLeft: off }}>
        <div className="pf-stage" style={{ width: SW, height: SH, transform: `scale(${scale})` }}>
          <svg className="pf-edges" width={SW} height={SH} aria-hidden="true">
            {EG.map(([c, p], i) => <path key={i} className={'pf-edge ' + c} d={rpath(p, 8)} />)}
            <path className="pf-edge sel" d={`M${cx(POS[SEL][0])},${POS[SEL][1] + H} V${SH}`} />
          </svg>
          <span className="pf-chip" style={{ left: 330, top: 128 }}>오탐</span>
          <span className="pf-chip" style={{ left: 470, top: 112 }}>업무상 필요</span>
          <span className="pf-chip" style={{ left: 660, top: 10 }}>배포 → 다음부터 자동 변환</span>
          {N.map(x => {
            const [lx, ly] = POS[x.id], q = x.q, n = q ? work[q] : 0, on = q === SEL
            const inner = <>
              <span className="pf-l">{x.l}{q && n > 0 && <span className="pf-n">할 일 {n}{unit}</span>}</span>
              <span className="pf-b"><span className={'pf-v' + (x.danger ? ' danger' : '')}>{x.v}</span><span className="pf-s">{x.s}</span></span>
              {x.id === 'pol' && !P.changes.length && acks && acks.devices > 0 && <span className="pf-m"><i style={{ width: `${(acks.applied / acks.devices) * 100}%` }} /></span>}
            </>
            const st = { left: lx, top: ly }
            if (!q && !x.go) return <div key={x.id} className="pf-node tile" style={st}>{inner}</div>
            if (x.go) return <button key={x.id} type="button" className="pf-node tile" style={st} onClick={() => select(x.go!)} aria-label={`${x.l} ${x.v}건, 필수 검토로`}>{inner}</button>
            return <button key={x.id} type="button" className={'pf-node act' + (n ? '' : ' idle') + (on ? ' on' : '')} style={st} onClick={() => select(q!)} aria-pressed={on} aria-label={`${x.l} ${x.v}${n ? `, 처리할 일 ${n}건` : ''}`}>{inner}</button>
          })}
        </div>
      </div>
    </div>
  )
}
export { QUEUE_NAME }
