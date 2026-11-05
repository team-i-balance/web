// 오탐 신고: 직원이 "오탐"으로 되돌린 값을 값별로 묶어 처리
import { S, emit, useStore, fpGroups, groupKey, caseById, toast } from '../domain/store'
import { openDialog } from '../ui/Dialogs'
import { partial } from '../lib/util'
import type { FpGroup } from '../domain/types'

const RES: Record<string, string> = { exclude: '탐지 제외함', keep: '탐지 결과 유지' }
const sentence = (g: FpGroup) => { const r = g.refs[0]; return r.e.tpl.replace(/\{(\d)\}/g, (_, j) => (r.e.items[+j] === r.it ? '⟪' + partial(g.type, r.it.orig) + '⟫' : '…')) }

export default function FalsePositives() {
  useStore()
  const tab = S.ui.fpTab
  const groups = fpGroups(tab === 'open')
  const keep = (g: FpGroup) => { g.refs.forEach(r => (r.it.fp = 'keep')); toast('탐지 결과를 유지했어요') }
  return (
    <section className="card">
      <div className="card-h">
        <h1 className="t32">오탐 신고</h1>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'open'} className={tab === 'open' ? 'on' : ''} onClick={() => { S.ui.fpTab = 'open'; emit() }}>처리할 신고<span className="n">{fpGroups(true).length}</span></button>
          <button role="tab" aria-selected={tab === 'done'} className={tab === 'done' ? 'on' : ''} onClick={() => { S.ui.fpTab = 'done'; emit() }}>처리함<span className="n">{fpGroups(false).length}</span></button>
        </div>
      </div>
      <div className="card-b">
        {groups.length ? <div className="scroll"><table>
          <thead><tr><th>잡힌 값</th><th>탐지 항목</th><th className="num">신고</th><th>나온 문장</th><th className="num">{tab === 'open' ? '처리' : '결과'}</th></tr></thead>
          <tbody>{groups.map(g => {
            const cs = g.refs.map(x => caseById('INC-' + x.e.id)).filter(Boolean)
            return <tr key={groupKey(g)}>
              <td style={{ whiteSpace: 'nowrap' }}><b>{partial(g.type, g.value)}</b></td>
              <td style={{ whiteSpace: 'nowrap' }}>{g.type}</td>
              <td className="num" style={{ whiteSpace: 'nowrap' }}>{g.refs.length}회</td>
              <td style={{ minWidth: 240 }}><div className="cell-sub">{sentence(g)}</div>{cs.length > 0 && <a className="cell-sub" href={`#review/${cs[0]!.id}`}>선택 검토에도 있어요</a>}</td>
              <td className="num" style={{ whiteSpace: 'nowrap' }}>{tab === 'open'
                ? <><button className="btn sm" onClick={() => keep(g)}>탐지 결과 유지</button> <button className="btn sm" onClick={() => openDialog({ kind: 'exclude', groupKey: groupKey(g) })}>탐지 제외 검토</button></>
                : <span className="pill">{RES[g.fp || ''] || '처리함'}</span>}</td>
            </tr>
          })}</tbody>
        </table></div>
          : <div className="empty"><b>{tab === 'open' ? '처리할 신고가 없어요' : '아직 처리한 신고가 없어요'}</b><span className="sub">직원이 "오탐"으로 되돌리면 여기에 모여요</span></div>}
      </div>
    </section>
  )
}
