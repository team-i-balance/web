// 작업판 모델: 화면이 보여 줄 데이터와 처리 동작. 화면 모양(JSX·CSS)은 Board.tsx 가 맡는다.
// API 연동은 이 파일과 api/·domain/ 만 고치고, 디자인은 Board.tsx·board.module.css 만 고친다.
import { S, emit, openOf, fpGroups, groupKey, boardWork, QUEUE_ORDER, quickClose, fpKeep, advanceBoard, closeCase, undoToast, hooks, type Queue } from '../../domain/store'
import type { Case, FpGroup } from '../../domain/types'
import { serverBehind, serverStatus } from '../../api/policy'
import type { Step } from '../../ds'

export function useBoardModel() {
  // ── 데이터
  const wk = new Date(+S.now - 7 * 864e5)
  const E = S.events.filter(e => e.time >= wk), n = (f: (e: (typeof E)[number]) => boolean) => E.filter(f).length
  const pub = n(e => e.grade === 'O'), conf = n(e => e.grade === 'C'), confOut = n(e => e.grade === 'C' && (e.action === 'raw' || e.action === 'revert')), sens = n(e => e.grade === 'S'), raw = n(e => e.action === 'raw')
  const req = openOf('req'), ready = req.filter(c => c.reason).sort((a, b2) => +b2.time - +a.time), wait = req.filter(c => !c.reason)
  const opt = openOf('opt').sort((a, b2) => +b2.time - +a.time), fps = fpGroups(true), P = S.policy
  const fresh = P.learned.filter(r => r.live && r.fresh).map(r => r.type)
  const caught = fresh.length ? E.filter(e => e.action === 'raw' && e.items.some(i => i.status === 'raw' && fresh.includes(i.type))).length : 0
  const work = boardWork()
  if (!S.ui.sel) S.ui.sel = QUEUE_ORDER.find(k => work[k]) || 'req'
  const SEL = S.ui.sel, lastPub = S.ui.lastPub, now = work[SEL] > 0
  const pc = serverStatus(), behind = serverBehind()
  const loading = S.api.state === 'connecting'
  const serverEmpty = S.api.live && !S.api.count

  // ── 대기열과 지금 한 건
  type QItem = Case | FpGroup | typeof P.changes
  // 필수 검토: 사유가 온 건 먼저, 그다음 사유를 기다리는 건
  const Q: QItem[] = ({ req: [...ready, ...wait], opt, fp: fps, pol: P.changes.length ? [P.changes] : [] } as Record<Queue, QItem[]>)[SEL] || []
  const keyOf = (x: QItem) => (SEL === 'fp' ? groupKey(x as FpGroup) : SEL === 'pol' ? 'pol' : (x as Case).id)
  const cur = Q.find(x => keyOf(x) === S.ui.cur[SEL]) || Q[0] || null
  if (cur) S.ui.cur[SEL] = keyOf(cur)
  const ci = cur ? Q.indexOf(cur) : -1
  const eff = SEL === 'pol' && !!lastPub && fresh.length > 0 && !P.changes.length

  const steps: Step[] | null = !cur && SEL !== 'pol' ? null : ({
    req: (cur as Case | null)?.reason ? [['원문 전송', 'done'], ['사유 도착', 'done'], ['판단', 'now'], ['규칙 배포', 'next'], ['서버 적용', 'next']]
      : [['원문 전송', 'done'], ['사유 요청', 'now'], ['판단', 'next'], ['규칙 배포', 'next'], ['서버 적용', 'next']],
    opt: [['되돌림', 'done'], ['사유 남김', 'done'], ['확인', 'now'], ['종결', 'next']],
    fp: [['오탐으로 되돌림', 'done'], ['판단', 'now'], ['배포', 'next'], ['서버 적용', 'next']],
    pol: eff ? [['판단', 'done'], ['규칙 생성', 'done'], ['서명 후 배포', 'done'], ['서버 적용', behind ? 'now' : 'done']]
      : P.changes.length ? [['판단', 'done'], ['규칙 생성', 'done'], ['서명 후 배포', 'now'], ['서버 적용', 'next']]
      : [['서명 후 배포', 'done'], ['서버 적용', behind ? 'now' : 'done']],
  } as Record<Queue, Step[]>)[SEL]

  // ── 처리
  const act = (fn: () => void) => { fn(); advanceBoard() }
  // 사라지는 중인 카드에서 눌러도 이미 처리한 건은 다시 처리하지 않는다
  const decideCase = (c: Case, k: 'violation' | 'legit' | 'fp' | 'ok') => { if (c.status === 'open') act(() => quickClose(c, k)) }
  const keepFp = (g: FpGroup) => { if (g.refs.some(r => r.it.fp === 'open')) act(() => fpKeep(g)) }
  const select = (q: Queue) => { S.ui.sel = q; emit() }
  const pickItem = (k: string) => { S.ui.cur[SEL] = k; emit() }
  const allOk = () => {
    const list = [...opt]
    list.forEach(c => closeCase(c, { k: 'legit', cause: null, memo: '사유 확인 — 업무 범위 내 사용', rule: null }, false))
    hooks.closeMany?.(list)
    undoToast(`선택 검토 ${list.length}건 문제 없음`, () => { list.forEach(c => { c.status = 'open'; c.close = null; c.timeline.pop(); hooks.reopen?.(c, true) }); S.ui.sel = 'opt' })
    advanceBoard()
  }


  const live = S.api.live, includeTest = S.api.includeTest, truncated = S.api.truncated
  const finishEffect = () => { S.ui.lastPub = null; advanceBoard() } // 배포 효과를 보고 다음 할 일로
  const publishDone = () => { S.ui.lastPub = S.policy.version; emit() } // 배포 대화상자가 끝나면 효과 화면으로
  return { live, includeTest, truncated, finishEffect, publishDone, E, pub, conf, confOut, sens, raw, req, ready, wait, opt, fps, P, fresh, caught, work, SEL, lastPub, now, behind, pc, loading, serverEmpty,
    Q, keyOf, cur, ci, eff, steps, act, decideCase, keepFp, select, pickItem, allOk }
}
export type BoardModel = ReturnType<typeof useBoardModel>
