// 오탐 신고: 직원이 "오탐"으로 되돌린 값을 값별로 묶어 처리한다. 여러 값을 골라 한 번에 "탐지 결과 유지"할 수 있다.
import { Fragment, useState } from 'react'
import { ChevronDown, Flag } from 'lucide-react'
import { S, emit, useStore, fpGroups, groupKey, caseById, undoToast, ago } from '../../domain/store'
import type { FpGroup } from '../../domain/types'
import { Button, Checkbox, Empty, LinkButton, Segmented, Tag } from '../../ds'
import { openDialog } from '../dialogs'
import { partial } from '../../lib/util'
import f from './fp.module.css'

const RES: Record<string, [string, 'ok' | undefined]> = { exclude: ['탐지 제외함', 'ok'], keep: ['탐지 결과 유지', undefined] }
const sentence = (g: FpGroup, n = 0) => { const r = g.refs[n]; return r.e.tpl.replace(/\{(\d)\}/g, (_, j) => (r.e.items[+j] === r.it ? '⟪' + partial(g.type, r.it.orig) + '⟫' : '…')) }

export default function FalsePositives() {
  useStore()
  const tab = S.ui.fpTab
  const [open, setOpen] = useState<string | null>(null)
  const groups = fpGroups(tab === 'open')
  const picked = S.ui.fpPicked
  const live = new Set(groups.map(groupKey)), sel = [...picked].filter(k => live.has(k))
  const all = sel.length === groups.length && groups.length > 0
  const keep = (gs: FpGroup[]) => {
    gs.forEach(g => g.refs.forEach(r => (r.it.fp = 'keep')))
    picked.clear()
    undoToast(gs.length > 1 ? `${gs.length}개 값 · 탐지 결과 유지` : `${partial(gs[0].type, gs[0].value)} · 탐지 결과 유지`, () => gs.forEach(g => g.refs.forEach(r => (r.it.fp = 'open'))))
  }
  const toggle = (k: string, v: boolean) => { v ? picked.add(k) : picked.delete(k); emit() }
  const setTab = (t: 'open' | 'done') => { S.ui.fpTab = t; picked.clear(); emit() }
  return (
    <section className={f.page} aria-label="오탐 신고">
      <div className={f.head}>
        <div><h1>오탐 신고</h1><p>직원이 "개인정보 아님"으로 되돌린 값이에요. 값마다 탐지를 유지할지 제외할지 정해요.</p></div>
        <Segmented label="상태" value={tab} onChange={setTab} items={[{ k: 'open', t: '처리할 신고', n: fpGroups(true).length }, { k: 'done', t: '처리함', n: fpGroups(false).length }]} />
      </div>
      {tab === 'open' && sel.length > 0 && <div className={f.bulk} role="region" aria-label="고른 값 처리">
        <b>{sel.length}개 골랐어요</b>
        <Button size="sm" variant="ghost" onClick={() => { picked.clear(); emit() }}>해제</Button>
        <Button size="sm" variant="primary" onClick={() => keep(groups.filter(g => sel.includes(groupKey(g))))}>{sel.length}개 탐지 결과 유지</Button>
      </div>}
      {groups.length ? <div className={f.scroll}><table className={f.t}>
        <thead><tr>
          {tab === 'open' && <th className={f.pick}><Checkbox checked={all ? true : sel.length ? 'indeterminate' : false} label="모두 고르기" onChange={() => { all ? picked.clear() : groups.forEach(g => picked.add(groupKey(g))); emit() }} /></th>}
          <th>잡힌 값</th><th>신고</th><th>나온 문장</th><th style={{ textAlign: 'right' }}>{tab === 'open' ? '처리' : '결과'}</th>
        </tr></thead>
        <tbody>{groups.map(g => {
          const k = groupKey(g), cs = g.refs.map(x => caseById('INC-' + x.e.id)).filter(Boolean)
          const ex = open === k, cols = tab === 'open' ? 5 : 4
          return <Fragment key={k}><tr data-picked={picked.has(k) || undefined} data-open={ex || undefined} className={f.clickRow} onClick={e => { if (!(e.target as HTMLElement).closest('button,a,[role=checkbox]')) setOpen(ex ? null : k) }}>
            {tab === 'open' && <td className={f.pick}><Checkbox checked={picked.has(k)} label={`${partial(g.type, g.value)} 고르기`} onChange={v => toggle(k, v)} /></td>}
            <td><div className={f.val}><b><ChevronDown size={14} className={f.chev} aria-hidden="true" />{partial(g.type, g.value)}</b><span>{g.type}</span></div></td>
            <td className={f.cnt}><b>{g.refs.length}회</b><span>직원 {g.users.size}명</span></td>
            <td className={f.sent}>{sentence(g)}{cs.length > 0 && <><br /><a href={`#review/${cs[0]!.id}`}>선택 검토에도 있어요</a></>}</td>
            <td><div className={f.acts}>{tab === 'open'
              ? <><Button size="sm" onClick={() => keep([g])}>탐지 결과 유지</Button><Button size="sm" variant="ghost" onClick={() => openDialog({ kind: 'exclude', groupKey: k })}>탐지 제외 검토</Button></>
              : <Tag tone={RES[g.fp || '']?.[1]} dot>{RES[g.fp || '']?.[0] || '처리함'}</Tag>}</div></td>
          </tr>
          {ex && <tr className={f.cases}><td colSpan={cols}><ol>{g.refs.map((x, n) => <li key={n}><span>{x.e.user} · {x.e.dept} · {ago(x.e.time)} · {x.e.ai} · 정책 {x.e.ver}</span><p>{sentence(g, n)}</p></li>)}</ol></td></tr>}
          </Fragment>
        })}</tbody>
      </table></div>
        : <Empty center icon={<Flag size={20} />} title={tab === 'open' ? '처리할 신고가 없어요' : '아직 처리한 신고가 없어요'} text={'직원이 "오탐"으로 되돌리면 여기에 모여요'}>{tab === 'open' && <LinkButton href="#home">작업판으로</LinkButton>}</Empty>}
    </section>
  )
}
