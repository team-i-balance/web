// 변환 정책: 지금 적용 중인 정책과 편집 중 초안. 바꾼 것은 서명 후 배포해야 직원 PC에 적용된다.
import { useRef } from 'react'
import { S, useStore, metrics, nextVersion, setEntityOn, setEntityGrade, setEntityMethod, deleteDict, deleteExclude, setMeta } from '../domain/store'
import { GRADE, METHODS } from '../domain/seed'
import type { Method } from '../domain/types'
import { openDialog } from '../ui/Dialogs'
import { convert, pct } from '../lib/util'

function RevCell({ b }: { b?: { n: number; rev: number } }) {
  if (!b || b.n < 3) return <span className="muted">—</span>
  const r = pct(b.rev, b.n), hi = r >= 30
  return <span className={'rbar' + (hi ? ' hi' : '')}><i><span style={{ width: `${Math.min(100, r * 2)}%` }} /></i>
    <b style={{ fontVariantNumeric: 'tabular-nums' }}>{r}%</b><span className="sub">{b.rev}/{b.n}건</span>{hi && <span className="pill req">30% 넘음</span>}</span>
}
const Draft = ({ on }: { on?: boolean }) => (on ? <span className="pill draft">배포 대기</span> : null)

export default function Policy() {
  useStore()
  const P = S.policy, nv = nextVersion(), body = useRef<HTMLDivElement>(null)
  const pm7 = metrics(new Date(+S.now - 7 * 864e5))
  const dr = (k: RegExp) => P.changes.some(c => k.test(c.what))
  const steps: [string, string, string, RegExp][] = [
    ['p1', '기본 템플릿', `${P.entities.filter(e => e.on).length}개 항목`, /탐지 (켬|끔)|등급:|변환 방식:/],
    ['p2', '자동 변환', `${P.learned.length}개 규칙`, /자동 변환/],
    ['p3', '회사 고유 단어', `${P.dict.length}개`, /고유 단어/],
    ['p4', '탐지 제외', `${P.exclude.length}개`, /탐지 제외/],
    ['p6', '파일 사본', `숨은 정보 ${Object.values(P.meta).filter(Boolean).length}종`, /파일 사본/],
  ]
  const jump = (id: string) => { const el = document.getElementById(id), bd = body.current; if (el && bd) bd.scrollTo({ top: el.offsetTop - bd.offsetTop, behavior: 'smooth' }) }
  return (
    <section className="card">
      <div className="card-h">
        <div><h1 className="t32">변환 정책</h1>
          <p className="d">{P.changes.length ? `현재 적용 ${P.version} · 편집 중 변경 ${P.changes.length}개 — 서명 후 배포해야 직원 PC에 ${nv}로 적용돼요` : `현재 적용 ${P.version} · ${P.deployed} 배포 · 바꾸면 초안으로 쌓여요`}</p></div>
        {P.changes.length > 0 && <div className="row"><button className="btn ghost" onClick={() => openDialog({ kind: 'changes' })}>변경 내용 보기</button><button className="btn p" id="pub" onClick={() => openDialog({ kind: 'publish' })}>서명 후 배포하기</button></div>}
      </div>
      <div className="polhead"><div className="pipe">
        {steps.map(([id, t, v, k], i) => <span key={id} style={{ display: 'contents' }}>
          {i > 0 && <span className="pe" />}
          <button className={'pn' + (dr(k) ? ' draft' : '')} onClick={() => jump(id)}><span className="lab">{dr(k) ? '바뀜 · ' : ''}{t}</span><span className="v">{v}</span></button>
        </span>)}
        <span className={'pe' + (P.changes.length ? ' lit' : '')} />
        <div className={'pn ship' + (P.changes.length ? ' now' : '')}><span className="lab">서명 · 배포</span><span className="v">{P.changes.length ? `대기 ${P.changes.length}건 → ${nv}` : `${P.version} 적용 중`}</span></div>
      </div></div>
      <div className="card-b" id="polBody" ref={body}><div className="psecs">
        <section className="psec" id="p1"><div className="psec-h"><h2 className="h20">탐지 항목과 변환 방식</h2></div>
          <div className="scroll"><table className="nw"><thead><tr><th>사용</th><th>항목</th><th>등급</th><th>변환 방식</th><th>결과 예시</th><th>원문 되돌림률 · 7일</th></tr></thead><tbody>
            {P.entities.map((e, i) => <tr key={e.name}>
              <td><label className="switch"><input type="checkbox" checked={e.on} aria-label={`${e.name} 탐지`} onChange={x => setEntityOn(i, x.target.checked)} /><span /></label></td>
              <td><b>{e.name}</b></td>
              <td><select className="sel" value={e.grade} aria-label={`${e.name} 등급`} onChange={x => setEntityGrade(i, x.target.value as 'O' | 'S' | 'C')}>{(['O', 'S', 'C'] as const).map(g => <option key={g} value={g}>{GRADE[g]}</option>)}</select></td>
              <td>{e.grade === 'S' ? <select className="sel" value={e.method} aria-label={`${e.name} 변환 방식`} onChange={x => setEntityMethod(i, x.target.value as Method)}>{METHODS.map(m => <option key={m}>{m}</option>)}</select> : <span className="muted">—</span>}</td>
              <td>{e.grade === 'C' ? <span className="cell-sub">외부 차단</span> : e.grade === 'O' ? <span className="cell-sub">그대로 전송</span> : <><span className="cell-sub">{e.sample} → </span><b>{convert(e.name, e.sample, e.method) || '(삭제)'}</b></>}</td>
              <td><RevCell b={pm7.byType[e.name]} /></td>
            </tr>)}
          </tbody></table></div></section>

        <section className="psec" id="p2"><div className="psec-h"><h2 className="h20">위반에서 등록한 자동 변환</h2></div>
          <div className="scroll"><table className="nw"><thead><tr><th>이런 경우에</th><th>이렇게</th><th>출처</th><th className="num">적용</th></tr></thead><tbody>
            {[...P.learned].reverse().map((r, i) => <tr key={i}><td><b>{r.type}</b> · {r.when}<Draft on={!r.live} /></td><td>{r.method}</td><td><a href={`#review/${r.from}`}>{r.from}</a></td>
              <td className="num">{r.hits ? r.hits.toLocaleString() + '회' : <span className="muted">—</span>}</td></tr>)}
          </tbody></table></div></section>

        <section className="psec" id="p3"><div className="psec-h"><h2 className="h20">회사 고유 단어</h2><button className="btn sm" onClick={() => openDialog({ kind: 'addDict' })}>단어 추가하기</button></div>
          <table><thead><tr><th>단어</th><th>함께 잡을 표현</th><th>탐지 항목</th><th /></tr></thead><tbody>
            {P.dict.map((d, i) => <tr key={d.term + i}><td><b>{d.term}</b><Draft on={d.draft} /></td><td className="cell-sub">{d.alias || '—'}</td><td>{d.type}</td><td className="num"><button className="btn sm ghost" onClick={() => deleteDict(i)}>삭제하기</button></td></tr>)}
          </tbody></table></section>

        <section className="psec" id="p4"><div className="psec-h"><h2 className="h20">탐지 제외</h2></div>
          <table><thead><tr><th>값</th><th>사유</th><th>근거</th><th /></tr></thead><tbody>
            {P.exclude.map((d, i) => <tr key={d.term + i}><td><b>{d.term}</b><Draft on={d.draft} /></td><td>{d.why}</td>
              <td className="cell-sub">{/^INC-/.test(d.from) ? <a href={`#review/${d.from}`}>{d.from}</a> : d.from}</td>
              <td className="num"><button className="btn sm ghost" onClick={() => deleteExclude(i)}>삭제하기</button></td></tr>)}
          </tbody></table></section>

        <section className="psec" id="p6"><div className="psec-h"><h2 className="h20">파일 사본에서 지울 숨은 정보</h2></div>
          <div className="metas">{Object.entries(P.meta).map(([k, v]) => <label key={k}><span>{k}</span><span className="switch"><input type="checkbox" checked={v} aria-label={`${k} 제거`} onChange={x => setMeta(k, x.target.checked)} /><span /></span></label>)}</div>
        </section>
      </div></div>
    </section>
  )
}
