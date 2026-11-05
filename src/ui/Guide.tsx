// 시연 순서 (발표용): 3단계 안내, →·← 로 넘기고 Esc 로 닫는다
import { useEffect } from 'react'
import { S, emit, useStore } from '../domain/store'

const STEPS = [
  { pre: () => { S.ui.sel = 'req'; S.ui.view = null }, sel: '.bd-vp', t: '흐름이 곧 작업판', x: <>숫자 배지가 붙은 노드가 할 일이에요. 고른 노드에서 내려온 선이 아래 트레이로 이어져요</> },
  { pre: () => { S.ui.sel = 'req' }, sel: '.nc-a', t: '한 건씩 결론', x: <><b>위반 · 예외 인정 · 오탐</b> 중 하나를 누르면 다음 건으로 넘어가요. 다 끝나면 다음 할 일로 옮겨가요</> },
  { pre: () => { S.ui.sel = 'pol' }, sel: '#pubBtn', alt: '.nowc', t: '서명 후 배포 → 효과', x: <><b>서명 후 배포</b>하면 원문 전송이 줄어든 숫자가 바로 보여요</> },
]

export function toggleGuide() { go(S.ui.guide < 0 ? 0 : -1) }
function go(i: number) {
  if (i >= STEPS.length) i = -1
  S.ui.guide = i
  if (i >= 0) { STEPS[i].pre(); if (location.hash !== '#home' && location.hash !== '') location.hash = 'home' }
  emit()
}

export function Guide() {
  useStore()
  const gi = S.ui.guide
  // 안내하는 곳을 테두리로 강조
  useEffect(() => {
    document.querySelectorAll('.spot').forEach(e => e.classList.remove('spot'))
    if (gi < 0) return
    const s = STEPS[gi], el = document.querySelector(s.sel) || (s.alt && document.querySelector(s.alt))
    if (el) { el.classList.add('spot'); el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }
  })
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (S.ui.guide < 0 || S.ui.dialog || /INPUT|TEXTAREA|SELECT/.test((document.activeElement as HTMLElement)?.tagName)) return
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); go(S.ui.guide + 1) }
      else if ((e.key === 'ArrowLeft' || e.key === 'PageUp') && S.ui.guide > 0) { e.preventDefault(); go(S.ui.guide - 1) }
      else if (e.key === 'Escape') go(-1)
    }
    addEventListener('keydown', f)
    return () => removeEventListener('keydown', f)
  }, [])
  if (gi < 0) return null
  const s = STEPS[gi]
  return (
    <aside className="guide" aria-label="시연 순서">
      <div className="g-h"><span className="lab">시연 순서 {gi + 1} / {STEPS.length}</span><button className="btn sm ghost icon" aria-label="시연 닫기" onClick={() => go(-1)}>✕</button></div>
      <div className="g-t">{s.t}</div><div className="g-x">{s.x}</div>
      <div className="g-dots">{STEPS.map((_, i) => <i key={i} className={i === gi ? 'on' : i < gi ? 'done' : ''} />)}</div>
      <div className="g-f">
        <button className="btn sm ghost g-reset" onClick={() => { location.hash = 'home'; location.reload() }}>처음으로</button>
        <button className="btn sm" disabled={!gi} onClick={() => go(gi - 1)}>이전</button>
        <button className="btn sm p" onClick={() => go(gi + 1)}>{gi === STEPS.length - 1 ? '마치기' : '다음'}</button>
      </div>
    </aside>
  )
}
