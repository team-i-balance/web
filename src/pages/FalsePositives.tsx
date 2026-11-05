// 오탐 신고: 직원이 "오탐"으로 되돌린 값을 값별로 묶어 처리. 여러 값을 골라 한 번에 "탐지 결과 유지"할 수 있다.
import { useState } from 'react'
import { S, emit, useStore, fpGroups, groupKey, caseById, undoToast } from '../domain/store'
import { openDialog } from '../ui/Dialogs'
import { partial } from '../lib/util'
import type { FpGroup } from '../domain/types'

const RES: Record<string, string> = { exclude: '탐지 제외함', keep: '탐지 결과 유지' }
const sentence = (g: FpGroup) => { const r = g.refs[0]; return r.e.tpl.replace(/\{(\d)\}/g, (_, j) => (r.e.items[+j] === r.it ? '⟪' + partial(g.type, r.it.orig) + '⟫' : '…')) }

export default function FalsePositives() {
  useStore()
  const tab = S.ui.fpTab
  const groups = fpGroups(tab === 'open')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const live = new Set(groups.map(groupKey)), sel = [...picked].filter(k => live.has(k))
  const keep = (gs: FpGroup[]) => {
    gs.forEach(g => g.refs.forEach(r => (r.it.fp = 'keep')))
    setPicked(new Set())
    undoToast(gs.length > 1 ? `${gs.length}개 값 · 탐지 결과 유지` : `${partial(gs[0].type, gs[0].value)} · 탐지 결과 유지`, () => gs.forEach(g => g.refs.forEach(r => (r.it.fp = 'open'))))
  }
  const toggle = (k: string) => { const n = new Set(picked); n.has(k) ? n.delete(k) : n.add(k); setPicked(n) }
  const all = sel.length === groups.length && groups.length > 0
  const setTab = (t: 'open' | 'done') => { S.ui.fpTab = t; setPicked(new Set()); emit() }
  return (
    <section className="card">
      <div className="card-h">
        <h1 className="t32">오탐 신고</h1>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'open'} className={tab === 'open' ? 'on' : ''} onClick={() => setTab('open')}>처리할 신고<span className="n">{fpGroups(true).length}</span></button>
          <button role="tab" aria-selected={tab === 'done'} className={tab === 'done' ? 'on' : ''} onClick={() => setTab('done')}>처리함<span className="n">{fpGroups(false).length}</span></button>
        </div>
      </div>
      <div className="card-b">
        {tab === 'open' && sel.length > 0 && <div className="bulkbar" role="region" aria-label="선택한 값 처리">
          <span className="sub"><b>{sel.length}개</b> 골랐어요</span>
          <button className="btn sm ghost" onClick={() => setPicked(new Set())}>선택 해제</button>
          <button className="btn sm" onClick={() => keep(groups.filter(g => sel.includes(groupKey(g))))}>{sel.length}개 탐지 결과 유지</button>
        </div>}
        {groups.length ? <div className="scroll"><table className="fpt">
          <thead><tr>
            {tab === 'open' && <th className="pick"><input type="checkbox" className="chk" aria-label="모두 고르기" checked={all} onChange={() => setPicked(all ? new Set() : new Set(groups.map(groupKey)))} /></th>}
            <th>잡힌 값</th><th>탐지 항목</th><th className="num">신고</th><th>나온 문장</th><th className="num">{tab === 'open' ? '처리' : '결과'}</th>
          </tr></thead>
          <tbody>{groups.map(g => {
            const k = groupKey(g), cs = g.refs.map(x => caseById('INC-' + x.e.id)).filter(Boolean)
            return <tr key={k}>
              {tab === 'open' && <td className="pick"><input type="checkbox" className="chk" aria-label={`${partial(g.type, g.value)} 고르기`} checked={picked.has(k)} onChange={() => toggle(k)} /></td>}
              <td style={{ whiteSpace: 'nowrap' }}><b>{partial(g.type, g.value)}</b></td>
              <td style={{ whiteSpace: 'nowrap' }}>{g.type}</td>
              <td className="num cnt-cell" style={{ whiteSpace: 'nowrap' }}>{g.refs.length}회 · {g.users.size}명</td>
              <td style={{ minWidth: 240 }}><div className="cell-sub">{sentence(g)}</div>{cs.length > 0 && <a className="cell-sub" href={`#review/${cs[0]!.id}`}>선택 검토에도 있어요</a>}</td>
              <td className="num acts" style={{ whiteSpace: 'nowrap' }}>{tab === 'open'
                ? <><button className="btn sm" onClick={() => keep([g])}>탐지 결과 유지</button> <button className="btn sm" onClick={() => openDialog({ kind: 'exclude', groupKey: k })}>탐지 제외 검토</button></>
                : <span className="pill">{RES[g.fp || ''] || '처리함'}</span>}</td>
            </tr>
          })}</tbody>
        </table></div>
          : <div className="empty"><b>{tab === 'open' ? '처리할 신고가 없어요' : '아직 처리한 신고가 없어요'}</b><span className="sub">직원이 "오탐"으로 되돌리면 여기에 모여요</span>{tab === 'done' ? null : <a className="btn sm" href="#home">작업판으로 가기</a>}</div>}
      </div>
    </section>
  )
}
