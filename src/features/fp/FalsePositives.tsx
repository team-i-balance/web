// 오탐 신고: 직원이 "오탐"으로 되돌린 값을 값별로 묶어 처리한다. 여러 값을 골라 한 번에 "탐지 결과 유지"할 수 있다.
import { Fragment, useState } from 'react'
import { ChevronDown, Flag } from 'lucide-react'
import clsx from 'clsx'
import { S, useStore, groupKey, caseById, ago } from '../../domain/store'
import { useFpModel } from './model'
import type { FpGroup } from '../../domain/types'
import { Button, Checkbox, Empty, Hit, LinkButton, Notice, Segmented, Tag, ds } from '../../ds'
import { openDialog } from '../dialogs'
import type { ServerEvent } from '../../api/client'
import { partial } from '../../lib/util'
import f from './fp.module.css'

const RES: Record<string, [string, 'ok' | undefined]> = { exclude: ['탐지 제외함', 'ok'], keep: ['탐지 결과 유지', undefined] }

// 문장 조각: 신고된 값은 가린 값 그대로 Hit 로, 다른 값은 '…'. 값을 복원하거나 덧붙이지 않는다
type Seg = string | { hit: string }
const tidy = (s: string) => s.replace(/…(?:\s*[,·]\s*…|…)+/g, '…') // 연속 '…'·'…, …'는 하나로
function sentence(g: FpGroup, n = 0, cut = false): Seg[] {
  const r = g.refs[n], out: Seg[] = []
  for (const p of r.e.tpl.split(/(\{\d\})/)) {
    const m = /^\{(\d)\}$/.exec(p)
    const seg: Seg = m ? (r.e.items[+m[1]] === r.it ? { hit: partial(g.type, r.it.orig) } : '…') : p
    const last = out[out.length - 1]
    if (typeof seg === 'string' && typeof last === 'string') out[out.length - 1] = last + seg
    else if (seg !== '') out.push(seg)
  }
  const segs = out.map(p => (typeof p === 'string' ? tidy(p) : p))
  // 끝 '…'은 CSS 말줄임이 맡는다
  const end = segs[segs.length - 1]
  if (cut && typeof end === 'string') segs[segs.length - 1] = end.replace(/[\s,·]*…\s*$/, '')
  return segs
}
const Sent = ({ segs }: { segs: Seg[] }) => <>{segs.map((p, i) => (typeof p === 'string' ? <Fragment key={i}>{p}</Fragment> : <Hit key={i}>{p.hit}</Hit>))}</>

export default function FalsePositives() {
  useStore()
  const { tab, groups, picked, sel, all, keep, toggle, setTab, counts, clear, toggleAll } = useFpModel()
  const [open, setOpen] = useState<string | null>(null)
  const isOpen = tab === 'open'
  // 서버 이벤트에 항목(값 해시)이 없는 오탐 신고: 묶을 수 없어 건수만 알린다
  const noValue = S.events.filter(e => { const v = e.server as ServerEvent | undefined; return v?.reason === 'false_positive' && !v.items?.length }).length
  return (
    <div className={ds.page}>
      <div className={ds.pageHead}>
        <h1>오탐 신고</h1>
        {/* 고르면 탭 자리에 같은 높이로 일괄 바를 바꿔 끼운다(표가 밀리지 않게) */}
        <div className={ds.pageTools}>{isOpen && sel.length > 0
          ? <div className={f.bulk} role="region" aria-label="고른 값 처리">
            <b>{sel.length}개 골랐어요</b>
            <Button size="sm" variant="ghost" onClick={clear}>해제</Button>
            <Button size="sm" variant="now" onClick={() => keep(groups.filter(g => sel.includes(groupKey(g))))}>{sel.length}개 탐지 결과 유지</Button>
          </div>
          : <Segmented label="상태" value={tab} onChange={setTab} items={[{ k: 'open', t: '처리할 신고', n: counts.open }, { k: 'done', t: '처리함', n: counts.done }]} />}
        </div>
      </div>
      {noValue > 0 && <Notice tone="warning" title={`값 정보 없이 들어온 오탐 신고 ${noValue}건`}>
        직원 프로그램이 어떤 값을 오탐이라 했는지 보내지 않아서 값으로 묶거나 탐지 제외할 수 없어요. 아래 목록에는 넣지 않았어요.
      </Notice>}
      <section className={f.page} aria-label="오탐 신고">
      {groups.length ? <div className={f.scroll}><table className={clsx(ds.table, ds.table2, f.t)} data-tab={tab}>
        <colgroup>
          {isOpen && <col className={f.cPick} />}<col className={f.cChev} /><col className={f.cVal} /><col className={f.cCnt} /><col /><col className={f.cAct} />
        </colgroup>
        <thead><tr>
          {isOpen && <th className={f.pick}><Checkbox checked={all ? true : sel.length ? 'indeterminate' : false} label="모두 고르기" onChange={toggleAll} /></th>}
          <th className={f.chevC} aria-hidden="true" /><th>잡힌 값</th><th className="num">신고</th><th>나온 문장</th>
          {isOpen ? <th aria-label="처리" /> : <th className={f.actH}>결과</th>}
        </tr></thead>
        <tbody>{groups.map(g => {
          const k = groupKey(g), cs = g.refs.map(x => caseById('INC-' + x.e.id)).filter(Boolean)
          const ex = open === k, cols = isOpen ? 6 : 5
          return <Fragment key={k}><tr data-picked={picked.has(k) || undefined} data-open={ex || undefined} className={f.clickRow} onClick={e => { if (!(e.target as HTMLElement).closest('button,a,[role=checkbox]')) setOpen(ex ? null : k) }}>
            {isOpen && <td className={f.pick}><Checkbox checked={picked.has(k)} label={`${partial(g.type, g.value)} 고르기`} onChange={v => toggle(k, v)} /></td>}
            <td className={f.chevC}><ChevronDown size={16} className={f.chev} aria-hidden="true" /></td>
            <td><div className={f.val}><b>{partial(g.type, g.value)}</b><span>{g.type}{cs.length > 0 && <a className={clsx(ds.tag, ds.tagOutline)} href={`#review/${cs[0]!.id}`}>선택 검토 있음</a>}</span></div></td>
            <td className={clsx('num', f.cnt)}><b>{g.refs.length}회</b>{(() => { const u = [...g.users].filter(x => x !== '직원 미전송').length; return u > 0 && u < g.refs.length && <span>직원 {u}명</span> })()}</td>
            <td className={f.sent}><Sent segs={sentence(g, 0, true)} /></td>
            <td><div className={f.acts}>{isOpen
              ? <><Button size="sm" variant="ghost" className={f.exBtn} onClick={() => openDialog({ kind: 'exclude', groupKey: k })}>탐지 제외 검토</Button><Button size="sm" variant="quiet" onClick={() => keep([g])}>탐지 결과 유지</Button></>
              : <Tag tone={RES[g.fp || '']?.[1]} dot>{RES[g.fp || '']?.[0] || '처리함'}</Tag>}</div></td>
          </tr>
          {ex && <tr className={f.cases}><td colSpan={cols}><ol>{g.refs.map((x, n) => <li key={n} title={`${x.e.dept} · ${x.e.ai}`}>
            <p><Sent segs={sentence(g, n)} /></p>
            <span>{x.e.user} · {ago(x.e.time)}{x.e.ver ? ` · 정책 ${x.e.ver}` : ''}</span>
          </li>)}</ol></td></tr>}
          </Fragment>
        })}</tbody>
      </table></div>
        : <Empty center icon={<Flag size={20} />} title={isOpen ? '처리할 신고가 없어요' : '아직 처리한 신고가 없어요'} text={'직원이 "오탐"으로 되돌리면 여기에 모여요'}>{isOpen && <LinkButton href="#home">작업판으로</LinkButton>}</Empty>}
      </section>
    </div>
  )
}
