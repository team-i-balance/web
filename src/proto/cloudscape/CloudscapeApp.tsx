// AWS Cloudscape 시안: 위 막대(TopNavigation) + 왼쪽 메뉴(AppLayout) · 작업판 · 위반 검토. 나머지 화면은 지금 화면으로 안내한다.
import { useEffect, useState } from 'react'
import AppLayout from '@cloudscape-design/components/app-layout'
import TopNavigation from '@cloudscape-design/components/top-navigation'
import SideNavigation from '@cloudscape-design/components/side-navigation'
import Badge from '@cloudscape-design/components/badge'
import Container from '@cloudscape-design/components/container'
import Header from '@cloudscape-design/components/header'
import Button from '@cloudscape-design/components/button'
import Box from '@cloudscape-design/components/box'
import { applyTheme } from '@cloudscape-design/components/theming'
import { applyMode, applyDensity, Mode, Density } from '@cloudscape-design/global-styles'
import '@cloudscape-design/global-styles/index-base.css'
import { S, emit, useStore, openOf, fpGroups } from '../../domain/store'
import { ROUTE_NAME, type Route } from '../../shell/route'
import { currentTheme, toggleTheme } from '../../shell/theme'
import { openDialog } from '../../features/dialogs'
import { toggleCoach } from '../../features/coach'
import SBoard from './SBoard'
import SReview from './SReview'
import './s.css'

// 글꼴: Pretendard(한글) + IBM Plex Mono(식별자), 둘 다 자체 호스팅
applyTheme({ theme: { tokens: {
  fontFamilyBase: "'Pretendard Variable', -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', sans-serif",
  fontFamilyMonospace: "'IBM Plex Mono', ui-monospace, Menlo, monospace",
} } })
applyDensity(Density.Compact)

function conn() {
  const a = S.api
  return a.state === 'live' ? `서버 ${a.count}건` : a.state === 'connecting' ? '연결하는 중' : a.state === 'offline' ? '연결 안 됨 · 예시 데이터' : a.state === 'auth' ? '인증 필요 · 예시 데이터' : '예시 데이터'
}
const count = (r: Route) => r === 'review' ? openOf('req').length : r === 'fp' ? fpGroups(true).length : r === 'policy' ? S.policy.changes.length : 0

export default function CloudscapeApp({ r, arg }: { r: Route; arg?: string }) {
  useStore()
  const dark = currentTheme() === 'dark'
  const [nav, setNav] = useState(innerWidth > 1100)
  useEffect(() => { applyMode(dark ? Mode.Dark : Mode.Light) }, [dark])
  const routes = Object.keys(ROUTE_NAME) as Route[]
  return (
    <>
      <div id="s-top" className="s-top">
        <TopNavigation
          identity={{ href: '#home', title: '입력정보 점검' }}
          i18nStrings={{ overflowMenuTriggerText: '더 보기', overflowMenuTitleText: '전체' }}
          utilities={[
            { type: 'button', text: conn(), title: '서버 연결 보기', onClick: () => openDialog({ kind: 'server' }) },
            { type: 'button', iconName: 'search', ariaLabel: '찾기·이동 (⌘K)', title: '찾기·이동 (⌘K)', onClick: () => { S.ui.palette = true; emit() } },
            { type: 'button', text: dark ? '라이트' : '다크', title: '테마 바꾸기', onClick: toggleTheme },
            { type: 'button', text: '시연 순서', iconName: 'caret-right-filled', onClick: toggleCoach },
          ]}
        />
      </div>
      <AppLayout
        headerSelector="#s-top"
        toolsHide
        contentType="default"
        maxContentWidth={Number.MAX_VALUE}
        navigationOpen={nav}
        onNavigationChange={({ detail }) => setNav(detail.open)}
        ariaLabels={{ navigation: '메뉴', navigationClose: '메뉴 닫기', navigationToggle: '메뉴 열기' }}
        navigation={<SideNavigation activeHref={'#' + r} header={{ text: '메뉴', href: '#home' }}
          items={routes.map(k => { const n = count(k); return { type: 'link' as const, text: ROUTE_NAME[k], href: '#' + k, info: n ? <Badge color={k === 'review' ? 'red' : 'grey'}>{n}</Badge> : undefined } })}
          onFollow={() => { if (innerWidth <= 1100) setNav(false) }} />}
        content={<main id="main">{r === 'home' ? <SBoard /> : r === 'review' ? <SReview id={arg} /> : (
          <Container header={<Header variant="h1" description="이 화면은 시안 범위 밖이에요. 작업판과 위반 검토만 Cloudscape로 만들었어요.">{ROUTE_NAME[r]}</Header>}>
            <Box><Button href={`?look=old#${r}`}>지금 화면으로 보기</Button></Box>
          </Container>
        )}</main>}
      />
    </>
  )
}
