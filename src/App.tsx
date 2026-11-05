import { useEffect } from 'react'
import { MotionConfig } from 'motion/react'
import { useStore } from './domain/store'
import { TipProvider } from './ds'
import { TopBar, Overlays, useGlobalKeys } from './shell/Shell'
import { useRoute, ROUTE_NAME } from './shell/route'
import { DialogHost } from './features/dialogs'
import { Toasts } from './features/toasts'
import { Coach } from './features/coach'
import Board from './features/board/Board'
import Review from './features/review/Review'
import FalsePositives from './features/fp/FalsePositives'
import Policy from './features/policy/Policy'
import Deploy from './features/deploy/Deploy'
import Insights from './features/insights/Insights'
import sh from './shell/shell.module.css'

export default function App() {
  useStore()
  useGlobalKeys()
  const { r, arg } = useRoute()
  useEffect(() => { scrollTo(0, 0); document.title = `${ROUTE_NAME[r]} · AI 누리 보안` }, [r])
  return (
    <MotionConfig reducedMotion="user">
    <TipProvider>
      <div className={sh.app}>
        <TopBar r={r} />
        <main className={sh.main} id="main">
          {r === 'home' && <Board />}
          {r === 'review' && <Review id={arg} />}
          {r === 'fp' && <FalsePositives />}
          {r === 'policy' && <Policy />}
          {r === 'deploy' && <Deploy />}
          {r === 'insights' && <Insights />}
        </main>
      </div>
      <Overlays />
      <DialogHost />
      <Toasts />
      <Coach />
    </TipProvider>
    </MotionConfig>
  )
}
