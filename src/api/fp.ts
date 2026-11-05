// 오탐 신고 판단 (/false-positives, 백엔드 docs/false-positive-api.md)
// 판단은 값 해시(value_hash) 단위로 서버에 쌓인다(덮어쓰지 않음). 그래서 '탐지 결과 유지'는 되돌리기 10초가 지난 뒤에 보낸다.
// '탐지 제외'는 정책 초안에도 들어가므로 바로 보낸다.
import type { FpGroup } from '../domain/types'
import { S, hooks, toast } from '../domain/store'
import { get, post } from './client'
import { publishedExcludes } from './policy'

interface Group { value_hash: string; status: 'open' | 'done'; decision: { decision: 'keep' | 'exclude'; why?: string | null } | null; last_event_id: number }

// 서버 이벤트 항목의 orig 는 '⟦=가린값#값해시⟧'
export const hashOf = (orig: string) => { const m = /^⟦=.*#([0-9a-fA-F]{64})⟧$/.exec(orig); return m ? m[1].toLowerCase() : null }
const groupHash = (g: FpGroup) => hashOf(g.value)

// 판단을 마친 값(done)을 읽어 같은 값의 신고를 '처리함'으로 둔다. 판단 뒤 새 신고가 오면 서버가 open 으로 돌려준다
export async function loadFpDecisions() {
  const done = new Map<string, 'keep' | 'exclude'>()
  let cursor: number | null = null
  for (let i = 0; i < 10; i++) {
    const page: Group[] = await get<Group[]>(`/false-positives?status=done&limit=1000${cursor ? '&cursor=' + cursor : ''}`, 5000)
    page.forEach(g => { if (g.decision) done.set(g.value_hash.toLowerCase(), g.decision.decision) })
    if (page.length < 1000) break
    cursor = page[page.length - 1].last_event_id
  }
  S.events.forEach(e => e.items.forEach(it => {
    const h = it.fp ? hashOf(it.orig) : null
    if (h && done.has(h)) it.fp = done.get(h)!
  }))
  // 정책으로 이미 탐지 제외해 배포한 값인데 서버 신고가 아직 열려 있으면 '제외' 판단을 남겨 맞춘다
  const ex = publishedExcludes(), open = await get<Group[]>('/false-positives?status=open&limit=1000', 5000).catch(() => [] as Group[])
  for (const g of open) { const h = g.value_hash.toLowerCase(); if (ex.has(h)) await send(h, 'exclude', '배포된 정책의 탐지 제외') }
}

const pending = new Map<string, number>()
async function send(hash: string, decision: 'keep' | 'exclude', why?: string) {
  try { await post(`/false-positives/${hash}/decide`, why ? { decision, why: why.slice(0, 1000) } : { decision }) }
  catch (e) { toast(`오탐 판단을 서버에 저장하지 못했어요 (${(e as Error).message})`) }
}
function onDecide(g: FpGroup, decision: 'keep' | 'exclude', why?: string) {
  const h = groupHash(g)
  if (!S.api.live || !h) return
  clearTimeout(pending.get(h))
  if (decision === 'exclude') { pending.delete(h); send(h, decision, why); return }
  pending.set(h, window.setTimeout(() => { pending.delete(h); send(h, decision, why) }, 10_500))
}
function onUndo(g: FpGroup) {
  const h = groupHash(g)
  if (h && pending.has(h)) { clearTimeout(pending.get(h)); pending.delete(h) }
}
// 창을 닫기 전에 남은 '유지' 판단을 보낸다
addEventListener('pagehide', () => { pending.forEach((t, h) => { clearTimeout(t); navigator.sendBeacon?.(`${S.api.base}/false-positives/${h}/decide`, new Blob([JSON.stringify({ decision: 'keep' })], { type: 'application/json' })) }) })
hooks.fpDecide = onDecide
hooks.fpUndo = onUndo
