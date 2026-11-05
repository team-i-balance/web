// 앱 뼈대: 왼쪽 사이드바(로고·찾기·메뉴·연결 상태·시연), 좁으면 아이콘만, 휴대폰은 위 막대 + 아래 탭. 명령 팔레트, 단축키 안내
import { useEffect, useState, type ReactNode } from 'react'
import { Command } from 'cmdk'
import { LayoutGrid, ShieldAlert, Flag, SlidersHorizontal, MonitorCheck, ChartColumn, Search, Play, Keyboard, RefreshCw, ArrowRight, UserRound } from 'lucide-react'
import clsx from 'clsx'
import { S, emit, useStore, fpGroups, boardWork, QUEUE_ORDER, QUEUE_NAME } from '../domain/store'
import { connect } from '../api/client'
import { Kbd, Tip } from '../ds'
import { Modal } from '../ds/Overlay'
import { partial } from '../lib/util'
import { ROUTE_NAME, go, type Route } from './route'
import { openDialog } from '../features/dialogs'
import { undoLast } from '../features/toasts'
import { toggleCoach } from '../features/coach'
import { Logo } from './Logo'
import sh from './shell.module.css'

// 메뉴 아이콘: 16px 가는 선, 색은 글자색을 따른다
const ICON: Record<Route, ReactNode> = {
  home: <LayoutGrid size={16} />, review: <ShieldAlert size={16} />, fp: <Flag size={16} />,
  policy: <SlidersHorizontal size={16} />, deploy: <MonitorCheck size={16} />, insights: <ChartColumn size={16} />,
}

// 메뉴 숫자: 처리할 일 수(work[q])만, 바탕 없는 회색 숫자. 지금 화면에서는 화면 안 숫자와 겹쳐서 그리지 않는다
const NAV_WORK: Partial<Record<Route, [q: 'req' | 'fp' | 'pol', label: string]>> = { review: ['req', '결론 낼 필수 검토'], fp: ['fp', '오탐 신고'], policy: ['pol', '배포 대기 변경'] }
function navBadge(r: Route): ReactNode {
  const w = NAV_WORK[r]
  if (!w) return null
  const n = boardWork()[w[0]]
  return n ? <span className={sh.navN} aria-label={`${w[1]} ${n}`}>{n}</span> : null
}

const connText = () => {
  const a = S.api
  return a.state === 'live' ? `서버 ${a.count}건` : a.state === 'connecting' ? '연결하는 중' : a.state === 'auth' ? '인증 필요' : '연결 안 됨'
}
const openPalette = () => { S.ui.palette = true; emit() }
const Brand = () => (
  <a className={sh.brand} href="#home" aria-label="AI 누리 보안 작업판으로">
    <Logo size={22} className={sh.logo} /><span className={sh.brandT}>AI 누리 보안</span>
  </a>
)

// 사이드바가 아이콘만 보이는 폭(861~1240px)
const RAIL = '(min-width: 861px) and (max-width: 1240px)'
function useRail() {
  const [on, setOn] = useState(() => matchMedia(RAIL).matches)
  useEffect(() => { const m = matchMedia(RAIL), f = () => setOn(m.matches); m.addEventListener('change', f); return () => m.removeEventListener('change', f) }, [])
  return on
}

// 사이드바 한 줄: 아이콘 + 글자 (+ 건수). 아이콘만 보일 때는 글자를 툴팁으로
function Item({ icon, label, right, href, current, onClick, cls, rail }: { icon: ReactNode; label: string; right?: ReactNode; href?: string; current?: boolean; onClick?: () => void; cls?: string; rail: boolean }) {
  const inner = <>{icon}<span className={sh.itemT}>{label}</span>{right && <span className={sh.itemR}>{right}</span>}</>
  const el = href
    ? <a className={clsx(sh.item, cls)} href={href} aria-current={current ? 'page' : undefined} aria-label={label}>{inner}</a>
    : <button type="button" className={clsx(sh.item, cls)} onClick={onClick} aria-label={label}>{inner}</button>
  return rail ? <Tip text={label}>{el}</Tip> : el
}

export function TopBar({ r }: { r: Route }) {
  const routes = Object.keys(ROUTE_NAME) as Route[]
  const rail = useRail()
  return (
    <>
      <aside className={sh.side} aria-label="메뉴">
        <div className={sh.sideTop}><Brand /></div>
        <button type="button" className={sh.search} onClick={openPalette} aria-label="찾기·이동 (⌘K)">
          <Search size={16} /><span>찾기</span><Kbd>⌘K</Kbd>
        </button>
        <nav className={sh.nav}>
          {routes.map(k => <Item key={k} icon={ICON[k]} label={ROUTE_NAME[k]} right={r === k ? null : navBadge(k)} href={'#' + k} current={r === k} rail={rail} />)}
        </nav>
        <div className={sh.sideFoot}>
          <Item icon={<i className={clsx(sh.connDot, sh[S.api.state])} />} label={connText()} onClick={() => openDialog({ kind: 'server' })} cls={sh.conn} rail={rail} />
          <Item icon={<Play size={16} />} label="시연 순서" onClick={toggleCoach} rail={rail} />
        </div>
      </aside>
      <header className={sh.top}>
        <Brand />
        <div className={sh.tools}>
          <button type="button" className={sh.tool} onClick={openPalette} aria-label="찾기·이동"><Search size={20} /></button>
          <button type="button" className={sh.tool} onClick={() => openDialog({ kind: 'server' })} aria-label={`데이터: ${connText()}`}><i className={clsx(sh.connDot, sh[S.api.state])} /></button>
          <button type="button" className={sh.tool} onClick={toggleCoach} aria-label="시연 순서"><Play size={20} /></button>
        </div>
      </header>
      <nav className={sh.bottom} aria-label="메뉴">
        {routes.map(k => <a key={k} className={sh.tab} href={'#' + k} aria-current={r === k ? 'page' : undefined}>{ICON[k]}{ROUTE_NAME[k]}<span className={sh.tabN}>{r === k ? null : navBadge(k)}</span></a>)}
      </nav>
    </>
  )
}

// ── 명령 팔레트(⌘K): 화면 이동 · 다음 할 일 · 건·값 찾기 · 설정
function Palette() {
  useStore()
  const open = S.ui.palette
  const close = () => { S.ui.palette = false; emit() }
  const run = (f: () => void) => () => { close(); f() }
  if (!open) return null
  const w = boardWork(), nx = QUEUE_ORDER.find(k => w[k])
  // 열린 건을 먼저, 종결한 건은 최근 것부터
  const cases = [...S.cases.filter(c => c.status === 'open'), ...S.cases.filter(c => c.status === 'closed').sort((a, b) => +b.close!.at - +a.close!.at)].slice(0, 80)
  const fps = fpGroups(true).slice(0, 20)
  return (
    <Modal open onClose={close} title="찾기·이동" wide>
      <Command label="찾기·이동" className={sh.palCmd} loop>
        <div className={sh.palIn}><Search size={16} /><Command.Input autoFocus placeholder="화면, 직원 이름, 건 번호, 값…" /></div>
        <Command.List className={sh.palList}>
          <Command.Empty className={sh.palEmpty}>찾는 게 없어요</Command.Empty>
          {nx && <Command.Group heading="지금 할 일" className={sh.palGroup}>
            <Command.Item className={sh.palItem} onSelect={run(() => { S.ui.sel = nx; go('home'); emit() })}><ArrowRight size={16} />{QUEUE_NAME[nx]} {w[nx]}건 처리하기</Command.Item>
          </Command.Group>}
          <Command.Group heading="화면" className={sh.palGroup}>
            {(Object.keys(ROUTE_NAME) as Route[]).map(k => <Command.Item key={k} value={'화면 ' + ROUTE_NAME[k]} className={sh.palItem} onSelect={run(() => go(k))}>{ICON[k]}{ROUTE_NAME[k]}</Command.Item>)}
          </Command.Group>
          {cases.length > 0 && <Command.Group heading="건" className={sh.palGroup}>
            {cases.map(c => <Command.Item key={c.id} value={`${c.user} ${c.dept} ${c.id} ${c.ev.ai}`} className={sh.palItem} onSelect={run(() => go('review/' + c.id))}>
              <UserRound size={16} />{c.user}<span className={sh.palMeta}>{c.status === 'closed' ? '종결' : c.need === 'req' ? '필수' : '선택'} · {c.ev.ai} · {c.id}</span></Command.Item>)}
          </Command.Group>}
          {fps.length > 0 && <Command.Group heading="오탐 신고 값" className={sh.palGroup}>
            {fps.map(g => <Command.Item key={g.type + g.value} value={`오탐 ${g.type} ${partial(g.type, g.value)}`} className={sh.palItem} onSelect={run(() => go('fp'))}>
              <Flag size={16} />{partial(g.type, g.value)}<span className={sh.palMeta}>{g.type} · {g.refs.length}회</span></Command.Item>)}
          </Command.Group>}
          <Command.Group heading="설정" className={sh.palGroup}>
            <Command.Item className={sh.palItem} onSelect={run(() => { connect() })}><RefreshCw size={16} />서버에서 다시 불러오기</Command.Item>
            <Command.Item className={sh.palItem} onSelect={run(toggleCoach)}><Play size={16} />시연 순서 보기</Command.Item>
            <Command.Item className={sh.palItem} onSelect={run(() => { S.ui.help = true; emit() })}><Keyboard size={16} />단축키 보기<span className={sh.palMeta}>?</span></Command.Item>
          </Command.Group>
        </Command.List>
      </Command>
    </Modal>
  )
}

function Help() {
  useStore()
  const rows: [string[], string][] = [[['⌘', 'K'], '찾기·이동'], [['?'], '단축키 보기'], [['G', 'H'], '작업판으로']]
  const work: [string[], string][] = [[['1'], '첫째 판단'], [['2'], '둘째 판단'], [['3'], '셋째 판단'], [['↑', '↓'], '다른 건'], [['Z'], '방금 판단 되돌리기']]
  return (
    <Modal open={S.ui.help} onClose={() => { S.ui.help = false; emit() }} title="단축키">
      <dl className={sh.keys}>
        <div className={sh.keysH}>어디서나</div>
        {rows.map(([k, t]) => <div key={t} style={{ display: 'contents' }}><dt>{k.map(x => <Kbd key={x}>{x}</Kbd>)}</dt><dd>{t}</dd></div>)}
        <div className={sh.keysH}>작업판 · 위반 검토</div>
        {work.map(([k, t]) => <div key={t} style={{ display: 'contents' }}><dt>{k.map(x => <Kbd key={x}>{x}</Kbd>)}</dt><dd>{t}</dd></div>)}
      </dl>
    </Modal>
  )
}

// 어디서나 쓰는 키: ⌘K, ?, g h
export function useGlobalKeys() {
  useEffect(() => {
    let g = 0
    const f = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); S.ui.palette = !S.ui.palette; emit(); return }
      const typing = /INPUT|TEXTAREA|SELECT/.test((document.activeElement as HTMLElement)?.tagName) || (document.activeElement as HTMLElement)?.isContentEditable
      if (typing || S.ui.dialog || S.ui.palette || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === '?') { e.preventDefault(); S.ui.help = true; emit(); return }
      if ((e.key === 'z' || e.key === 'Z') && undoLast()) { e.preventDefault(); return }
      if (e.key === 'g') { g = Date.now(); return }
      if (e.key === 'h' && Date.now() - g < 800) { go('home'); g = 0 }
    }
    addEventListener('keydown', f)
    return () => removeEventListener('keydown', f)
  }, [])
}

export function Overlays() { return <><Palette /><Help /></> }
