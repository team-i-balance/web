import { useEffect, useState } from 'react'
import { S, useStore, openOf, fpGroups } from './domain/store'
import Board from './pages/Board'
import Review from './pages/Review'
import FalsePositives from './pages/FalsePositives'
import Policy from './pages/Policy'
import { DialogHost, openDialog } from './ui/Dialogs'
import { Toasts } from './ui/Toasts'
import { Guide, toggleGuide } from './ui/Guide'

// 주소 #home · #review/INC-123 · #fp · #policy
function useRoute() {
  const [hash, setHash] = useState(location.hash)
  useEffect(() => { const f = () => setHash(location.hash); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f) }, [])
  const [r, arg] = (hash.slice(1) || 'home').split('/')
  return { r: ['home', 'review', 'fp', 'policy'].includes(r) ? r : 'home', arg }
}

function TopBar({ r }: { r: string }) {
  const a = S.api
  const nav: [string, string, number, boolean][] = [
    ['home', '작업판', 0, false],
    ['review', '위반 검토', openOf('req').length, true],
    ['fp', '오탐 신고', fpGroups(true).length, false],
    ['policy', '변환 정책', S.policy.changes.length, true],
  ]
  return (
    <header className="topbar">
      <div className="bar-box">
        <span className="bar-title">입력정보 사전 점검 도우미</span>
        <nav className="navs" aria-label="메뉴">
          {nav.map(([k, t, n, hot]) => <a key={k} className={'nav' + (r === k ? ' on' : '')} href={'#' + k} aria-current={r === k ? 'page' : undefined}>{t}{n > 0 && <span className={'cnt' + (hot ? ' hot' : '')}>{n}</span>}</a>)}
        </nav>
      </div>
      <div className="bar-box">
        <button className={'conn ' + (a.live ? 'on' : 'off')} onClick={() => openDialog({ kind: 'server' })}
          title={a.live ? `${a.base} · 최근 7일 /logs/events` : '서버에 연결하지 못해 예시 데이터를 보여줘요'}>
          {a.live ? `서버 연결됨 · ${a.count}건` : '예시 데이터'}
        </button>
        <button className="btn sm" onClick={toggleGuide}>시연 순서 보기</button>
      </div>
    </header>
  )
}

export default function App() {
  useStore()
  const { r, arg } = useRoute()
  useEffect(() => { scrollTo(0, 0) }, [r])
  return (
    <>
      <div className="app">
        <TopBar r={r} />
        <main className="main">
          {r === 'home' && <Board />}
          {r === 'review' && <Review id={arg} />}
          {r === 'fp' && <FalsePositives />}
          {r === 'policy' && <Policy />}
        </main>
      </div>
      <DialogHost />
      <Toasts />
      <Guide />
    </>
  )
}
