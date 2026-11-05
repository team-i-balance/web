export type Grade = 'O' | 'S' | 'C'
export type Method = '대체' | '일반화' | '삭제' | '태그' | '—'
export type ItemStatus = 'conv' | 'raw' | 'revert' | null
export type Reason = '오탐' | '업무상 필요' | null
export type FpState = 'open' | 'exclude' | 'keep' | null
export type Action = 'sent' | 'raw' | 'revert' | 'cancel' | 'block' | 'pass'
export type Conclusion = 'violation' | 'legit' | 'fp'
export type Cause = 'fit' | 'care' | 'intent'

export interface Item {
  type: string
  orig: string
  method: Method
  conv: string | null
  status: ItemStatus
  reason: Reason
  fp: FpState
}

export interface AiEvent {
  id: string
  time: Date
  user: string
  dept: string
  ai: string
  file: { name: string; meta: string[] } | null
  tpl: string
  items: Item[]
  grade: Grade
  action: Action
  conf: number
  ver: string
  server?: unknown
}

export interface CaseReason { text: string; at: Date; when: string; pick?: string }
export interface CaseClose { k: Conclusion; cause: Cause | null; memo: string; rule: string | null; by: string; at: Date }
export interface TimelineEntry { t: Date; who: string; cls: string; what: string; quote?: string | null }

export interface Case {
  id: string
  ev: AiEvent
  need: 'req' | 'opt'
  time: Date
  user: string
  dept: string
  items: Item[]
  file: AiEvent['file']
  status: 'open' | 'closed'
  reason: CaseReason | null
  close: CaseClose | null
  timeline: TimelineEntry[]
}

export interface Entity { name: string; grade: Grade; method: Method; sample: string; on: boolean }
export interface LearnedRule { type: string; when: string; method: Method; from: string; hits: number; live: boolean; at?: Date; fresh?: boolean }
export interface DictTerm { term: string; alias: string; type: string; draft?: boolean }
export interface ExcludeTerm { term: string; why: string; from: string; draft?: boolean }
export interface PolicyChange { what: string; src: string }

export interface Policy {
  version: string
  deployed: string
  entities: Entity[]
  learned: LearnedRule[]
  dict: DictTerm[]
  exclude: ExcludeTerm[]
  meta: Record<string, boolean>
  changes: PolicyChange[]
}

export interface FpGroup {
  type: string
  value: string
  refs: { e: AiEvent; it: Item }[]
  users: Set<string>
  fp: FpState
}
