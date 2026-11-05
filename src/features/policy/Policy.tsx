// 변환 정책: 지금 적용 중인 정책을 고치면 초안으로 쌓이고, 아래 막대에서 서명 후 배포한다.
import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { S, useStore, metrics, deleteRule, setEntityOn, setEntityGrade, setEntityMethod, deleteDict, deleteExclude, setMeta } from '../../domain/store'
import { GRADE, METHODS } from '../../domain/seed'
import type { Method } from '../../domain/types'
import { Button, Empty, Select, Switch, Tag, ds } from '../../ds'
import { openDialog } from '../dialogs'
import { acksNow, reasonKo } from '../../api/policy'
import { convert, partial, pct } from '../../lib/util'
import p from './policy.module.css'

const T = `${ds.table} ${p.t}`

// 원문 비율: 숫자만(막대·태그 없음). 30% 이상이면 빨강
function Rate({ b }: { b?: { n: number; rev: number } }) {
  if (!b || b.n < 3) return <span className={p.faint}>—</span>
  const r = pct(b.rev, b.n), hi = r >= 30
  return <span className={p.rate + (hi ? ' ' + p.hi : '')} title={`최근 7일 변환 제안 ${b.n}건 중 ${b.rev}건을 원문으로 보냄`}><b>{r}%</b><small>{b.rev}/{b.n}</small></span>
}
const Draft = ({ on }: { on?: boolean }) => (on ? <span className={p.draft}><Tag tone="now">배포 대기</Tag></span> : null)
const LEGEND = '대체: 가짜 값으로 바꿔요 · 일반화: 범위로 줄여요(주소 → 구까지) · 삭제: 빼고 보내요 · 태그: [이름A]처럼 표시해요 · 같은 값은 한 대화 안에서 같은 값으로 바뀌어요'

// 지금 화면에 보이는 구역(목록에서 면으로 표시)
function useActive(ids: string[]) {
  const [on, setOn] = useState(ids[0])
  const key = ids.join(',')
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const ids = key.split(','), seen = new Set<string>()
    const io = new IntersectionObserver(es => {
      for (const e of es) e.isIntersecting ? seen.add(e.target.id) : seen.delete(e.target.id)
      const first = ids.find(id => seen.has(id))
      if (first) setOn(first)
    }, { rootMargin: '0px 0px -55% 0px' })
    ids.forEach(id => { const el = document.getElementById(id); if (el) io.observe(el) })
    return () => io.disconnect()
  }, [key])
  return on
}

export default function Policy() {
  useStore()
  const P = S.policy
  const pm7 = metrics(new Date(+S.now - 7 * 864e5))
  const dr = (k: RegExp) => P.changes.some(c => k.test(c.what))
  const metaOn = Object.values(P.meta).filter(Boolean).length
  const secs: [string, string, string, RegExp][] = [
    ['p-types', '탐지 항목', `${P.entities.filter(e => e.on).length}/${P.entities.length}`, /탐지 (켬|끔)|등급:|변환 방식:/],
    ['p-rules', '자동 변환 규칙', `${P.learned.length}`, /자동 변환/],
    ['p-dict', '회사 고유 단어', `${P.dict.length}`, /고유 단어/],
    ['p-ex', '탐지 제외', `${P.exclude.length}`, /탐지 제외/],
    ['p-file', '파일 사본', `${metaOn}/${Object.keys(P.meta).length}`, /파일 사본/],
  ]
  const active = useActive(secs.map(x => x[0]))
  const a = acksNow()
  const rjTitle = a && a.rejected ? Object.entries(a.reject_reasons).map(([k, n]) => `${reasonKo(k)} ${n}대`).join(', ') : undefined
  const del = (label: string, on: () => void) => <Button size="sm" variant="ghost" iconOnly icon={<Trash2 size={16} />} aria-label={label} onClick={on} />
  return (
    <div className={p.wrap}>
      <nav className={p.nav} aria-label="정책 구역">
        <div className={p.navT}>
          <b>변환 정책</b>
          {P.version === 'v0'
            ? <span className={p.navV}>아직 배포한 정책 없음</span>
            : <span className={p.navV} title={P.deployed ? `${P.deployed} 배포` : undefined}>{P.version} 적용 중</span>}
          {a && <span className={p.navPc}>{a.devices ? `PC ${a.applied}/${a.devices}대` : '아직 받은 PC 없음'}{a.rejected > 0 && <> · <em title={rjTitle}>거부 {a.rejected}대</em></>}</span>}
        </div>
        {secs.map(([id, t, v, k]) => <a key={id} className={p.navA} href={`#policy`} aria-current={active === id ? 'location' : undefined} onClick={e => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}>
          <span className={p.navL}><i className={p.changed} data-on={dr(k) || undefined} aria-label={dr(k) ? '바뀜' : undefined} />{t}</span><small>{v}</small></a>)}
      </nav>
      <div className={p.main}>
        <section className={p.sec} id="p-types">
          <div className={p.sh}><h2>탐지 항목과 변환 방식</h2></div>
          <div className={p.tbox}><table className={T}><thead><tr><th>사용</th><th>항목</th><th>등급</th><th title={LEGEND}>변환 방식</th><th>결과 예시</th><th className="num">원문 전송 · 7일</th></tr></thead><tbody>
            {P.entities.map((e, i) => <tr key={e.name} data-off={!e.on || undefined}>
              <td><Switch checked={e.on} label={`${e.name} 탐지`} onChange={v => setEntityOn(i, v)} /></td>
              <td className={p.name}>{e.name}</td>
              <td><Select quiet value={e.grade} aria-label={`${e.name} 등급`} onChange={x => setEntityGrade(i, x.target.value as 'O' | 'S' | 'C')}>{(['O', 'S', 'C'] as const).map(g => <option key={g} value={g}>{GRADE[g]}</option>)}</Select></td>
              <td>{e.grade === 'S'
                ? <Select quiet value={e.method} aria-label={`${e.name} 변환 방식`} onChange={x => setEntityMethod(i, x.target.value as Method)}>{METHODS.map(m => <option key={m}>{m}</option>)}</Select>
                : <span className={p.sub}>{e.grade === 'C' ? '외부로 안 보냄' : '그대로 보냄'}</span>}</td>
              <td>{e.grade === 'S' && <span className={p.ex}><span className={p.exFrom}>{e.sample}</span><span className={p.arrow}>→</span><b>{convert(e.name, e.sample, e.method) || '(삭제)'}</b></span>}</td>
              <td className="num"><Rate b={pm7.byType[e.name]} /></td>
            </tr>)}
          </tbody></table></div>
        </section>

        <section className={p.sec} id="p-rules">
          <div className={p.sh}><h2>자동 변환 규칙</h2></div>
          {P.learned.length ? <div className={p.tbox}><table className={T}><thead><tr><th>항목</th><th>이런 경우에</th><th>이렇게</th><th>출처</th><th className="num">적용 횟수</th><th /></tr></thead><tbody>
            {[...P.learned].reverse().map((r, i) => <tr key={i}>
              <td className={p.name}>{r.type} {r.type.length > 15 && <Tag tone="warn">15자 넘음</Tag>}</td>
              <td>{r.when} {r.when.length > 40 && <Tag tone="warn">40자 넘음</Tag>}<Draft on={!r.live} /></td>
              <td>{r.method}</td>
              <td>{/^INC-/.test(r.from) ? <a href={`#review/${r.from}`}>{r.from}</a> : r.from}</td>
              <td className="num">{r.hits ? r.hits.toLocaleString() : <span className={p.faint}>—</span>}</td>
              <td className={p.act}>{del(`${r.type} 규칙 삭제`, () => deleteRule(P.learned.length - 1 - i))}</td></tr>)}
          </tbody></table></div> : <Empty title="아직 규칙이 없어요" text="위반 검토에서 예외 인정하면 생겨요" />}
        </section>

        <section className={p.sec} id="p-dict">
          <div className={p.sh}><div><h2>회사 고유 단어</h2><p>프로젝트 코드명처럼 회사 안에서만 쓰는 말</p></div><Button size="sm" icon={<Plus size={16} />} onClick={() => openDialog({ kind: 'addDict' })}>단어 추가</Button></div>
          {P.dict.length ? <div className={p.tbox}><table className={T}><thead><tr><th>단어</th><th>함께 잡을 표현</th><th>탐지 항목</th><th /></tr></thead><tbody>
            {P.dict.map((d, i) => <tr key={d.term + i}><td className={p.name}>{partial('', d.term)}<Draft on={d.draft} /></td><td className={p.sub}>{d.alias || '—'}</td><td className={p.type}>{d.type}</td>
              <td className={p.act}>{del(`${partial('', d.term)} 삭제`, () => deleteDict(i))}</td></tr>)}
          </tbody></table></div> : <Empty title="아직 단어가 없어요" />}
        </section>

        <section className={p.sec} id="p-ex">
          <div className={p.sh}><h2>탐지 제외</h2></div>
          {P.exclude.length ? <div className={p.tbox}><table className={T}><thead><tr><th>값</th><th>사유</th><th>근거</th><th /></tr></thead><tbody>
            {P.exclude.map((d, i) => <tr key={d.term + i}><td className={p.name}>{partial('', d.term)}<Draft on={d.draft} /></td><td>{d.why || '—'}</td>
              <td className={p.sub}>{/^INC-/.test(d.from) ? <a href={`#review/${d.from}`}>{d.from}</a> : d.from}</td>
              <td className={p.act}>{del(`${partial('', d.term)} 제외 취소`, () => deleteExclude(i))}</td></tr>)}
          </tbody></table></div> : <Empty title="아직 제외한 값이 없어요" text="오탐 신고에서 공개된 값으로 확인하면 생겨요" />}
        </section>

        <section className={p.sec} id="p-file">
          <div className={p.sh}><h2>파일 사본에서 지울 숨은 정보</h2></div>
          {Object.keys(P.meta).length
            ? <div className={p.metas}>{Object.entries(P.meta).map(([k, v]) => <label key={k} className={p.meta}><span>{k}</span><Switch checked={v} label={`${k} 지우기`} onChange={x => setMeta(k, x)} /></label>)}</div>
            : <Empty title="지울 정보가 없어요" text="파일을 올릴 때 사본에서 빼요" />}
        </section>
      </div>
      {P.changes.length > 0 && <div className={p.bar} role="region" aria-label="배포 대기 변경">
        <b>변경 {P.changes.length}개</b><span>{P.changes[P.changes.length - 1].what}</span>
        <Button variant="ghost" onClick={() => openDialog({ kind: 'changes' })}>변경 보기</Button>
        <Button variant="now" onClick={() => openDialog({ kind: 'publish' })}>서명 후 배포하기</Button>
      </div>}
    </div>
  )
}
