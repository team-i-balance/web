// 현황: 기간(7일·30일) 동안 AI 입력·변환·원문 전송·되돌림. 서버에 없는 필드(대상 AI·부서)는 차트를 숨긴다.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { S, useStore } from '../../domain/store'
import { QUEUE_KO, periodStats } from '../../api/client'
import type { ServerStats } from '../../domain/store'
import { Button, Segmented, Tag } from '../../ds'
import { pad, pct } from '../../lib/util'
import i from './insights.module.css'

const DAY = 864e5
const GRADE_KO = { O: '공개', S: '민감', C: '기밀' } as const
const ACT_KO: Record<string, string> = { sent: '변환해서 보냄', raw: '원문 그대로 보냄', revert: '원문으로 되돌림', cancel: '보내지 않음', block: '기밀 차단', pass: '그대로 보냄' }
const ACTION_KO: Record<string, string> = { send_transformed: '변환해서 보냄', send_as_is: '원문 그대로 보냄', revert_original: '원문으로 되돌림', cancel: '보내지 않음' }
const md = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`

// 일별 막대: 한 계열만 그리므로 범례 대신 제목이 이름을 맡는다
// 눈금: 1·2·5 단위로 끝이 깔끔한 최댓값
function niceMax(m: number) { if (m <= 4) return Math.max(1, m); const p = 10 ** Math.floor(Math.log10(m)); return [1, 2, 2.5, 5, 10].map(x => x * p).find(x => x >= m)! }
function Daily({ days, k, raw }: { days: { d: Date; n: number; raw: number }[]; k: 'n' | 'raw'; raw?: boolean }) {
  const [hov, setHov] = useState(-1)
  const box = useRef<HTMLDivElement>(null), [cw, setCw] = useState(600)
  useLayoutEffect(() => { const el = box.current; if (!el) return; const ro = new ResizeObserver(() => setCw(el.clientWidth)); ro.observe(el); setCw(el.clientWidth); return () => ro.disconnect() }, [])
  const W = Math.max(240, cw), H = 160, L = 28, B = 22, max = Math.max(1, ...days.map(d => d[k])), step = (W - L) / days.length, bw = Math.max(3, Math.min(28, step - 4))
  const nice = niceMax(max), ys = nice <= 2 ? [0, nice] : [0, nice / 2, nice]
  const y = (v: number) => (H - B) - (v / nice) * (H - B - 6)
  const every = Math.max(1, Math.ceil(days.length / Math.floor((W - L) / 44)))
  return (
    <div className={i.chart} ref={box} onMouseLeave={() => setHov(-1)}>
      <svg viewBox={`0 0 ${W} ${H}`} height={H} role="img" aria-label={`${raw ? '원문 전송' : 'AI 입력'} 일별 건수`}>
        <g className={i.grid}>{ys.map(v => <line key={v} x1={L} x2={W} y1={y(v)} y2={y(v)} />)}</g>
        {ys.map(v => <text key={v} className={i.axis} x={L - 6} y={y(v) + 4} textAnchor="end">{v}</text>)}
        {days.map((d, j) => {
          const x = L + j * step + (step - bw) / 2, v = d[k], h = Math.max(v ? 2 : 0, (H - B) - y(v))
          return <g key={j} onMouseEnter={() => setHov(j)}>
            <rect className={i.hit} x={L + j * step} y={0} width={step} height={H - B} />
            <rect className={`${i.hl} ${hov === j ? i.on : ''}`} x={L + j * step + 1} y={0} width={step - 2} height={H - B} rx={4} style={{ fill: hov === j ? 'var(--hover)' : 'transparent' }} />
            {v > 0 && <path className={`${i.bar} ${raw ? i.raw : ''}`} d={`M${x},${H - B} V${H - B - h + 4} q0,-4 4,-4 h${bw - 8} q4,0 4,4 V${H - B} Z`} />}
            {j % every === 0 && <text className={i.axis} x={x + bw / 2} y={H - 6} textAnchor="middle">{md(d.d)}</text>}
          </g>
        })}
      </svg>
      {hov >= 0 && <div className={i.tip} style={{ left: `${((L + hov * step + step / 2) / W) * 100}%`, top: `${(y(days[hov][k]) / H) * 100}%` }}>
        {md(days[hov].d)} · <b>{days[hov][k]}건</b>{!raw && days[hov].raw > 0 ? ` · 원문 전송 ${days[hov].raw}` : ''}
      </div>}
    </div>
  )
}

export default function Insights() {
  useStore()
  const [span, setSpan] = useState<'7' | '30'>('7')
  const [more, setMore] = useState(20)
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
  return (
    <div className={i.wrap}>
      <div className={i.head}>
        <div><h1>현황</h1><p>{md(from)} – {md(end)} · {S.api.live ? '서버 데이터' : '예시 데이터'} · {pad(end.getHours())}:{pad(end.getMinutes())} 기준</p></div>
        <Segmented label="기간" value={span} onChange={setSpan} items={[{ k: '7', t: '7일' }, { k: '30', t: '30일' }]} />
      </div>
      <div className={i.tiles}>
        <div className={i.tile}><span>AI 입력</span><b>{E.length.toLocaleString()}</b><small>하루 평균 {Math.round(E.length / n)}건{E.some(e => e.file) ? ` · 파일 ${E.filter(e => e.file).length}건` : ''}</small></div>
        <div className={i.tile}><span>개인정보 변환</span><b>{sens.length.toLocaleString()}</b><small>입력의 {pct(sens.length, E.length)}%</small></div>
        <div className={i.tile}><span>원문 전송</span><b style={{ color: raw ? 'var(--danger)' : undefined }}>{raw}</b><small>민감 입력의 {pct(raw, sens.length)}%</small></div>
        <div className={i.tile}><span>항목 되돌림률</span><b>{pct(rev, items.length)}%</b><small>{items.length}개 항목 중 {rev}개</small></div>
      </div>
      <div className={i.grid}>
        <section className={i.card}><h2>AI 입력<small>일별</small></h2><Daily days={days} k="n" /></section>
        <section className={i.card}><h2>원문 전송<small>일별 · 사유 선택 건너뜀</small></h2><Daily days={days} k="raw" raw /></section>
      </div>
      <div className={i.grid}>
        <section className={i.card}>
          <h2>탐지 항목<small>건수 · 원문으로 나간 비율</small></h2>
          {byType.length ? <div className={i.hbars}>{byType.map(([t, b]) => { const r = pct(b.rev, b.n); return (
            <div key={t} className={i.hb} title={`${t} ${b.n}개 중 ${b.rev}개 원문`}><span>{t}</span><span className={i.track}><i style={{ width: `${(b.n / tmax) * 100}%` }} /></span>
              <em><span className={r >= 30 ? i.warn : undefined}>{r}%</span><small>{b.n}개</small></em></div>) })}</div>
            : <p className={i.note}>이 기간에 민감 입력이 없어요</p>}
          <details><summary>표로 보기</summary><table className={i.table}><thead><tr><th>항목</th><th>건수</th><th>원문</th></tr></thead><tbody>{byType.map(([t, b]) => <tr key={t}><td>{t}</td><td>{b.n}</td><td>{b.rev}</td></tr>)}</tbody></table></details>
        </section>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          {byAi.length > 0 && <section className={i.card}>
            <h2>대상 AI<small>입력 건수</small></h2>
            <div className={i.hbars}>{byAi.map(([t, v]) => <div key={t} className={i.hb}><span>{t}</span><span className={i.track}><i style={{ width: `${(v / amax) * 100}%` }} /></span><em>{v}건</em></div>)}</div>
          </section>}
          {st && <section className={i.card}>
            <h2>서버 집계<small>{n}일 · 전체 이벤트 기준</small></h2>
            <div className={i.queues}>{Object.entries(st.by_queue).map(([k, v]) => <div key={k} className={i.q}>{QUEUE_KO[k] || k}<b>{v}</b></div>)}</div>
            {st.by_action && <div className={i.queues}>{Object.entries(st.by_action).map(([k, v]) => <div key={k} className={i.q}>{ACTION_KO[k] || k}<b>{v}</b></div>)}</div>}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><Tag>수용률 {Math.round(st.acceptance_rate * 100)}%</Tag><Tag>되돌림률 {Math.round(st.revert_rate * 100)}%</Tag>{st.evasion_suspect > 0 && <Tag tone="warn">회피 의심 {st.evasion_suspect}</Tag>}</div>
          </section>}
          {S.api.live && byAi.length === 0 && <p className={i.note}>대상 AI는 서버 이벤트에 값이 있을 때만 보여요.</p>}
        </div>
      </div>
      <section className={i.card} id="recent" aria-label="최근 입력">
        <h2>최근 입력<small>{E.length}건 중 {Math.min(more, E.length)}건 · 최신순</small></h2>
        {E.length ? <div className={i.tbox}><table className={i.log}><thead><tr><th>시각</th><th>직원</th><th>대상 AI</th><th>잡힌 항목</th><th>등급</th><th>처리</th></tr></thead><tbody>
          {E.slice(0, more).map(e => <tr key={e.id}>
            <td className={i.nowrap}>{md(e.time)} {pad(e.time.getHours())}:{pad(e.time.getMinutes())}{e.test && <Tag tone="warn">시험</Tag>}</td>
            <td className={i.nowrap}>{e.user}<small> {e.dept}</small></td>
            <td className={i.nowrap}>{e.ai === 'AI 미전송' ? '—' : e.ai}{e.file && <Tag>{e.file.name}</Tag>}</td>
            <td>{[...new Set(e.items.map(x => x.type))].join(', ') || '—'}</td>
            <td><Tag tone={e.grade === 'C' ? 'warn' : undefined}>{GRADE_KO[e.grade]}</Tag></td>
            <td className={i.nowrap}>{e.action === 'raw' ? <Tag tone="danger">{ACT_KO[e.action]}</Tag> : ACT_KO[e.action]}</td>
          </tr>)}
        </tbody></table></div> : <p className={i.note}>이 기간에 들어온 입력이 없어요</p>}
        {E.length > more && <div><Button size="sm" onClick={() => setMore(m => m + 50)}>더 보기</Button></div>}
      </section>
    </div>
  )
}
