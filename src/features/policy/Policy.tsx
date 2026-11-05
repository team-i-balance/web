// 변환 정책: 지금 적용 중인 정책을 고치면 초안으로 쌓이고, 아래 막대에서 서명 후 배포한다.
import { Plus, Trash2 } from 'lucide-react'
import { S, useStore, metrics, deleteRule, setEntityOn, setEntityGrade, setEntityMethod, deleteDict, deleteExclude, setMeta } from '../../domain/store'
import { GRADE, METHODS } from '../../domain/seed'
import type { Method } from '../../domain/types'
import { Button, Select, Switch, Tag } from '../../ds'
import { openDialog } from '../dialogs'
import { pcStatus } from '../../api/policy'
import { convert, partial, pct } from '../../lib/util'
import p from './policy.module.css'

function Rate({ b }: { b?: { n: number; rev: number } }) {
  if (!b || b.n < 3) return <span className={p.faint}>—</span>
  const r = pct(b.rev, b.n), hi = r >= 30
  return <span className={p.rate + (hi ? ' ' + p.hi : '')} title={`최근 7일 변환 제안 ${b.n}건 중 ${b.rev}건을 원문으로 보냄`}><i><span style={{ width: `${Math.min(100, r * 2)}%` }} /></i><b>{r}%</b><small>{b.rev}/{b.n}</small>{hi && <Tag tone="warn">원문 {b.rev}건</Tag>}</span>
}
const Draft = ({ on }: { on?: boolean }) => (on ? <Tag tone="now">배포 대기</Tag> : null)

export default function Policy() {
  useStore()
  const P = S.policy
  const pm7 = metrics(new Date(+S.now - 7 * 864e5))
  const dr = (k: RegExp) => P.changes.some(c => k.test(c.what))
  const secs: [string, string, string, RegExp][] = [
    ['p-types', '탐지 항목', `${P.entities.filter(e => e.on).length}개 켬`, /탐지 (켬|끔)|등급:|변환 방식:/],
    ['p-rules', '자동 변환 규칙', `${P.learned.length}개`, /자동 변환/],
    ['p-dict', '회사 고유 단어', `${P.dict.length}개`, /고유 단어/],
    ['p-ex', '탐지 제외', `${P.exclude.length}개`, /탐지 제외/],
    ['p-file', '파일 사본', `숨은 정보 ${Object.values(P.meta).filter(Boolean).length}종`, /파일 사본/],
  ]
  const pc = pcStatus()
  return (
    <div className={p.wrap}>
      <nav className={p.nav} aria-label="정책 구역">
        <div className={p.navT}><b>변환 정책</b><span>{P.version === 'v0' ? '아직 배포한 정책 없음' : `${P.version} 적용 중${P.deployed ? ` · ${P.deployed}` : ''}`}</span>{P.changes.length > 0 && <span className={p.draftNote}>초안 {P.changes.length}개 · 배포 전이라 PC에 적용 안 됨</span>}{pc && <span>{pc}</span>}</div>
        {secs.map(([id, t, v, k]) => <a key={id} className={p.navA} href={`#policy`} onClick={e => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{dr(k) && <i className={p.changed} aria-label="바뀜" />}{t}</span><small>{v}</small></a>)}
      </nav>
      <div className={p.main}>
        <section className={p.sec} id="p-types">
          <div className={p.sh}><h2>탐지 항목과 변환 방식</h2></div>
          <div className={p.tbox}><table className={p.t}><thead><tr><th>사용</th><th>항목</th><th>등급</th><th>변환 방식</th><th>결과 예시</th><th>원문으로 보낸 비율 · 7일</th></tr></thead><tbody>
            {P.entities.map((e, i) => <tr key={e.name} data-off={!e.on || undefined}>
              <td><Switch checked={e.on} label={`${e.name} 탐지`} onChange={v => setEntityOn(i, v)} /></td>
              <td className={p.name}>{e.name}</td>
              <td><Select small value={e.grade} aria-label={`${e.name} 등급`} onChange={x => setEntityGrade(i, x.target.value as 'O' | 'S' | 'C')}>{(['O', 'S', 'C'] as const).map(g => <option key={g} value={g}>{GRADE[g]}</option>)}</Select></td>
              <td>{e.grade === 'S' ? <Select small value={e.method} aria-label={`${e.name} 변환 방식`} onChange={x => setEntityMethod(i, x.target.value as Method)}>{METHODS.map(m => <option key={m}>{m}</option>)}</Select> : <span className={p.faint}>—</span>}</td>
              <td className={p.ex}>{e.grade === 'C' ? '외부로 안 보냄' : e.grade === 'O' ? '그대로 보냄' : <>{e.sample} → <b>{convert(e.name, e.sample, e.method) || '(삭제)'}</b></>}</td>
              <td><Rate b={pm7.byType[e.name]} /></td>
            </tr>)}
          </tbody></table></div>
          <p className={p.legend}><b>대체</b> 가짜 값으로 바꿔요 · <b>일반화</b> 범위로 줄여요(주소 → 구까지) · <b>삭제</b> 빼고 보내요 · <b>태그</b> [이름A]처럼 표시해요 · 같은 값은 한 대화 안에서 같은 값으로 바뀌어요</p>
        </section>

        <section className={p.sec} id="p-rules">
          <div className={p.sh}><div><h2>자동 변환 규칙</h2><p>위반 검토에서 예외 인정하면 생겨요</p></div></div>
          <div className={p.tbox}>{P.learned.length ? <table className={p.t}><thead><tr><th>항목</th><th>이런 경우에</th><th>이렇게</th><th>출처</th><th style={{ textAlign: 'right' }}>적용</th><th /></tr></thead><tbody>
            {[...P.learned].reverse().map((r, i) => <tr key={i}>
              <td className={p.name}>{r.type} {r.type.length > 15 && <Tag tone="warn">15자 넘음</Tag>}</td>
              <td>{r.when} {r.when.length > 40 && <Tag tone="warn">40자 넘음</Tag>} <Draft on={!r.live} /></td>
              <td>{r.method}</td>
              <td>{/^INC-/.test(r.from) ? <a href={`#review/${r.from}`}>{r.from}</a> : r.from}</td>
              <td style={{ textAlign: 'right' }}>{r.hits ? r.hits.toLocaleString() + '회' : <span className={p.faint}>—</span>}</td>
              <td style={{ textAlign: 'right' }}><Button size="sm" variant="ghost" iconOnly icon={<Trash2 size={15} />} aria-label={`${r.type} 규칙 삭제`} onClick={() => deleteRule(P.learned.length - 1 - i)} /></td></tr>)}
          </tbody></table> : <p className={p.faint} style={{ padding: '0 12px 14px' }}>아직 규칙이 없어요</p>}</div>
        </section>

        <section className={p.sec} id="p-dict">
          <div className={p.sh}><div><h2>회사 고유 단어</h2><p>프로젝트 코드명처럼 회사 안에서만 쓰는 말</p></div><Button size="sm" icon={<Plus size={15} />} onClick={() => openDialog({ kind: 'addDict' })}>단어 추가</Button></div>
          <div className={p.tbox}><table className={p.t}><thead><tr><th>단어</th><th>함께 잡을 표현</th><th>탐지 항목</th><th /></tr></thead><tbody>
            {P.dict.map((d, i) => <tr key={d.term + i}><td className={p.name}>{partial('', d.term)} <Draft on={d.draft} /></td><td className={p.ex}>{d.alias || '—'}</td><td>{d.type}</td>
              <td style={{ textAlign: 'right' }}><Button size="sm" variant="ghost" iconOnly icon={<Trash2 size={15} />} aria-label={`${partial('', d.term)} 삭제`} onClick={() => deleteDict(i)} /></td></tr>)}
          </tbody></table></div>
        </section>

        <section className={p.sec} id="p-ex">
          <div className={p.sh}><div><h2>탐지 제외</h2><p>오탐 신고에서 공개된 값으로 확인한 것</p></div></div>
          <div className={p.tbox}><table className={p.t}><thead><tr><th>값</th><th>사유</th><th>근거</th><th /></tr></thead><tbody>
            {P.exclude.map((d, i) => <tr key={d.term + i}><td className={p.name}>{partial('', d.term)} <Draft on={d.draft} /></td><td>{d.why || '—'}</td>
              <td className={p.ex}>{/^INC-/.test(d.from) ? <a href={`#review/${d.from}`}>{d.from}</a> : d.from}</td>
              <td style={{ textAlign: 'right' }}><Button size="sm" variant="ghost" iconOnly icon={<Trash2 size={15} />} aria-label={`${partial('', d.term)} 제외 취소`} onClick={() => deleteExclude(i)} /></td></tr>)}
          </tbody></table></div>
        </section>

        <section className={p.sec} id="p-file">
          <div className={p.sh}><div><h2>파일 사본에서 지울 숨은 정보</h2><p>파일을 올릴 때 사본에서 빼요</p></div></div>
          <div className={p.metas}>{Object.entries(P.meta).map(([k, v]) => <label key={k} className={p.meta}><span>{k}</span><Switch checked={v} label={`${k} 지우기`} onChange={x => setMeta(k, x)} /></label>)}</div>
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
