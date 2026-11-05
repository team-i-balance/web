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
| `BACKEND_URL` | 예 | 백엔드 주소. 예: `http://13.193.207.69:8501` |

브라우저 코드에는 들어가지 않는다(`VITE_` 접두사 없음). 브라우저는 같은 주소의 `/api` 만 부르고, 개발에서는 Vite 프록시가, 배포에서는 `api/proxy.ts`(Vercel 함수, `vercel.json` 이 `/api/*` 를 넘김)가 `BACKEND_URL` 로 넘긴다. 그래서 백엔드가 `http` 이거나 CORS 가 콘솔 주소를 허용하지 않아도 된다.

## 배포 (Vercel)

1. Vercel 에서 `team-i-balance/web` 을 import — Framework Preset 은 **Vite**(자동 감지)
2. Environment Variables 에 `BACKEND_URL` 추가
3. Deploy

오른쪽 위에 **서버 연결됨 · N건** 이 뜨면 연동 성공이다. 누르면 서버 전체 통계(`/logs/stats`), 다시 불러오기, 로그 암호화 내보내기(`/logs/export`)가 있다.

## 백엔드 연동 상태

| 콘솔 기능 | 상태 |
|---|---|
| 흐름도 숫자(입력·변환·원문 전송·오탐·선택·필수) | `/logs/events` 최근 7일로 계산 |
| 선택 검토·오탐 신고·필수 검토 목록 | 이벤트에서 만든다. 직원·부서·AI·사유 글·잡힌 값은 서버에 없어 빈칸 |
| 서명 후 배포 | `/policy/publish` 로 보내면 서버가 버전을 매겨 서명·저장. 첫 화면에서 `/policy/latest` 를 읽어 버전·규칙·항목 켬/끔을 맞춘다. 회사 고유 단어·탐지 제외 값은 sha256 해시로 보낸다 |
| PC 적용 현황 | `/policy/acks` (적용 n대 · 거부 n대와 사유) |
| 판단·종결·되돌리기 | 화면 안에서만 동작(서버 API 없음) |

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
