// 디자인 시스템 기본 부품. 색·간격은 styles/tokens.css 의 토큰만 쓴다.
import { forwardRef, useId, type ButtonHTMLAttributes, type ReactNode, type AnchorHTMLAttributes, type SelectHTMLAttributes, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import * as RSwitch from '@radix-ui/react-switch'
import * as RCheck from '@radix-ui/react-checkbox'
import * as RTip from '@radix-ui/react-tooltip'
import { Check, Minus } from 'lucide-react'
import clsx from 'clsx'
import type { Case } from '../domain/types'
import { partial } from '../lib/util'
import { isNext } from '../shell/theme'
import s from './ds.module.css'

export { s as ds }

// ── 버튼
type Variant = 'default' | 'primary' | 'now' | 'ghost'
interface BtnProps { variant?: Variant; size?: 'sm' | 'md' | 'lg'; icon?: ReactNode; kbd?: string; iconOnly?: boolean; danger?: boolean }
const btnCls = ({ variant = 'default', size = 'md', iconOnly, danger }: BtnProps, extra?: string) =>
  clsx(s.btn, size !== 'md' && s[size], variant !== 'default' && s[variant], iconOnly && s.iconOnly, danger && s.danger, extra)

export const Button = forwardRef<HTMLButtonElement, BtnProps & ButtonHTMLAttributes<HTMLButtonElement>>(function Button(
  { variant, size, icon, kbd, iconOnly, danger, className, children, type = 'button', ...rest }, ref) {
  return (
    <button ref={ref} type={type} className={btnCls({ variant, size, iconOnly, danger }, className)} {...rest}>
      {icon}{children}{kbd && <Kbd>{kbd}</Kbd>}
    </button>
  )
})
export function LinkButton({ variant, size, icon, className, children, ...rest }: BtnProps & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a className={btnCls({ variant, size }, className)} {...rest}>{icon}{children}</a>
}
// 식별자(건 번호·버전·해시·시각): 새 디자인에서 IBM Plex Mono
export const Id = ({ children }: { children: ReactNode }) => <span className={s.id}>{children}</span>
export const Kbd = ({ children }: { children: ReactNode }) => <kbd className={s.kbd}>{children}</kbd>

// 판단 버튼: 제목, 결과 한 줄, 단축키. 새 디자인은 같은 중립 버튼 + 아래 설명 한 줄
export function DecideButton({ title, desc, k, danger, onClick }: { title: string; desc: string; k?: string; danger?: boolean; onClick: () => void }) {
  if (isNext()) return (
    <div className={s.decideN}>
      <button type="button" className={s.btn} onClick={onClick} aria-keyshortcuts={k} data-decide={k}>{k && <Kbd>{k}</Kbd>}{title}</button>
      <span>{desc}</span>
    </div>
  )
  return (
    <button type="button" className={clsx(s.decide, danger && s.decideDanger)} onClick={onClick} aria-keyshortcuts={k} data-decide={k}>
      <b>{title}</b>{k && <Kbd>{k}</Kbd>}<span>{desc}</span>
    </button>
  )
}

// ── 배지·태그
export function Badge({ n, tone, label }: { n: number | string; tone?: 'now' | 'danger'; label?: string }) {
  return <span className={clsx(s.badge, tone === 'now' && s.badgeNow, tone === 'danger' && s.badgeDanger)} aria-label={label}>{n}</span>
}
export function Tag({ children, tone, dot }: { children: ReactNode; tone?: 'danger' | 'ok' | 'warn' | 'now' | 'outline'; dot?: boolean }) {
  const t = { danger: s.tagDanger, ok: s.tagOk, warn: s.tagWarn, now: s.tagNow, outline: s.tagOutline }
  return <span className={clsx(s.tag, tone && t[tone])}>{dot && <i className={s.dot} />}{children}</span>
}

// ── 입력
export function Field({ label, count, max, hint, error, children, htmlFor }: { label: string; count?: number; max?: number; hint?: ReactNode; error?: string | false; children: ReactNode; htmlFor?: string }) {
  return (
    <div className={s.field}>
      <label className={s.label} htmlFor={htmlFor}>{label}{max != null && <span className={clsx(s.count, (count ?? 0) > max && s.countOver)}>{count ?? 0}/{max}</span>}</label>
      {children}
      {error ? <div className={s.error} role="alert">{error}</div> : hint ? <div className={s.hint}>{hint}</div> : null}
    </div>
  )
}
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} type="text" className={clsx(s.input, className)} {...p} />
})
export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea({ className, ...p }, ref) {
  return <textarea ref={ref} className={clsx(s.textarea, className)} {...p} />
})
export function Select({ small, className, ...p }: { small?: boolean } & SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={clsx(s.select, small && s.selectSm, className)} {...p} />
}
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <RSwitch.Root className={s.switch} checked={checked} onCheckedChange={onChange} aria-label={label}><RSwitch.Thumb className={s.thumb} /></RSwitch.Root>
}
export function Checkbox({ checked, onChange, label }: { checked: boolean | 'indeterminate'; onChange: (v: boolean) => void; label: string }) {
  return (
    <RCheck.Root className={s.check} checked={checked} onCheckedChange={v => onChange(v === true)} aria-label={label} onClick={e => e.stopPropagation()}>
      <RCheck.Indicator>{checked === 'indeterminate' ? <Minus size={12} strokeWidth={3} /> : <Check size={12} strokeWidth={3} />}</RCheck.Indicator>
    </RCheck.Root>
  )
}

// ── 세그먼트: 탭처럼 쓰는 선택
export function Segmented<K extends string>({ value, onChange, items, label }: { value: K; onChange: (k: K) => void; items: { k: K; t: string; n?: number; now?: boolean }[]; label: string }) {
  return (
    <div className={s.seg} role="tablist" aria-label={label}>
      {items.map(i => (
        <button key={i.k} type="button" role="tab" aria-selected={value === i.k} className={s.segItem} onClick={() => onChange(i.k)}>
          {i.t}{i.n != null && <Badge n={i.n} tone={i.now && i.n ? 'now' : undefined} />}
        </button>
      ))}
    </div>
  )
}

// ── 툴팁
export function Tip({ text, children }: { text: string; children: ReactNode }) {
  return (
    <RTip.Root delayDuration={300}>
      <RTip.Trigger asChild>{children}</RTip.Trigger>
      <RTip.Portal><RTip.Content className="tip" sideOffset={6}>{text}</RTip.Content></RTip.Portal>
    </RTip.Root>
  )
}
export const TipProvider = RTip.Provider

// ── 단계 바
export type Step = [label: string, state: 'done' | 'now' | 'next', sub?: string]
export function StepBar({ steps, label = '이 건의 단계' }: { steps: Step[]; label?: string }) {
  return (
    <ol className={s.steps} aria-label={label}>
      {steps.map(([t, st, sub], i) => (
        <li key={t} style={{ display: 'contents' }}>
          {i > 0 && <span aria-hidden="true" className={clsx(s.stepLine, st !== 'next' && s.stepLineDone)} />}
          <span className={clsx(s.step, st === 'done' && s.stepDone, st === 'now' && s.stepNow)} aria-current={st === 'now' ? 'step' : undefined}>
            <span className={s.stepDot}>{st === 'done' && <Check size={10} strokeWidth={3.5} />}</span>{t}{sub && <em>{sub}</em>}
          </span>
        </li>
      ))}
    </ol>
  )
}

// ── 빈 상태
export function Empty({ icon, title, text, children, center }: { icon?: ReactNode; title: string; text?: ReactNode; children?: ReactNode; center?: boolean }) {
  return (
    <div className={clsx(s.empty, center && s.emptyCenter)}>
      {icon && <div className={s.emptyIcon}>{icon}</div>}
      <div className={s.emptyTitle}>{title}</div>
      {text && <div className={s.emptyText}>{text}</div>}
      {children && <div className={s.emptyActs}>{children}</div>}
    </div>
  )
}
export const Skeleton = ({ w = '100%', h = 14 }: { w?: number | string; h?: number }) => <div className={s.skel} style={{ width: w, height: h }} />

// ── 진행 막대
export const Meter = ({ value, label }: { value: number; label: string }) => (
  <div className={s.meter} role="meter" aria-label={label} aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} /></div>
)

// ── 가린 값·보낸 문장
export const Masked = ({ type, value }: { type: string; value: string }) => <mark className={s.mask} title={`${type} 원문 (일부 가림)`}>{partial(type, value)}</mark>
export function Sentence({ c }: { c: Pick<Case, 'items'> & { ev: { tpl: string } } }) {
  const parts = c.ev.tpl.split(/(\{\d\})/)
  return (
    <p className={s.sentence}>
      {parts.map((p, n) => {
        const m = p.match(/^\{(\d)\}$/)
        if (!m) return <span key={n}>{p}</span>
        const it = c.items[+m[1]]
        if (!it) return null
        if (it.status === 'conv') return it.conv === '' ? <mark key={n} className={clsx(s.mask, s.maskDel)} title={`${it.type} 삭제됨`}>{it.type}</mark> : <mark key={n} className={clsx(s.mask, s.maskConv)} title={`${it.type} · ${it.method}`}>{it.conv}</mark>
        return <Masked key={n} type={it.type} value={it.orig} />
      })}
    </p>
  )
}

export function KV({ rows }: { rows: [ReactNode, ReactNode][] }) {
  const id = useId()
  return <dl className={s.kv}>{rows.map(([k, v], i) => <div key={id + i} style={{ display: 'contents' }}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
}

export const typesOf = (c: Pick<Case, 'items'>) => [...new Set(c.items.filter(i => i.status !== 'conv').map(i => i.type))]
