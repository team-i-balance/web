// 디자인 시스템 기본 부품. 색·간격은 styles/tokens.css 의 토큰만 쓴다.
import { forwardRef, useId, type ButtonHTMLAttributes, type ReactNode, type AnchorHTMLAttributes, type SelectHTMLAttributes, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import * as RSwitch from '@radix-ui/react-switch'
import * as RCheck from '@radix-ui/react-checkbox'
import * as RTip from '@radix-ui/react-tooltip'
import { Check, ChevronRight, Minus, CircleCheck, CircleX, TriangleAlert, CircleAlert, Info } from 'lucide-react'
import clsx from 'clsx'
import type { Case } from '../domain/types'
import { partial } from '../lib/util'
import s from './ds.module.css'

export { s as ds }

// ── 버튼: now 채운 파랑(화면당 주 행동 하나) · primary 강한 테두리 · default · ghost 회색 글자 · quiet 표 행 안 반복 버튼(28px) · link 화면 이동 파란 글자
export type Variant = 'default' | 'primary' | 'now' | 'ghost' | 'quiet' | 'link'
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
export const Kbd = ({ children }: { children: ReactNode }) => <kbd className={s.kbd}>{children}</kbd>

// 판단 버튼: 제목, 결과 한 줄, 단축키
export function DecideButton({ title, desc, k, onClick }: { title: string; desc: string; k?: string; onClick: () => void }) {
  return (
    <button type="button" className={s.decide} onClick={onClick} aria-keyshortcuts={k} data-decide={k}>
      <b>{title}</b>{k && <Kbd>{k}</Kbd>}<span>{desc}</span>
    </button>
  )
}

// ── 배지·태그
export function Badge({ n, tone, label }: { n: number | string; tone?: 'now' | 'danger'; label?: string }) {
  return <span className={clsx(s.badge, tone === 'now' && s.badgeNow, tone === 'danger' && s.badgeDanger)} aria-label={label}>{n}</span>
}
// 상태 점: 목록 행의 판단 상태. danger 위반 · ok 종결 · none 예외 인정·오탐·미판단. 글자를 주면 옆에 13px 로
export function Dot({ tone = 'none', children, title }: { tone?: 'danger' | 'ok' | 'none'; children?: ReactNode; title?: string }) {
  const t = { danger: s.dotDanger, ok: s.dotOk, none: s.dotNone }
  return <span className={s.dotRow} title={title}><i className={clsx(s.dot, t[tone])} aria-hidden="true" />{children}</span>
}
export function Tag({ children, tone, dot }: { children: ReactNode; tone?: 'danger' | 'ok' | 'warn' | 'now' | 'outline'; dot?: boolean }) {
  const t = { danger: s.tagDanger, ok: s.tagOk, warn: s.tagWarn, now: s.tagNow, outline: s.tagOutline }
  return <span className={clsx(s.tag, tone && t[tone])}>{dot && <i className={s.dot} />}{children}</span>
}

// ── 알림 상자: 성공·경고·오류·안내. 아이콘 + 제목 한 줄 + 설명(두 줄 이내) + 행동
export type NoticeTone = 'success' | 'warning' | 'error' | 'info' | 'now'
const NOTICE_ICON = { success: CircleCheck, warning: TriangleAlert, error: CircleAlert, info: Info, now: Info }
export function Notice({ tone = 'info', title, children, actions }: { tone?: NoticeTone; title?: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  const I = NOTICE_ICON[tone]
  return (
    <div className={clsx(s.notice, tone === 'now' ? s.noticeNow : tone === 'error' ? s.noticeError : s[tone])} role={tone === 'error' ? 'alert' : undefined}>
      <I size={16} className={s.noticeI} aria-hidden="true" />
      <div className={s.noticeB}>{title && <b>{title}</b>}{children && <div>{children}</div>}</div>
      {actions && <div className={s.noticeA}>{actions}</div>}
    </div>
  )
}

// ── 입력
export function Field({ label, count, max, hint, error, ok, children, htmlFor }: { label: string; count?: number; max?: number; hint?: ReactNode; error?: string | false; ok?: string | false; children: ReactNode; htmlFor?: string }) {
  return (
    <div className={s.field}>
      <label className={s.label} htmlFor={htmlFor}>{label}{max != null && <span className={clsx(s.count, (count ?? 0) > max && s.countOver)}>{count ?? 0}/{max}</span>}</label>
      {children}
      {error ? <div className={s.error} role="alert"><CircleX size={12} aria-hidden="true" />{error}</div>
        : ok ? <div className={s.okMsg}><CircleCheck size={12} aria-hidden="true" />{ok}</div>
        : hint ? <div className={s.hint}><Info size={12} aria-hidden="true" />{hint}</div> : null}
    </div>
  )
}
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} type="text" className={clsx(s.input, className)} {...p} />
})
export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea({ className, ...p }, ref) {
  return <textarea ref={ref} className={clsx(s.textarea, className)} {...p} />
})
// quiet: 표 안에서 쓰는 조용한 선택(28px, 평소 테두리·바탕 없음)
export function Select({ small, quiet, className, ...p }: { small?: boolean; quiet?: boolean } & SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={clsx(s.select, small && !quiet && s.selectSm, quiet && s.selectQuiet, className)} {...p} />
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

// ── 세그먼트: 탭처럼 쓰는 선택. 알약 칩, 고른 것은 밝은 면. 파랑·체크 없음(now 도 중립 숫자)
export function Segmented<K extends string>({ value, onChange, items, label }: { value: K; onChange: (k: K) => void; items: { k: K; t: string; n?: number; now?: boolean }[]; label: string }) {
  return (
    <div className={s.seg} role="tablist" aria-label={label}>
      {items.map(i => (
        <button key={i.k} type="button" role="tab" aria-selected={value === i.k} className={s.segItem} onClick={() => onChange(i.k)}>
          {i.t}{i.n != null && <Badge n={i.n} />}
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
          {i > 0 && <ChevronRight size={16} aria-hidden="true" className={s.stepLine} />}
          <span className={clsx(s.step, st === 'done' && s.stepDone, st === 'now' && s.stepNow)} aria-current={st === 'now' ? 'step' : undefined}>
            <span className={s.stepDot}>{st === 'done' ? <Check size={12} strokeWidth={3} /> : i + 1}</span>{t}{sub && <em>{sub}</em>}
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
export const Meter = ({ value, label, size }: { value: number; label: string; size?: 'sm' | 'md' }) => {
  const v = Math.max(0, Math.min(1, value))
  return (
    <div className={clsx(s.meter, size === 'md' && s.meterMd)} role="meter" aria-label={label} aria-valuenow={Math.round(v * 100)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${v * 100}%` }} data-part={v < 1 || undefined} /></div>
  )
}

// ── 가린 값·보낸 문장
// 문장 속 잡힌 값: 받은(가린) 문자열만 그대로 보여 준다
export const Hit = ({ children, title }: { children: ReactNode; title?: string }) => <mark className={s.hit} title={title}>{children}</mark>
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
