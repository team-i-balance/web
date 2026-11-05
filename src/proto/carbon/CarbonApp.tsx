// IBM Carbon 시안: 위 막대(UI Shell) · 작업판 · 위반 검토. 나머지 화면은 지금 화면으로 안내한다.
import { useEffect, useState } from 'react'
import {
  Header, HeaderName, HeaderNavigation, HeaderMenuItem, HeaderGlobalBar, HeaderGlobalAction, HeaderMenuButton,
  SideNav, SideNavItems, HeaderSideNavItems, SkipToContent, Content, Button, Tag,
} from '@carbon/react'
import { Search, Light, Asleep, Play } from '@carbon/icons-react'
import { S, emit, useStore, openOf, fpGroups } from '../../domain/store'
import { ROUTE_NAME, type Route } from '../../shell/route'
import { currentTheme, toggleTheme } from '../../shell/theme'
import { openDialog } from '../../features/dialogs'
import { toggleCoach } from '../../features/coach'
import CBoard from './CBoard'
import CReview from './CReview'
import './carbon.scss'
import './c.css'

function conn() {
  const a = S.api
  return a.state === 'live' ? `서버 ${a.count}건` : a.state === 'connecting' ? '연결하는 중' : a.state === 'offline' ? '연결 안 됨 · 예시 데이터' : a.state === 'auth' ? '인증 필요 · 예시 데이터' : '예시 데이터'
}
const count = (r: Route) => r === 'review' ? openOf('req').length : r === 'fp' ? fpGroups(true).length : r === 'policy' ? S.policy.changes.length : 0

export default function CarbonApp({ r, arg }: { r: Route; arg?: string }) {
  useStore()
  const dark = currentTheme() === 'dark'
  const [nav, setNav] = useState(false)
  useEffect(() => {
    const h = document.documentElement
    h.classList.toggle('cds--g100', dark); h.classList.toggle('cds--white', !dark)
  }, [dark])
  useEffect(() => setNav(false), [r])
  const routes = Object.keys(ROUTE_NAME) as Route[]
  const items = routes.map(k => { const n = count(k); return <HeaderMenuItem key={k} href={'#' + k} isActive={r === k} aria-current={r === k ? 'page' : undefined}>{ROUTE_NAME[k]}{n > 0 && <span className="c-n">{n}</span>}</HeaderMenuItem> })
  return (
    <div className="c-app">
      <Header aria-label="입력정보 점검">
        <SkipToContent href="#main" />
        <HeaderMenuButton aria-label={nav ? '메뉴 닫기' : '메뉴 열기'} isActive={nav} onClick={() => setNav(v => !v)} aria-expanded={nav} />
        <HeaderName href="#home" prefix="">입력정보 점검</HeaderName>
        <HeaderNavigation aria-label="메뉴">{items}</HeaderNavigation>
        <HeaderGlobalBar>
          <button type="button" className="c-conn" onClick={() => openDialog({ kind: 'server' })}><i data-state={S.api.state} />{conn()}</button>
          <HeaderGlobalAction aria-label="찾기·이동 (⌘K)" tooltipAlignment="end" onClick={() => { S.ui.palette = true; emit() }}><Search size={20} /></HeaderGlobalAction>
          <HeaderGlobalAction aria-label={dark ? '라이트 테마' : '다크 테마'} tooltipAlignment="end" onClick={toggleTheme}>{dark ? <Light size={20} /> : <Asleep size={20} />}</HeaderGlobalAction>
          <HeaderGlobalAction aria-label="시연 순서" tooltipAlignment="end" onClick={toggleCoach}><Play size={20} /></HeaderGlobalAction>
        </HeaderGlobalBar>
        <SideNav aria-label="메뉴" expanded={nav} isPersistent={false} onSideNavBlur={() => setNav(false)}>
          <SideNavItems><HeaderSideNavItems>{items}</HeaderSideNavItems></SideNavItems>
        </SideNav>
      </Header>
      <Content id="main" className="c-main">
        {r === 'home' ? <CBoard /> : r === 'review' ? <CReview id={arg} /> : (
          <div className="c-out">
            <h1 className="cds--type-heading-03">{ROUTE_NAME[r]}</h1>
            <p>이 화면은 시안 범위 밖이에요. 작업판과 위반 검토만 Carbon으로 만들었어요.</p>
            <div className="c-row"><Button kind="tertiary" size="md" href={`?look=old#${r}`}>지금 화면으로 보기</Button><Tag type="gray">시안</Tag></div>
          </div>
        )}
      </Content>
    </div>
  )
}
