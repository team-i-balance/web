// 현황 모델: 기간 동안의 숫자와 서버 집계. 화면 모양은 Insights.tsx 가 맡는다.
import { useEffect, useState } from 'react'
import { S, type ServerStats } from '../../domain/store'
import { exportLogs, periodStats, type ExportResult } from '../../api/client'

const DAY = 864e5
export function useInsightsModel(span: '7' | '30') {
  const n = +span, end = new Date(S.now), from = new Date(+end - n * DAY)
  const E = S.events.filter(e => e.time >= from && e.time <= end)
  const days = Array.from({ length: n }, (_, j) => {
    const d0 = new Date(end.getFullYear(), end.getMonth(), end.getDate() - (n - 1 - j)), d1 = new Date(+d0 + DAY)
    const es = E.filter(e => e.time >= d0 && e.time < d1)
    return { d: d0, n: es.length, raw: es.filter(e => e.action === 'raw').length }
  })
  const sens = E.filter(e => e.grade === 'S'), raw = E.filter(e => e.action === 'raw').length
  const items = sens.flatMap(e => e.items)
  const rev = items.filter(x => x.status === 'revert').length
  const byType = Object.entries(items.reduce<Record<string, { n: number; rev: number }>>((m, x) => { const b = (m[x.type] ||= { n: 0, rev: 0 }); b.n++; if (x.status === 'revert' || x.status === 'raw') b.rev++; return m }, {}))
    .sort((a, b) => b[1].n - a[1].n).slice(0, 8)
  const tmax = Math.max(1, ...byType.map(([, b]) => b.n))
  const byAi = Object.entries(E.filter(e => e.ai !== 'AI 미전송').reduce<Record<string, number>>((m, e) => ((m[e.ai] = (m[e.ai] || 0) + 1), m), {})).sort((a, b) => b[1] - a[1])
  const amax = Math.max(1, ...byAi.map(([, v]) => v))
  // 서버 통계는 고른 기간으로 다시 받는다
  const [pst, setPst] = useState<ServerStats | null>(null)
  useEffect(() => { if (S.api.live) periodStats(n).then(setPst, () => setPst(null)) }, [n, S.api.synced])
  const st = S.api.live ? pst ?? S.api.stats : null
  // 로그 내보내기: 기간을 고정해 두고 next_cursor 로 이어 간다
  const [ex, setEx] = useState<null | { busy: boolean; total: number; last?: ExportResult; err?: string; range: [Date, Date] }>(null)
  useEffect(() => setEx(null), [n])
  const runExport = async (cont = false) => {
    const range: [Date, Date] = cont && ex ? ex.range : [new Date(Date.now() - n * DAY), new Date()]
    const base = cont && ex ? ex.total : 0
    setEx({ busy: true, total: base, last: cont ? ex?.last : undefined, range })
    try { const r = await exportLogs(range[0], range[1], cont ? ex?.last?.next_cursor : null); setEx({ busy: false, total: base + r.exported, last: r, range }) }
    catch (e) { setEx({ busy: false, total: base, last: cont ? ex?.last : undefined, err: String((e as Error)?.message || e), range }) }
  }
  return { n, end, from, E, days, sens, raw, items, rev, byType, tmax, byAi, amax, st, live: S.api.live, ex, runExport }
}
