// 알림: 짧은 안내(2.8초)와 되돌리기 알림(10초). Z 키와 버튼이 같은 undoLast 를 쓴다.
import { useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Undo2, CircleCheck, CircleAlert, TriangleAlert } from 'lucide-react'
import { S, emit, useStore } from '../domain/store'
import o from '../ds/overlay.module.css'

export function undoLast() {
  const u = S.ui.utoast
  if (!u?.undo) return false
  u.undo(); S.ui.utoast = null; emit()
  return true
}

// 상태(Devs Toast): 문구로 정한다. 저장·연결 실패는 오류, 다른 사람이 먼저 바꾼 것은 경고, 나머지는 완료
const toneOf = (m: string) => (/못했|실패|오류/.test(m) ? 'error' : /먼저 바꿨|확인해 주세요/.test(m) ? 'warning' : 'success') as 'success' | 'warning' | 'error'
const ICON = { success: CircleCheck, warning: TriangleAlert, error: CircleAlert }
function Msg({ m }: { m: string }) { const t = toneOf(m), I = ICON[t]; return <><I size={16} className={o.toastI} aria-hidden="true" /><span>{m}</span></> }
const toneCls = (m: string) => o[toneOf(m)]

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
        {u && <motion.div key={'u' + u.id} className={o.toast + ' ' + toneCls(u.msg)} {...anim}>
          <Msg m={u.msg} />
          {u.undo && <button type="button" className={o.toastBtn} onClick={undoLast}><Undo2 size={16} />되돌리기<span className={o.toastKbd}>Z</span></button>}
          <i className={o.toastBar} aria-hidden="true" />
        </motion.div>}
        {t && <motion.div key={'t' + t.id} className={o.toast + ' ' + o.plain + ' ' + toneCls(t.msg)} {...anim}><Msg m={t.msg} /></motion.div>}
      </AnimatePresence>
    </div>
  )
}
