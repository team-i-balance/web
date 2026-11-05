import type { Case } from '../domain/types'
import { partial } from '../lib/util'

// 직원이 보낸 문장: 바뀐 값은 회색, 그대로 나간 원문은 일부만 가려 빨갛게
export function SentText({ c }: { c: Pick<Case, 'items'> & { ev: { tpl: string } } }) {
  const parts = c.ev.tpl.split(/(\{\d\})/)
  return (
    <>
      {parts.map((p, n) => {
        const m = p.match(/^\{(\d)\}$/)
        if (!m) return <span key={n}>{p}</span>
        const it = c.items[+m[1]]
        if (!it) return null
        if (it.status === 'conv') return it.conv === '' ? <mark key={n} className="mD">{it.type}</mark> : <mark key={n} className="mS" title={`${it.type} · ${it.method}`}>{it.conv}</mark>
        return <mark key={n} className="mR" title={`${it.type} 원문 (일부 가림)`}>{partial(it.type, it.orig)}</mark>
      })}
    </>
  )
}

export type Step = [label: string, state: 'done' | 'now' | 'next', sub?: string]
export function StepBar({ steps }: { steps: Step[] }) {
  return (
    <ol className="stp" aria-label="이 건의 단계">
      {steps.map(([t, s, sub]) => (
        <li key={t} className={s} aria-current={s === 'now' ? 'step' : undefined}>
          <span className="d">{s === 'done' ? '✓' : ''}</span><span className="t">{t}</span>{sub && <em>{sub}</em>}
        </li>
      ))}
    </ol>
  )
}

export const typesOf = (c: Pick<Case, 'items'>) => [...new Set(c.items.filter(i => i.status !== 'conv').map(i => i.type))]
