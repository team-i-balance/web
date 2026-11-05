// 알림: 짧은 안내(2.8초)와 되돌리기 알림(10초). Z 키와 버튼이 같은 undoLast 를 쓴다.
import { useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Undo2 } from 'lucide-react'
import { S, emit, useStore } from '../domain/store'
import o from '../ds/overlay.module.css'

export function undoLast() {
  const u = S.ui.utoast
  if (!u?.undo) return false
  u.undo(); S.ui.utoast = null; emit()
  return true
}

const anim = { initial: { opacity: 0, y: -10, scale: 0.98 }, animate: { opacity: 1, y: 0, scale: 1 }, exit: { opacity: 0, y: -8, transition: { duration: 0.15 } }, transition: { duration: 0.22, ease: [0.2, 0.8, 0.2, 1] as const } }

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
    <div className={o.toasts} role="status" aria-live="polite">
      <AnimatePresence initial={false}>
        {u && <motion.div key={'u' + u.id} className={o.toast} {...anim}>
          <span>{u.msg}</span>
          {u.undo && <button type="button" className={o.toastBtn} onClick={undoLast}><Undo2 size={14} />되돌리기<span className={o.toastKbd}>Z</span></button>}
          <i className={o.toastBar} aria-hidden="true" />
        </motion.div>}
        {t && <motion.div key={'t' + t.id} className={o.toast + ' ' + o.plain} {...anim}>{t.msg}</motion.div>}
      </AnimatePresence>
    </div>
  )
}
