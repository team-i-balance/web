# 보안팀 콘솔 ↔ 백엔드 API 대조 (2026-11-05)

대상: `team-i-balance/backend` main `7ce4b0b`. 배포 서버 `http://13.193.207.69:8501`의 `/openapi.json`도 main과 같은 것을 확인했다. 나머지 브랜치(log, sum, test, xlsx, masking)는 main에 이미 합쳐졌거나 API 추가가 없다. feat/slm-detector는 탐지기 변경뿐이다.

## 1. 지금 있는 API

| API | 하는 일 | 콘솔에서 쓸 곳 |
|---|---|---|
| `POST /logs/events` | 직원 쪽 이벤트 저장. 저장할 때 큐를 분류함 | (직원 쪽이 호출) |
| `GET /logs/events?grade&queue&start&end&limit` | 이벤트 목록, 최신순, 최대 1000 | 대기열 목록, 최근 7일 집계 |
| `GET /logs/queues/{name}` | 큐별 목록 | 대기열 목록 |
| `GET /logs/stats` | 전체 건수, 수용률, 되돌림률, 회피 의심, 큐·등급별 건수 | 작업판 흐름도 숫자 일부 |
| `POST /logs/export` | 보안팀 공개키로 암호화한 로그 파일을 **서버 디스크에** 씀 | (내려받기 경로 없음) |
| `POST /process`, `/process/decide`, `/process/restore` | 직원 입력 탐지·가명화 → 직원 선택 기록 → AI 답 복원 | (직원 쪽이 호출) |
| `POST /files/sanitize` | XLSX 보호본 생성 | (직원 쪽이 호출) |

이벤트 한 건(`EventOut`)에 있는 값: `id, created_at, request_id(=work_id), grade, action, reason, detection_confidence, detected_types[], detected_count, reverted, restored, content_hash, queue`

큐 분류(`app/rules.md` 4절):

| 조건 | 큐 |
|---|---|
| reason = false_positive | detection_improve |
| reason = business_need | violation_candidate |
| action = cancel 이고 confidence = high | real_violation |
| 나머지 | pre_warning |

## 2. 콘솔 화면별 필요한 것과 현재 상태

| 콘솔 기능 | 필요한 데이터·동작 | 현재 | 판단 |
|---|---|---|---|
| 작업판 흐름도 숫자(최근 7일) | 기간별 전체·공개·민감·기밀, 전송·취소·되돌림·원문 전송 건수 | `/logs/stats`는 **기간 필터가 없고**, 행동(action)별 건수가 없음 | **부족** |
| 필수 검토 대기열 | 원문 전송 + 사유 없음 + 확실한 탐지 | `real_violation`은 **"취소 + 확실한 탐지"**라 콘솔 정의와 반대 | **정의 불일치** |
| 선택 검토 대기열 | 업무상 필요로 보낸 건 | `violation_candidate` | 있음 |
| 오탐 신고 대기열 | 오탐으로 되돌린 **값**별 묶음(신고 횟수, 나온 문장) | `detection_improve`는 이벤트 단위이고 **어떤 값이 잡혔는지 저장하지 않음** | **부족** |
| 건 카드: 누가·부서·어느 AI·언제 | 직원 식별자, 부서, 대상 AI | 이벤트에 **없음** | **부족** |
| 건 카드: 보낸 내용(가린 원문) | 가린 문장 또는 항목별 가린 값 | 본문 저장 금지 원칙상 **없음** | **결정 필요** |
| 건 카드: 직원 사유 글 | 직원이 쓴 사유 문장 | `reason`은 enum 2개뿐, **글 없음** | **부족** |
| 항목별 처리(어떤 항목은 오탐, 어떤 항목은 업무상 필요) | 탐지 항목마다 결정·사유 | 이벤트당 reason 하나 | **부족** |
| 사유 대기 → 사유 도착 | 시스템이 직원에게 사유 요청, 직원이 나중에 제출 | 없음 | **부족** |
| 판단(위반 / 예외 인정 / 오탐) + 되돌리기 | 건 상태·결론·원인·메모·처리자·시각, 다시 열기 | **건(case) 개념 자체가 없음** | **부족** |
| 예외 인정 → 재발 방지 규칙 생성 | 규칙 초안 저장(배포 대기) | 없음 | **부족** |
| 변환 정책 조회·수정 | 항목 켬/끔·등급·변환 방식, 규칙, 고유 단어, 탐지 제외, 파일 사본 설정 | 없음(SLM은 `rules.json` 파일, 정규식은 하드코딩) | **부족** |
| 서명 후 배포·PC 적용 현황 | 번들 생성·서명·배포·ack 집계 | 없음 | **부족**(명세 `BUNDLE-SPEC.md` 전달함) |
| 배포 효과(원문 전송 7 → 5) | 새 규칙을 지난 이벤트에 적용해 본 결과 | 없음 | 콘솔 계산 가능(이벤트에 항목 유형이 있으면) |
| 파일 첨부 건 | 파일 업로드 여부·숨은 정보 | `/files/sanitize`가 **이벤트를 남기지 않음** | **부족** |
| 보안팀 로그인·권한 | 콘솔 접근 제한 | **인증 없음**, CORS 기본 `*` | **부족** |
| 목록 페이지 넘김 | 다음 페이지 | `limit`만 있고 offset·cursor 없음 | 부족(작음) |

## 3. 백엔드에 요청할 것 (우선순위 순)

### P0 — 이게 없으면 콘솔이 실제 데이터로 못 돈다

1. **큐 정의 맞추기**: `real_violation`을 콘솔의 필수 검토 정의(원문 전송·되돌림 + 사유 없음 + high)로 바꾸거나, 새 큐 `required_review`를 추가. 지금 정의(취소 + high)는 보낸 게 없어서 위반이 아님.
2. **이벤트에 필드 추가** (`EventIn`·`event_log`)
   - `user_id`(사번 또는 가명 ID), `dept`, `target_ai`(ChatGPT·Claude 등), `device_id`
   - `items[]`: 항목별 `{type, decision: converted|reverted|raw, reason?, value_hash, preview}`
     - `value_hash`: 값의 HMAC-SHA256(조직 키). 오탐 값을 묶는 데 씀
     - `preview`: 가린 값(예: `윤*아`, `******-*******`). 원문 저장 금지 원칙 유지
   - `reason_text`(선택): 직원이 쓴 사유 문장
   - `masked_preview`(선택, 결정 필요): 가명·가림 처리한 문장. 콘솔 "보낸 내용"에 씀
3. **건(case) API** — 필수·선택 검토 건의 처리 상태
   - `GET /cases?queue=required|optional|closed&status&cursor`
   - `GET /cases/{id}` → 이벤트 + 사유 + 처리 기록
   - `POST /cases/{id}/close` `{conclusion: violation|legit|fp, cause?, memo, rule?}` → 응답에 생성된 규칙 초안 포함
   - `POST /cases/{id}/reopen` (되돌리기)
   - `POST /cases/close-bulk` `{ids, conclusion}` (선택 검토 "모두 문제 없음")
4. **통계 기간 필터와 행동별 건수**: `GET /logs/stats?start&end` → `by_action`(send_as_is, send_transformed, cancel, revert_original)도 반환

### P1 — 정책·배포 (명세: `docs/BUNDLE-SPEC.md`)

5. 정책 조회·수정: `GET /policy/draft`, `PATCH /policy/draft`(항목·규칙·고유 단어·탐지 제외·파일 사본), `GET /policy/changes`(배포 대기 목록)
6. 배포: `POST /policy/publish`, `GET /policy/latest`, `GET /policy/{version}`, `POST /policy/ack`, `GET /policy/{version}/acks`(적용·거부 대수와 사유)
7. 오탐 묶음: `GET /false-positives?status=open|done` (value_hash 기준 묶음, 신고 횟수, 대표 문장 preview), `POST /false-positives/{hash}/exclude {why}`, `POST /false-positives/{hash}/keep`

### P2 — 운영

8. 사유 요청·제출: `POST /cases/{id}/reason`(직원 쪽 제출), 요청 상태 필드
9. 파일 처리도 이벤트로 남기기(`/files/sanitize` 결과 → event, `file: {kind, hidden_removed[]}`)
10. 보안팀 인증(최소 API 키 또는 SSO), `ALLOWED_ORIGINS` 콘솔 주소로 제한
11. 목록 cursor 페이지 넘김, `/logs/export` 결과 내려받기

## 4. 콘솔 쪽에서 미리 알아둘 제약

- **아티팩트에서는 백엔드를 부를 수 없다.** 아티팩트는 외부 호출(fetch)이 막혀 있고, 서버도 `http`라 `https` 페이지에서 막힌다. 실제 연동 시연은 콘솔을 로컬이나 별도 호스팅(https)에서 띄워야 한다.
- 배포 서버 DB는 지금 비어 있다(`/logs/stats` total 0). 시연용 시드 데이터가 필요하다.
- 등급 값은 `public_O / sensitive_S / confidential_C`, action·reason은 영문 enum이다. 콘솔 표시는 한국어로 매핑한다.
- 시각은 UTC ISO 문자열이다. 콘솔에서 KST로 표시한다.

## 5. 지금 바로 연결할 수 있는 것

- `/health`: 연결 상태 표시
- `/logs/stats`: 흐름도의 전체·등급별·큐별 숫자(전체 기간)
- `/logs/events?start&end`: 최근 7일 이벤트를 받아 콘솔에서 행동별로 직접 세기(통계 기간 필터 대신)
- `/logs/queues/violation_candidate`, `/logs/queues/detection_improve`: 목록 골격(이름·AI·사유·값은 아직 비어 있음)
