// 오탐 신고: 직원이 "오탐"으로 되돌린 값을 값별로 묶어 처리한다. 여러 값을 골라 한 번에 "탐지 결과 유지"할 수 있다.
import { Fragment, useState } from 'react'
import { ChevronDown, Flag } from 'lucide-react'
import clsx from 'clsx'
import { S, useStore, groupKey, caseById, ago, fpReasons, fpPeople, known } from '../../domain/store'
import { useFpModel } from './model'
import { Button, Checkbox, Empty, LinkButton, Notice, Segmented, Tag, ds } from '../../ds'
import { openDialog } from '../dialogs'
import type { ServerEvent } from '../../api/client'
import { partial } from '../../lib/util'
import f from './fp.module.css'

const RES: Record<string, [string, 'ok' | undefined]> = { exclude: ['탐지 제외함', 'ok'], keep: ['탐지 결과 유지', undefined] }

export default function FalsePositives() {
  useStore()
  const { tab, groups, picked, sel, all, keep, toggle, setTab, counts, clear, toggleAll } = useFpModel()
  const [open, setOpen] = useState<string | null>(null)
  const isOpen = tab === 'open'
  // 서버 이벤트에 항목(값 해시)이 없는 오탐 신고: 묶을 수 없어 건수만 알린다
  const noValue = S.events.filter(e => { const v = e.server as ServerEvent | undefined; return v?.reason === 'false_positive' && !v.items?.some(i => (i.decision === 'reverted' || i.decision === 'raw') && i.value_hash) }).length
  const keyMissing = S.api.pol?.keySet === false
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
      {noValue > 0 && <Notice tone="warning" title={keyMissing ? `서버에 값 해시 키가 없어 오탐 신고 ${noValue}건을 값으로 묶지 못했어요` : `값 정보가 없는 예전 오탐 신고 ${noValue}건은 목록에서 뺐어요`} />}
      <section className={f.page} aria-label="오탐 신고">
      {groups.length ? <div className={f.scroll}><table className={clsx(ds.table, ds.table2, f.t)} data-tab={tab}>
        <colgroup>
          {isOpen && <col className={f.cPick} />}<col className={f.cChev} /><col className={f.cVal} /><col className={f.cCnt} /><col /><col className={f.cAct} />
        </colgroup>
        <thead><tr>
          {isOpen && <th className={f.pick}><Checkbox checked={all ? true : sel.length ? 'indeterminate' : false} label="모두 고르기" onChange={toggleAll} /></th>}
          <th className={f.chevC} aria-hidden="true" /><th>잡힌 값</th><th className="num">신고</th><th>직원 사유</th>
          {isOpen ? <th aria-label="처리" /> : <th className={f.actH}>결과</th>}
        </tr></thead>
        <tbody>{groups.map(g => {
          const k = groupKey(g), cs = g.refs.map(x => caseById('INC-' + x.e.id)).filter(Boolean)
          const ex = open === k, cols = isOpen ? 6 : 5
          return <Fragment key={k}><tr data-picked={picked.has(k) || undefined} data-open={ex || undefined} className={f.clickRow} onClick={e => { if (!(e.target as HTMLElement).closest('button,a,[role=checkbox]')) setOpen(ex ? null : k) }}>
            {isOpen && <td className={f.pick}><Checkbox checked={picked.has(k)} label={`${partial(g.type, g.value)} 고르기`} onChange={v => toggle(k, v)} /></td>}
            <td className={f.chevC}><ChevronDown size={16} className={f.chev} aria-hidden="true" /></td>
            <td><div className={f.val}><b>{partial(g.type, g.value)}</b><span>{g.type}{cs.length > 0 && <a className={clsx(ds.tag, ds.tagOutline)} href={`#review/${cs[0]!.id}`}>선택 검토 있음</a>}</span></div></td>
            <td className={clsx('num', f.cnt)}><b>{g.refs.length}회</b>{fpPeople(g) > 0 && fpPeople(g) < g.refs.length && <span>직원 {fpPeople(g)}명</span>}</td>
            {/* 서버가 값을 다 가려서 무엇인지는 직원이 쓴 사유로 판단한다 */}
            <td className={f.sent}>{fpReasons(g).length ? <span className={f.why}>{fpReasons(g)[0]}{fpReasons(g).length > 1 && <small> 외 {fpReasons(g).length - 1}개</small>}</span> : <span className={f.none}>사유 글 없음</span>}</td>
            <td><div className={f.acts}>{isOpen
              ? <><Button size="sm" variant="ghost" className={f.exBtn} onClick={() => openDialog({ kind: 'exclude', groupKey: k })}>탐지 제외 검토</Button><Button size="sm" variant="quiet" onClick={() => keep([g])}>탐지 결과 유지</Button></>
              : <Tag tone={RES[g.fp || '']?.[1]} dot>{RES[g.fp || '']?.[0] || '처리함'}</Tag>}</div></td>
          </tr>
          {ex && <tr className={f.cases}><td colSpan={cols}><ol>{g.refs.map((x, n) => <li key={n}>
            <p>{(x.e.server as { reason_text?: string | null } | undefined)?.reason_text || <span className={f.none}>사유 글 없음</span>}</p>
            <span>{known(x.e.user, x.e.dept, x.e.ai, ago(x.e.time), x.e.ver ? `정책 ${x.e.ver}` : '')}</span>
          </li>)}</ol></td></tr>}
          </Fragment>
        })}</tbody>
      </table></div>
        : <Empty center icon={<Flag size={20} />} title={isOpen ? '처리할 신고가 없어요' : '아직 처리한 신고가 없어요'} text={'직원이 "오탐"으로 되돌리면 여기에 모여요'}>{isOpen && <LinkButton href="#home">작업판으로</LinkButton>}</Empty>}
      </section>
    </div>
  )
}
