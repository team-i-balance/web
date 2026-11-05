// 화면 공통 상수와 정책 기본값. 데이터는 모두 서버에서 읽는다(예시 데이터 없음).
import type { Cause, Conclusion, Policy } from './types'

export const ME = '보안팀'
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

// 탐지 항목: 서버 탐지기가 실제로 끄고 켜는 항목만(backend app/policy_apply.py _CATEGORY_TO_DETECTOR_TYPE).
// sample 은 '결과 예시' 칸에 보이는 가상의 값이다
export function initialPolicy(): Policy {
  return {
    version: '', deployed: '',
    entities: [
      { name: '이름', grade: 'S', method: '대체', sample: '홍길동', on: true },
      { name: '전화번호', grade: 'S', method: '대체', sample: '010-2345-6789', on: true },
      { name: '이메일', grade: 'S', method: '대체', sample: 'hong@gmail.com', on: true },
      { name: '주소', grade: 'S', method: '일반화', sample: '서울 마포구 월드컵북로 21', on: true },
      { name: '생년월일', grade: 'S', method: '일반화', sample: '1994년 3월 12일', on: true },
      { name: '계좌번호', grade: 'S', method: '대체', sample: '국민 123456-01-234567', on: true },
      { name: '카드번호', grade: 'S', method: '삭제', sample: '4111-1111-1111-1111', on: true },
      { name: '주민등록번호', grade: 'S', method: '삭제', sample: '880512-1234567', on: true },
      { name: 'API 키', grade: 'C', method: '—', sample: 'sk-live-…', on: true },
      { name: '비밀번호', grade: 'C', method: '—', sample: 'password=…', on: true },
      { name: '사업자번호', grade: 'O', method: '—', sample: '123-45-67890', on: false },
    ],
    learned: [],
    dict: [],
    exclude: [],
    meta: { '작성자': true, '메모·주석': true, '변경 내용 추적': true, '숨긴 시트·행': true, '사진 위치(EXIF)': true, '문서 속성(회사명 등)': true },
    changes: [],
  }
}

export const POLICY_TYPES = new Set(initialPolicy().entities.map(e => e.name))
