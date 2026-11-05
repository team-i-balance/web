// 현황: 기간(7일·30일) 동안 AI 입력·변환·원문 전송·되돌림. 서버에 없는 필드(대상 AI·부서)는 차트를 숨긴다.
import { useLayoutEffect, useRef, useState } from 'react'
import { useStore, toast } from '../../domain/store'
import { QUEUE_KO, downloadExport } from '../../api/client'
import { useInsightsModel } from './model'
import { Button, Notice, Segmented, Tag, ds } from '../../ds'
import clsx from 'clsx'
import { Download } from 'lucide-react'
import { pad, pct } from '../../lib/util'
import i from './insights.module.css'

const GRADE_KO = { O: '공개', S: '민감', C: '기밀' } as const
const ACT_KO: Record<string, string> = { sent: '변환해서 보냄', raw: '원문 그대로 보냄', revert: '원문으로 되돌림', cancel: '보내지 않음', block: '기밀 차단', pass: '그대로 보냄' }
const ACTION_KO: Record<string, string> = { send_transformed: '변환해서 보냄', send_as_is: '원문 그대로 보냄', revert_original: '원문으로 되돌림', cancel: '보내지 않음' }
const md = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`

// 일별 막대: 한 계열만 그리므로 범례 대신 제목이 이름을 맡는다
// 눈금: 1·2·5 단위로 끝이 깔끔한 최댓값
function niceMax(m: number) { if (m <= 4) return Math.max(1, m); const p = 10 ** Math.floor(Math.log10(m)); return [1, 2, 2.5, 5, 10].map(x => x * p).find(x => x >= m)! }
// 7일: 막대 위에 값을 쓰고 축 숫자는 없앤다. 30일: 축과 툴팁으로 읽는다
function Daily({ days, k, raw }: { days: { d: Date; n: number; raw: number }[]; k: 'n' | 'raw'; raw?: boolean }) {
  const [hov, setHov] = useState(-1)
  const box = useRef<HTMLDivElement>(null), [cw, setCw] = useState(600)
  useLayoutEffect(() => { const el = box.current; if (!el) return; const ro = new ResizeObserver(() => setCw(el.clientWidth)); ro.observe(el); setCw(el.clientWidth); return () => ro.disconnect() }, [])
  const few = days.length <= 7
  const W = Math.max(240, cw), H = 140, L = few ? 0 : 28, B = 22, max = Math.max(1, ...days.map(d => d[k])), step = (W - L) / days.length, bw = Math.max(3, Math.min(36, step - 4))
  const nice = few ? max : niceMax(max), ys = few ? [0] : nice <= 2 ? [0, nice] : [0, nice / 2, nice]
  const top = few ? 20 : 6
  const y = (v: number) => (H - B) - (v / nice) * (H - B - top)
  const every = Math.max(1, Math.ceil(days.length / Math.floor((W - L) / 44)))
  return (
    <div className={i.chart} ref={box} onMouseLeave={() => setHov(-1)}>
      <svg viewBox={`0 0 ${W} ${H}`} height={H} role="img" aria-label={`${raw ? '원문 전송' : 'AI 입력'} 일별 건수: ${days.map(d => `${md(d.d)} ${d[k]}건`).join(', ')}`}>
        <g className={i.gridlines}>{ys.map(v => <line key={v} x1={L} x2={W} y1={y(v)} y2={y(v)} />)}</g>
        {!few && ys.map(v => <text key={v} className={i.axis} x={L - 6} y={y(v) + 4} textAnchor="end">{v}</text>)}
        {days.map((d, j) => {
          const x = L + j * step + (step - bw) / 2, v = d[k], h = Math.max(v ? 2 : 0, (H - B) - y(v))
          return <g key={j} className={hov === j ? i.on : undefined} onMouseEnter={() => setHov(j)}>
            <rect className={i.hit} x={L + j * step} y={0} width={step} height={H - B} />
            <rect className={i.hl} x={L + j * step + 1} y={0} width={step - 2} height={H - B} rx={4} />
            {v > 0 && <path className={`${i.bar} ${raw ? i.raw : ''}`} d={`M${x},${H - B} V${H - B - h + 4} q0,-4 4,-4 h${bw - 8} q4,0 4,4 V${H - B} Z`} />}
            {few && <text className={i.val} x={x + bw / 2} y={H - B - h - 6} textAnchor="middle">{v}</text>}
            {j % every === 0 && <text className={i.axis} x={x + bw / 2} y={H - 6} textAnchor="middle">{md(d.d)}</text>}
          </g>
        })}
      </svg>
      {!few && hov >= 0 && <div className={i.tip} style={{ left: `${((L + hov * step + step / 2) / W) * 100}%`, top: `${(y(days[hov][k]) / H) * 100}%` }}>
        {md(days[hov].d)} · <b>{days[hov][k]}건</b>{!raw && days[hov].raw > 0 ? ` · 원문 전송 ${days[hov].raw}` : ''}
      </div>}
    </div>
  )
}

export default function Insights() {
  useStore()
  const [span, setSpan] = useState<'7' | '30'>('7')
  const [more, setMore] = useState(20)
  const { truncated, n, end, from, E, days, raw, sent, byType, tmax, byAi, amax, st, live, ex, runExport } = useInsightsModel(span)
  const files = E.filter(e => e.file).length
  return (
    <div className={i.wrap}>
      <div className={ds.pageHead}>
        <h1>현황</h1>
        <span className={ds.pageMeta}>{md(from)} – {md(end)} · {pad(end.getHours())}:{pad(end.getMinutes())} 기준{truncated && ' · 너무 많아 일부만 불러옴'}</span>
        <div className={ds.pageTools}>
          <Segmented label="기간" value={span} onChange={setSpan} items={[{ k: '7', t: '7일' }, { k: '30', t: '30일' }]} />
          {live && <Button icon={<Download size={14} />} disabled={ex?.busy} onClick={() => runExport()}>{ex?.busy ? '내보내는 중…' : `${n}일 로그 내보내기`}</Button>}
        </div>
      </div>
      {ex && !ex.busy && (ex.err
        ? <Notice tone="error" title="로그를 내보내지 못했어요">{ex.err}</Notice>
        : ex.last && <Notice tone="success" title={`${ex.total.toLocaleString()}건을 암호화해 서버에 저장했어요`}
          actions={ex.last.next_cursor ? <Button size="sm" onClick={() => runExport(true)}>이어서 내보내기</Button> : undefined}>
          보안팀 공개키(지문 <code>{ex.last.public_key_fingerprint}</code>)로 잠갔어요. {ex.files.length > 1 ? `파일 ${ex.files.length}개 · ` : ''}{ex.files.map(f => <Button key={f} size="sm" variant="ghost" icon={<Download size={14} />} onClick={() => downloadExport(f).catch(e => toast(`파일을 받지 못했어요 (${(e as Error).message})`))}>{f}</Button>)}
          {ex.last.next_cursor ? ' · 이 기간에 남은 로그가 더 있어요' : ' · 이 기간 로그를 모두 내보냈어요'}
        </Notice>)}
      <div className={i.tiles}>
        <div className={i.tile}><span>AI 입력</span><b>{E.length.toLocaleString()}</b>{files > 0 && <small>파일 {files}건</small>}</div>
        <div className={i.tile}><span>변환해서 보냄</span><b>{sent.toLocaleString()}</b><small>입력의 {pct(sent, E.length)}%</small></div>
        <div className={i.tile}><span>원문 전송</span><b className={raw ? i.danger : undefined}>{raw}</b><small>원문 그대로·되돌림 · 입력의 {pct(raw, E.length)}%</small></div>
        {/* 항목별 되돌림은 서버에 없어(값 정보 미전송) 서버가 센 되돌림률만 보인다 */}
        {st && <div className={i.tile}><span>되돌림률</span><b>{Math.round(st.revert_rate * 100)}%</b><small>서버 집계 · 되돌린 건 / 전체</small></div>}
      </div>
      <div className={i.grid}>
        <section className={ds.panel}><h2>AI 입력</h2><Daily days={days} k="n" /></section>
        <section className={ds.panel}><h2 title="원문 그대로 보냄 + 원문으로 되돌림">원문 전송</h2><Daily days={days} k="raw" raw /></section>
      </div>
      <div className={i.grid}>
        <section className={ds.panel}>
          <h2>탐지 항목</h2>
          {byType.length ? <div className={i.hbars} role="list" aria-label="탐지 항목별 건수와 원문 비율">
            <div className={clsx(i.hb, i.hh)} aria-hidden><span /><span /><span>건수</span><span>원문</span></div>
            {byType.map(([t, b]) => { const r = pct(b.rev, b.n); return (
              <div key={t} role="listitem" className={i.hb} aria-label={`${t} ${b.n}건, 원문 ${r}%`} title={`${t} ${b.n}개 중 ${b.rev}개 원문`}>
                <span>{t}</span><span className={i.track}><i style={{ width: `${(b.n / tmax) * 100}%` }} /></span>
                <span className={i.cnt}>{b.n}</span><span className={clsx(i.rate, r >= 30 && i.hi)}>{r}%</span>
              </div>) })}
          </div>
            : <p className={i.note}>이 기간에 민감 입력이 없어요</p>}
        </section>
        <div className={i.side}>
          {byAi.length > 0 && <section className={ds.panel}>
            <h2>대상 AI</h2>
            <div className={i.hbars} role="list" aria-label="대상 AI별 입력 건수">
              <div className={clsx(i.hb, i.hh)} aria-hidden><span /><span /><span>건수</span><span /></div>
              {byAi.map(([t, v]) => <div key={t} role="listitem" className={i.hb} aria-label={`${t} ${v}건`}><span>{t}</span><span className={i.track}><i style={{ width: `${(v / amax) * 100}%` }} /></span><span className={i.cnt}>{v}</span><span /></div>)}
            </div>
          </section>}
          {st && <section className={ds.panel}>
            <h2>서버 집계 · {n}일</h2>
            <div className={i.queues}>{Object.entries(st.by_queue).map(([k, v]) => <div key={k} className={i.q}>{QUEUE_KO[k] || k}<b>{v}</b></div>)}</div>
            {st.by_policy_version && <div className={i.queues}>{Object.entries(st.by_policy_version).sort(([a], [b]) => (a === 'none' ? 1 : b === 'none' ? -1 : +b - +a)).map(([k, v]) => <div key={k} className={i.q}>{k === 'none' ? '버전 기록 없음' : `정책 v${k}`}<b>{v}</b></div>)}</div>}
            {st.by_action && <details className={i.more}><summary>처리별 건수</summary><div className={i.queues}>{Object.entries(st.by_action).map(([k, v]) => <div key={k} className={i.q}>{ACTION_KO[k] || k}<b>{v}</b></div>)}</div></details>}
            {st.evasion_suspect > 0 && <div><Tag tone="warn">회피 의심 {st.evasion_suspect}</Tag></div>}
          </section>}
          {live && byAi.length === 0 && <p className={i.note}>대상 AI는 서버 이벤트에 값이 있을 때만 보여요.</p>}
        </div>
      </div>
      <section className={ds.panel} id="recent" aria-label="최근 입력">
        <h2>최근 입력<small>{E.length}건 중 {Math.min(more, E.length)}건</small></h2>
        {E.length ? <div className={i.tbox}><table className={clsx(ds.table, i.log)}><thead><tr><th className="num">시각</th><th>직원</th><th>대상 AI</th><th>잡힌 항목</th><th>등급</th><th>처리</th></tr></thead><tbody>
          {E.slice(0, more).map(e => <tr key={e.id}>
            <td className={clsx('num', i.time, i.nowrap)}>{md(e.time)} {pad(e.time.getHours())}:{pad(e.time.getMinutes())}{e.test && <Tag tone="warn">시험</Tag>}</td>
            <td className={i.nowrap}>{e.user}<small> {e.dept}</small></td>
            <td className={i.nowrap}>{e.ai === 'AI 미전송' ? '—' : e.ai}{e.file && <Tag>{e.file.name}</Tag>}</td>
            <td>{[...new Set(e.items.map(x => x.type))].join(', ') || '—'}</td>
            <td>{e.grade === 'C' && <Tag tone="warn">{GRADE_KO[e.grade]}</Tag>}</td>
            <td className={i.nowrap}>{e.action === 'raw' || e.action === 'revert' ? <Tag tone="danger">{ACT_KO[e.action]}</Tag> : ACT_KO[e.action]}</td>
          </tr>)}
        </tbody></table></div> : <p className={i.note}>이 기간에 들어온 입력이 없어요</p>}
        {E.length > more && <div><Button size="sm" onClick={() => setMore(m => m + 50)}>더 보기</Button></div>}
      </section>
    </div>
  )
}
