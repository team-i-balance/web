// 위반 검토 모델: 목록·고른 건·탭·일괄 고르기. 판단 동작은 domain/store 의 quickClose·reopen·closeCase 를 쓴다.
import { S, emit, caseById, openOf } from '../../domain/store'

export type Tab = 'req' | 'opt' | 'closed'
export function listOf(tab: Tab) {
  return S.cases.filter(c => (tab === 'closed' ? c.status === 'closed' : c.need === tab && c.status === 'open'))
    .sort(tab === 'closed' ? (a, b) => +b.close!.at - +a.close!.at : tab === 'req' ? (a, b) => (+!!b.reason - +!!a.reason) || +b.time - +a.time : (a, b) => +b.time - +a.time)
}

export function useReviewModel(idArg: string | undefined, wide: boolean) {
  if (idArg) { const c = caseById(idArg); if (c) S.ui.rqTab = c.status === 'closed' ? 'closed' : c.need }
  const tab = S.ui.rqTab
  const list = listOf(tab)
  const id = idArg || (wide && list[0] ? list[0].id : undefined)
  const c = id ? caseById(id) : undefined
  const ready = list.filter(x => x.reason), wait = list.filter(x => !x.reason)
  const picked = [...S.ui.picked].filter(k => list.some(x => x.id === k))

  const setTab = (k: Tab) => { S.ui.rqTab = k; S.ui.picked.clear(); if (location.hash === '#review') emit(); else location.hash = 'review' }
  const count = (k: Tab) => (k === 'closed' ? S.cases.filter(x => x.status === 'closed').length : openOf(k).length)
  const anyReady = openOf('req').some(x => x.reason)
  return { tab, list, c, ready, wait, picked, setTab, count, anyReady }
}
