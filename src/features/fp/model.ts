// 오탐 신고 모델: 값별 묶음, 고르기, 탐지 결과 유지(되돌리기 포함). 화면 모양은 FalsePositives.tsx 가 맡는다.
import { S, emit, fpGroups, groupKey, undoToast } from '../../domain/store'
import type { FpGroup } from '../../domain/types'
import { partial } from '../../lib/util'

export function useFpModel() {
  const tab = S.ui.fpTab
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
  const counts = { open: fpGroups(true).length, done: fpGroups(false).length }
  const clear = () => { picked.clear(); emit() }
  const toggleAll = () => { all ? picked.clear() : groups.forEach(g => picked.add(groupKey(g))); emit() }
  return { tab, groups, picked, sel, all, keep, toggle, setTab, counts, clear, toggleAll }
}
