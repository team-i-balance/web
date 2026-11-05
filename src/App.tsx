import { Suspense, lazy, useEffect } from 'react'
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
import { currentLook } from './shell/theme'
import sh from './shell/shell.module.css'

// 디자인 시스템 시안(?look=carbon·cloudscape): 고른 쪽만 따로 불러와 기본 화면 번들에는 들어가지 않는다
const PROTO = { carbon: lazy(() => import('./proto/carbon/CarbonApp')), cloudscape: lazy(() => import('./proto/cloudscape/CloudscapeApp')) }

export default function App() {
  useStore()
  useGlobalKeys()
  const { r, arg } = useRoute()
  useEffect(() => { scrollTo(0, 0); document.title = `${ROUTE_NAME[r]} · 입력정보 점검` }, [r])
  const look = currentLook()
  if (look === 'carbon' || look === 'cloudscape') {
    const P = PROTO[look]
    return <TipProvider><Suspense fallback={null}><P r={r} arg={arg} /></Suspense><Overlays /><DialogHost /><Toasts /><Coach /></TipProvider>
  }
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
