// 예시 데이터: 백엔드에 연결하지 못했을 때(또는 ?api=off) 보여 준다. 시드 고정이라 매번 같다.
import type { AiEvent, Case, Cause, Conclusion, Item, Policy } from './types'
import { convert, rnd } from '../lib/util'

export const ME = '김보안'
export const GRADE = { O: '공개', C: '기밀', S: '민감' } as const
export const METHODS = ['대체', '일반화', '삭제', '태그'] as const
export const CONCLUSION: Record<Conclusion, [string, string]> = {
  violation: ['위반 확정', '정당한 사유 없이 개인정보를 외부로 보냈어요'],
  legit: ['정당한 업무 사용', '업무상 원문이 필요했고, 확인 결과 문제없어요'],
  fp: ['탐지 오류', '개인정보가 아니었어요 (오탐)'],
}
// 원인: 변환 결과가 업무에 맞지 않았던 경우만 자동 변환으로 재발을 막을 수 있다
export const CAUSES: Record<Cause, { t: string; rule?: boolean }> = {
  fit: { t: '변환 결과가 업무에 맞지 않아 원문을 썼어요', rule: true },
  care: { t: '개인정보가 들어간 줄 모르고 원문을 보냈어요' },
  intent: { t: '업무상 필요 없이 원문을 보냈어요' },
}
const USERS = [['이서연', '영업1팀'], ['박지훈', '고객지원팀'], ['최유나', '인사팀'], ['정민호', '개발팀'], ['강하늘', '재무팀'], ['윤지아', '마케팅팀'], ['한도윤', '고객지원팀'], ['오세린', '개발팀'], ['임재현', '영업2팀'], ['송다은', '법무팀'], ['배준서', '영업1팀'], ['신하은', '고객지원팀'], ['조민재', '개발팀'], ['권나연', '인사팀'], ['황지호', '재무팀'], ['안소율', '마케팅팀'], ['유태경', '영업2팀'], ['노예린', '고객지원팀'], ['서도현', '개발팀'], ['문채원', '구매팀'], ['장우진', '구매팀'], ['홍서아', '영업1팀']]
const AI = ['ChatGPT', 'Claude', 'Gemini', 'Copilot']

export function initialPolicy(): Policy {
  return {
    version: 'v12', deployed: '10/28 14:02',
    entities: [
      { name: '이름', grade: 'S', method: '대체', sample: '홍길동', on: true },
      { name: '전화번호', grade: 'S', method: '대체', sample: '010-2345-6789', on: true },
      { name: '이메일', grade: 'S', method: '대체', sample: 'hong@gmail.com', on: true },
      { name: '주소', grade: 'S', method: '일반화', sample: '서울 마포구 월드컵북로 21', on: true },
      { name: '나이', grade: 'S', method: '일반화', sample: '17세', on: true },
      { name: '생년월일', grade: 'S', method: '일반화', sample: '1994년 3월 12일', on: true },
      { name: '계좌번호', grade: 'S', method: '대체', sample: '국민 123456-01-234567', on: true },
      { name: '고객ID', grade: 'S', method: '대체', sample: 'CU-882910', on: true },
      { name: '카드번호', grade: 'S', method: '삭제', sample: '4111-1111-1111-1111', on: true },
      { name: '주민등록번호', grade: 'S', method: '삭제', sample: '880512-1234567', on: true },
      { name: '프로젝트 코드명', grade: 'S', method: '태그', sample: '프로젝트 오로라', on: true },
      { name: 'API 키', grade: 'C', method: '—', sample: 'sk-live-…', on: true },
      { name: '비밀번호', grade: 'C', method: '—', sample: 'password=…', on: true },
      { name: '미공개 실적', grade: 'C', method: '—', sample: '3분기 매출 412억', on: true },
      { name: '사업자번호', grade: 'O', method: '—', sample: '123-45-67890', on: false },
    ],
    learned: [
      { type: '고객ID', when: '"CU-"로 시작하는 6자리 고객번호', method: '대체', from: 'INC-24702', hits: 212, live: true, at: new Date('2026-10-21') },
      { type: '계좌번호', when: '은행명 바로 뒤에 오는 숫자 묶음', method: '대체', from: 'INC-24731', hits: 47, live: true, at: new Date('2026-10-28') },
    ],
    dict: [
      { term: '프로젝트 오로라', alias: 'AURORA, 오로라 PJT', type: '프로젝트 코드명' },
      { term: '프로젝트 한라', alias: 'HALLA', type: '프로젝트 코드명' },
      { term: '3분기 매출', alias: 'Q3 잠정', type: '미공개 실적' },
    ],
    exclude: [
      { term: '1588-1234', why: '회사 대표번호 (홈페이지 공개)', from: '오탐 신고 9회' },
      { term: 'support@company.co.kr', why: '고객센터 공용 메일 (공개)', from: '오탐 신고 4회' },
    ],
    meta: { '작성자': true, '메모·주석': true, '변경 내용 추적': true, '숨긴 시트·행': true, '사진 위치(EXIF)': true, '문서 속성(회사명 등)': true },
    changes: [],
  }
}

const SAMPLES: { tpl: string; items: [string, string][] }[] = [
  { tpl: '고객 {0} 님(연락처 {1})이 {2}로 배송지 변경을 요청했어요. 사과 메일 초안 써줘.', items: [['이름', '홍길동'], ['전화번호', '010-2345-6789'], ['주소', '서울 마포구 월드컵북로 21 302호']] },
  { tpl: '{0}({1}, 고객번호 {2}) 환불 건 처리 순서 정리해줘', items: [['이름', '김도현'], ['이메일', 'dohyun.kim@gmail.com'], ['고객ID', 'CU-882910']] },
  { tpl: '지원자 {0}, {1}생, {2} 거주. 면접 질문 10개 뽑아줘', items: [['이름', '박서준'], ['생년월일', '1994년 3월 12일'], ['주소', '경기 성남시 분당구 정자동 178']] },
  { tpl: '{0} 일정이 2주 밀렸어요. 협력사에 보낼 지연 안내 메일 써줘', items: [['프로젝트 코드명', '프로젝트 오로라']] },
  { tpl: '{0} {1} 님 4대보험 취득 신고서 작성 순서 알려줘', items: [['주민등록번호', '880512-1234567'], ['이름', '윤정아']] },
  { tpl: '거래처 담당 {0} 님 계좌 {1}로 이체 요청 메일 써줘', items: [['이름', '이영희'], ['계좌번호', '국민 123456-01-234567']] },
  { tpl: '{0}({1}) 학생 상담 기록 요약해줘. 보호자 연락처 {2}', items: [['이름', '최하린'], ['나이', '17세'], ['전화번호', '010-8877-1234']] },
  { tpl: '카드 {0} 결제가 왜 거절됐는지 고객 {1} 님께 안내문 써줘', items: [['카드번호', '4111-1111-1111-1111'], ['이름', '문가영']] },
  { tpl: 'Authorization: Bearer {0} 넣었는데 왜 401 나와?', items: [['API 키', 'sk-live-9fA2x7Qp1LmZ0bN4']] },
  { tpl: '{0} 412억 기준으로 IR 자료 요약해줘', items: [['미공개 실적', '3분기 매출']] },
  { tpl: '회의록 템플릿 마크다운으로 만들어줘', items: [] },
  { tpl: '파이썬에서 리스트 중복 제거하는 법 알려줘', items: [] },
]
const REV_W: Record<string, number> = { '주소': .4, '프로젝트 코드명': .5, '고객ID': .35, '생년월일': .25, '계좌번호': .2, '이름': .12, '나이': .15, '전화번호': .08, '이메일': .08, '주민등록번호': .05, '카드번호': .05 }
const FP_P: Record<string, number> = { '프로젝트 코드명': .75, '고객ID': .65, '주소': .25 }
const FILES: [string, string[]][] = [['고객명단_11월.xlsx', ['작성자', '숨긴 시트·행', '메모·주석']], ['인사평가_초안.docx', ['작성자', '변경 내용 추적']], ['현장사진_0412.jpg', ['사진 위치(EXIF)']], ['계약서_스캔.pdf', ['작성자', '문서 속성(회사명 등)']]]

export const LATE_REASON = [
  '고객 문의 답장을 급하게 쓰느라 사유 입력 창을 그냥 넘겼습니다. 실제 이름과 연락처가 들어가야 하는 안내문이었습니다.',
  '개인정보가 들어간 줄 모르고 원문 전송을 눌렀습니다. 앞으로 미리보기를 확인하겠습니다.',
  '변환본으로 보내면 거래처가 내용을 못 알아봐서 원문으로 보냈습니다. 사유 입력은 깜빡했습니다.',
]
const NEED_REASON: Record<string, string> = { '주민등록번호': '4대보험 신고서 양식이 맞는지 확인하려면 실제 번호 형식이 필요했습니다.', '계좌번호': '거래처 이체 요청 메일이라 실제 계좌번호가 들어가야 했습니다.', '프로젝트 코드명': '협력사에 보내는 메일이라 실제 프로젝트명이 필요했습니다.', '주소': '배송지 변경 안내라 정확한 주소가 필요했습니다.', '고객ID': '고객 시스템에서 조회할 실제 고객번호가 필요했습니다.', '생년월일': '지원 자격(연령) 확인에 실제 생년월일이 필요했습니다.', '이름': '고객에게 바로 보낼 안내문이라 실제 이름이 필요했습니다.' }

export const R = rnd(11)
export const pick = <T,>(a: T[]): T => a[Math.floor(R() * a.length)]

export function seedData(policy: Policy, NOW: Date): { events: AiEvent[]; cases: Case[] } {
  const ent = (n: string) => policy.entities.find(e => e.name === n)!
  const events: AiEvent[] = []
  for (let i = 0; i < 380; i++) {
    const s = pick(SAMPLES); let u = pick(USERS)
    const t = new Date(+NOW - Math.floor(Math.pow(R(), 1.1) * 21 * 24 * 60) * 60000), age = (+NOW - +t) / 864e5
    const grade = s.items.some(([x]) => ent(x).grade === 'C') ? 'C' : s.items.length ? 'S' : 'O'
    const ti: Record<string, number> = {}
    const items: Item[] = s.items.map(([type, orig]) => {
      const e = ent(type), k = (ti[type] = (ti[type] ?? -1) + 1)
      return { type, orig, method: e.method, conv: e.grade === 'S' ? convert(type, orig, e.method, k) : null, status: grade === 'S' ? 'conv' : null, reason: null, fp: null }
    })
    let action: AiEvent['action'] = grade === 'C' ? 'block' : 'pass'
    if (grade === 'S') {
      // 자동 변환이 쌓이며 원문 전송은 줄어드는 추세
      const r = R(), pr = .06 + .08 * (age / 21)
      action = r < pr ? 'raw' : r < pr + .23 ? 'revert' : r < pr + .31 ? 'cancel' : 'sent'
      if (action === 'raw') { items.forEach(it => (it.status = 'raw')); if (R() < .3) u = USERS[pick([1, 8, 12])] }
      if (action === 'revert') {
        items.forEach(it => { if (R() < (REV_W[it.type] || .1) * 1.6) it.status = 'revert' })
        if (!items.some(it => it.status === 'revert')) items.reduce((a, b) => ((REV_W[b.type] || 0) > (REV_W[a.type] || 0) ? b : a)).status = 'revert'
        items.filter(it => it.status === 'revert').forEach(it => { it.reason = R() < (FP_P[it.type] ?? .3) ? '오탐' : '업무상 필요'; if (it.reason === '오탐') it.fp = 'open' })
      }
    }
    const f = R() < .2 && grade === 'S' ? pick(FILES) : null
    events.push({ id: String(25060 - i), time: t, user: u[0], dept: u[1], ai: pick(AI), file: f ? { name: f[0], meta: f[1] } : null,
      tpl: s.tpl, items, grade, action, conf: +(0.93 + R() * .06).toFixed(2), ver: t < new Date('2026-10-28T14:02') ? 'v11' : 'v12' })
  }
  events.sort((a, b) => +b.time - +a.time)
  // 데모: 최근 민감 건 하나는 주민등록번호 원문 전송
  {
    const e = events.find(e => e.grade === 'S' && +NOW - +e.time > 3 * 36e5)!, sm = SAMPLES[4]
    Object.assign(e, { tpl: sm.tpl, action: 'raw', file: null, items: sm.items.map(([type, orig]) => ({ type, orig, method: ent(type).method, conv: convert(type, orig, ent(type).method), status: 'raw', reason: null, fp: null })) })
  }
  events.filter(e => +NOW - +e.time > 10 * 864e5).forEach(e => e.items.forEach(it => { if (it.fp === 'open' && R() < .6) it.fp = pick(['exclude', 'keep'] as const) }))

  // 필수: 원문 전송 + 사유 없음 → 시스템이 직원에게 사유 제출을 요청 / 선택: 항목 되돌림 + "업무상 필요"
  const cases: Case[] = events.filter(e => e.action === 'raw' || (e.action === 'revert' && e.items.some(i => i.reason === '업무상 필요'))).map(e => ({
    id: 'INC-' + e.id, ev: e, need: e.action === 'raw' ? 'req' : 'opt', time: e.time, user: e.user, dept: e.dept, items: e.items, file: e.file,
    status: 'open', reason: null, close: null, timeline: [],
  }))
  cases.forEach(c => {
    const age = (+NOW - +c.time) / 864e5
    if (c.need === 'opt') {
      const it = c.items.find(i => i.reason === '업무상 필요')!
      c.reason = { pick: '업무상 필요', text: NEED_REASON[it.type] || '업무 처리에 실제 값이 필요했습니다.', at: c.time, when: '전송할 때' }
      c.timeline.push({ t: c.time, who: c.user, cls: 'emp', what: '미리보기에서 항목 되돌림 · 사유 "업무상 필요"', quote: c.reason.text })
      if (age > 4 && R() < .9) { c.status = 'closed'; c.close = { k: 'legit', cause: null, memo: '사유 확인', rule: null, by: pick(['이정보', '박관제']), at: new Date(+c.time + (1 + R() * 2) * 864e5) } }
      return
    }
    c.timeline.push({ t: c.time, who: '시스템', cls: 'sys', what: '원문 전송 · 사유 선택 건너뜀 → 직원에게 사유 제출 요청' })
    const sub = new Date(+c.time + (.03 + R() * Math.min(1.6, Math.max(.05, age - .05))) * 864e5)
    if (R() < .72 && sub < NOW) { c.reason = { text: pick(LATE_REASON), at: sub, when: '요청 받고 제출' } }
    if (age > 3 && R() < .88) {
      const k: Conclusion = c.reason ? pick(['violation', 'violation', 'legit', 'fp'] as Conclusion[]) : 'violation'
      c.status = 'closed'
      c.close = { k, cause: k === 'fp' ? null : pick(['care', 'care', 'fit', 'intent'] as Cause[]), memo: c.reason ? '' : '사유 미제출', rule: null, by: pick(['이정보', '박관제', '김보안']),
        at: new Date(Math.max(+c.time + 864e5, +(c.reason ? c.reason.at : c.time) + (.3 + R()) * 864e5)) }
    }
  })
  // 데모: 최근 선택 건 하나는 한 항목을 "오탐"으로도 되돌림 (오탐 신고·선택 검토 양쪽에 보임)
  const MIX = ['주소', '생년월일', '고객ID', '프로젝트 코드명', '나이']
  const c = cases.find(c => c.need === 'opt' && c.status === 'open' && c.items.some(i => i.status === 'conv' && MIX.includes(i.type)))
  if (c) { const it = c.items.find(i => i.status === 'conv' && MIX.includes(i.type))!; it.status = 'revert'; it.reason = '오탐'; it.fp = 'open' }
  return { events, cases }
}
