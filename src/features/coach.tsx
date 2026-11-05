// 시연 순서(발표용): 3단계. 안내하는 곳을 밝게 띄우고 →·← 로 넘기며 Esc 로 닫는다.
import { useEffect, useLayoutEffect, useState } from 'react'
import { X } from 'lucide-react'
import { S, emit, useStore, boardWork } from '../domain/store'
import { Button } from '../ds'
import c from './coach.module.css'

// 판단할 건이 남은 칸(필수 → 오탐 → 선택). 다 끝났으면 필수 검토
const firstWork = () => { const w = boardWork(); return (['req', 'fp', 'opt'] as const).find(k => w[k]) || 'req' }
const STEPS = [
  { pre: () => { S.ui.sel = firstWork() }, sel: '[data-coach="flow"]', t: '흐름이 곧 작업판', x: '배지가 붙은 노드가 할 일이에요. 고른 노드 아래에 지금 한 건이 열려요.' },
  { pre: () => { S.ui.sel = firstWork() }, sel: '[data-coach="decide"]', alt: '[data-coach="panel"]', t: '한 건씩 결론', x: '위반 · 예외 인정 · 오탐 중 하나를 누르면 다음 건으로 넘어가요. 1·2·3 키도 돼요.' },
  { pre: () => { S.ui.sel = 'pol' }, sel: '[data-coach="publish"]', alt: '[data-coach="panel"]', t: '서명 후 배포 → 서버 적용', x: '배포하면 서버 탐지에 바로 적용되고, 이후 직원 입력부터 바뀐 정책으로 검사해요.' },
]

export function toggleCoach() { goto(S.ui.guide < 0 ? 0 : -1) }
function goto(i: number) {
  if (i >= STEPS.length) i = -1
  S.ui.guide = i
  if (i >= 0) { STEPS[i].pre(); if (location.hash !== '#home' && location.hash !== '') location.hash = 'home' }
  emit()
}

export function Coach() {
  useStore()
  const gi = S.ui.guide
  const [box, setBox] = useState<DOMRect | null>(null)
  useLayoutEffect(() => {
    if (gi < 0) { setBox(null); return }
    let raf = 0
    const s = STEPS[gi]
    const place = () => { const el = document.querySelector(s.sel) || (s.alt ? document.querySelector(s.alt) : null); setBox(el ? el.getBoundingClientRect() : null) }
    const t = setTimeout(() => { (document.querySelector(s.sel) || (s.alt ? document.querySelector(s.alt) : null))?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); place() }, 60)
    const loop = () => { place(); raf = requestAnimationFrame(loop) }
    raf = requestAnimationFrame(loop)
    return () => { clearTimeout(t); cancelAnimationFrame(raf) }
  }, [gi])
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (S.ui.guide < 0 || S.ui.dialog || /INPUT|TEXTAREA|SELECT/.test((document.activeElement as HTMLElement)?.tagName)) return
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); goto(S.ui.guide + 1) }
      else if ((e.key === 'ArrowLeft' || e.key === 'PageUp') && S.ui.guide > 0) { e.preventDefault(); goto(S.ui.guide - 1) }
      else if (e.key === 'Escape') goto(-1)
    }
    addEventListener('keydown', f)
    return () => removeEventListener('keydown', f)
  }, [])
  if (gi < 0) return null
  const s = STEPS[gi]
  return (
    <>
      {box && <div className={c.spot} style={{ left: box.left - 6, top: box.top - 6, width: box.width + 12, height: box.height + 12 }} aria-hidden="true" />}
      <aside className={c.card} aria-label="시연 순서">
        <div className={c.h}><span>시연 {gi + 1} / {STEPS.length}</span><Button variant="ghost" size="sm" iconOnly icon={<X size={16} />} aria-label="시연 닫기" onClick={() => goto(-1)} /></div>
        <b className={c.t}>{s.t}</b>
        <p className={c.x}>{s.x}</p>
        <div className={c.f}>
          <div className={c.dots}>{STEPS.map((_, i) => <i key={i} data-on={i === gi || undefined} data-done={i < gi || undefined} />)}</div>
          <Button size="sm" variant="ghost" onClick={() => { location.hash = 'home'; location.reload() }}>처음으로</Button>
          <Button size="sm" disabled={!gi} onClick={() => goto(gi - 1)}>이전</Button>
          <Button size="sm" variant="primary" onClick={() => goto(gi + 1)}>{gi === STEPS.length - 1 ? '마치기' : '다음'}</Button>
        </div>
      </aside>
    </>
  )
}
