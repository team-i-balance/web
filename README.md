# iBalance Web — 정보보호팀 콘솔

생성형 AI 입력정보 사전 점검 도우미의 **보안팀 화면**이다. 직원 PC에서 올라온 이벤트를 흐름도로 보여 주고, 원문을 그대로 보낸 건을 판단하고, 재발 방지 규칙을 서명해 배포한다.

React 18 + Vite 6 + TypeScript.

## 실행

```bash
npm install
cp .env.example .env.local   # BACKEND_URL 확인
npm run dev                  # http://localhost:5320
```

| 명령 | 하는 일 |
|---|---|
| `npm run dev` | 개발 서버(5320). `/api` 를 `BACKEND_URL` 로 넘긴다 |
| `npm run build` | 타입 검사 + `dist/` 빌드 |
| `npm run preview` | 빌드 결과 확인(같은 `/api` 프록시) |

주소 뒤에 `?api=off` 를 붙이면 백엔드 없이 예시 데이터로만 돈다(발표·시연용).

## 환경변수

| 이름 | 필수 | 설명 |
|---|---|---|
| `BACKEND_URL` | 예 | 백엔드 주소. 예: `https://13.193.207.69` |
| `BACKEND_TOKEN` | 아니요 | 백엔드가 인증을 요구하면 넣는다. `Authorization: Bearer` 로 붙여 보낸다 |
| `BACKEND_CA` | 아니요 | 백엔드 인증서(PEM)가 바뀌었을 때만. 기본은 `api/_backend-ca.ts` 에 고정한 팀 서버 인증서 |

셋 다 브라우저 코드에는 들어가지 않는다(`VITE_` 접두사 없음). 브라우저는 같은 주소의 `/api` 만 부르고, 개발에서는 Vite 프록시가, 배포에서는 `api/proxy.ts`(Vercel 함수, `vercel.json` 이 `/api/*` 를 넘김)가 `BACKEND_URL` 로 넘긴다. 팀 서버는 자체 서명 인증서를 쓰므로 인증서 검증을 끄지 않고 그 인증서만 신뢰하도록 고정했다.

## 배포 (Vercel)

1. Vercel 에서 `team-i-balance/web` 을 import — Framework Preset 은 **Vite**(자동 감지)
2. Environment Variables 에 `BACKEND_URL` 추가
3. Deploy

오른쪽 위에 **서버 연결됨 · N건** 이 뜨면 연동 성공이다. 누르면 서버 전체 통계(`/logs/stats`), 다시 불러오기, 로그 암호화 내보내기(`/logs/export`)가 있다.

## 백엔드 연동 상태

| 콘솔 기능 | API |
|---|---|
| 흐름도 숫자, 오탐 신고, 현황 | `/logs/events` 최근 30일을 `cursor` 로 끝까지 받아 계산. 현황의 서버 집계는 `/logs/stats?start&end`(행동별 `by_action` 포함) |
| 필수·선택 검토 목록과 결론 | `/cases`(열린 건·종결 건), 판단은 `/cases/{id}/close`, 되돌리기·다시 열기는 `/cases/{id}/reopen`. 같은 건 요청은 순서대로 보낸다 |
| 처리 기록 | `/cases/{id}` 의 `history` |
| 직원 사유 | 이벤트의 `reason_text` · `reason_at` (직원 앱이 `/events/{id}/reason` 으로 제출) |
| 서명 후 배포 | `/policy/publish`(버전·서명은 서버), 시작할 때 `/policy/latest` 로 버전·규칙·항목 켬/끔을 맞춘다. 고유 단어·탐지 제외 값은 sha256 해시로 보낸다 |
| 배포 기록 · PC 적용 | `/policy/history`, `/policy/{버전}/acks` |
| 직원·부서·대상 AI, 잡힌 값 | 서버에 아직 없음(이슈 #21) — 칸을 비워 둔다 |
| 정책 초안 | 브라우저 안에만 있음 — 새로고침하면 사라진다 |

빠진 API와 제안은 [docs/BACKEND-API-GAP.md](docs/BACKEND-API-GAP.md), 정책 번들·서명 형식은 [docs/BUNDLE-SPEC.md](docs/BUNDLE-SPEC.md)에 있다.

## 구조

| 경로 | 내용 |
|---|---|
| `src/domain/` | 타입, 예시 데이터(`seed.ts`), 상태와 처리 동작(`store.ts`) |
| `src/api/` | 백엔드 연결·이벤트 변환(`client.ts`), 정책 배포·PC 적용 현황(`policy.ts`) |
| `src/styles/` | 디자인 토큰(`tokens.css`, 라이트·다크)과 기본 스타일 |
| `src/ds/` | 공용 부품: 버튼·판단 버튼·입력·스위치·세그먼트·단계 바·대화상자·시트 |
| `src/shell/` | 위쪽 막대·아래쪽 탭·⌘K 찾기·단축키 안내·테마·라우트 |
| `src/features/` | 화면: 작업판·위반 검토·오탐 신고·변환 정책·배포·PC·현황, 대화상자·알림·시연 순서 |
| `api/proxy.ts` · `vercel.json` | Vercel 함수: `/api/*` → `BACKEND_URL` |
| `public/fonts/` | Pretendard Variable (SIL OFL 1.1, `Pretendard-OFL.txt`) |
| `docs/` | 디자인 설정, 백엔드 API 대조, 정책 번들·서명 명세 |
| `tools/` | 번들 서명·검증 참고 구현, 로컬 백엔드 예시 이벤트 넣기 |

## 화면

- **작업판**: 흐름도 노드가 곧 대기열. 노드를 고르면 아래 패널에 지금 한 건과 단계 바가 열리고 위반 · 예외 인정 · 오탐을 바로 고른다.
- **위반 검토**: 목록 · 상세 · 사건 경로 · 처리 기록. 선택 검토는 여러 건을 골라 한 번에 종결.
- **오탐 신고**: 값별 묶음, 여러 값 한 번에 탐지 결과 유지, 탐지 제외는 오른쪽 패널.
- **변환 정책**: 고치면 초안으로 쌓이고 아래 막대에서 서명 후 배포.
- **배포·PC**: 지금 정책, PC 적용·거부와 사유, 배포 기록.
- **현황**: 7일·30일 추이, 탐지 항목별·대상 AI별.
- 단축키: `⌘K` 찾기, `?` 안내, `1·2·3` 판단, `↑↓` 다른 건, `Z` 되돌리기. 오른쪽 위 ▶ 시연 순서(→ · ← · Esc).
