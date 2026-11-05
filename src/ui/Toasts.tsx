import { useEffect } from 'react'
import { S, emit, useStore } from '../domain/store'

// 방금 한 판단 되돌리기 (버튼·Z 키 공용)
export function undoLast() {
  const u = S.ui.utoast
  if (!u?.undo) return false
  u.undo(); S.ui.utoast = null; emit()
  return true
}

export function Toasts() {
  useStore()
  const t = S.ui.toast, u = S.ui.utoast
  useEffect(() => {
    if (!t) return
    const h = setTimeout(() => { if (S.ui.toast?.id === t.id) { S.ui.toast = null; emit() } }, 2800)
    return () => clearTimeout(h)
  }, [t?.id])
  useEffect(() => {
    if (!u) return
    const h = setTimeout(() => { if (S.ui.utoast?.id === u.id) { S.ui.utoast = null; emit() } }, 10000)
    return () => clearTimeout(h)
  }, [u?.id])
  return (
    <>
      <div className={'toast' + (t ? ' show' : '')} role="status" aria-live="polite">{t?.msg}</div>
      <div className={'utoast' + (u ? ' show' : '')} role="status" aria-live="polite">
        <span>{u?.msg}</span>
        {u?.undo && <button className="btn sm ghost" onClick={undoLast}>되돌리기</button>}
      </div>
    </>
  )
}
