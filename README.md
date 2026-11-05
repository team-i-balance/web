# iBalance Web — 정보보호팀 콘솔

생성형 AI 입력정보 사전 점검 도우미의 **보안팀 화면**이다. 직원 PC에서 올라온 이벤트를 흐름도로 보여 주고, 원문을 그대로 보낸 건을 판단하고, 재발 방지 규칙을 서명해 배포한다.

빌드 없는 정적 페이지(HTML · CSS · JS 한 파일)다.

## 실행

```bash
python3 -m http.server 5310
```

http://localhost:5310 을 연다.

## 백엔드 연결

[team-i-balance/backend](https://github.com/team-i-balance/backend)의 `/health`, `/logs/events`에 붙는다.

- 서버 주소는 `?api=http://서버:포트` → 브라우저에 저장한 값(`localStorage.apiBase`) → `http://localhost:8000` 순서로 시도한다.
- 연결되면 오른쪽 위에 **서버 연결됨 · N건**이 뜨고, 최근 7일 이벤트로 흐름도·대기열을 다시 만든다.
- 연결하지 못하면 **예시 데이터**로 돌아간다(발표·시연용).
- 백엔드 CORS의 `ALLOWED_ORIGINS`에 이 페이지 주소를 넣어야 한다.

로컬에서 백엔드를 띄우고 예시 이벤트를 넣는 방법:

```bash
# backend 레포에서
ALLOWED_ORIGINS=http://localhost:5310 uvicorn main:app --port 8000
# 이 레포에서 (localhost 주소만 받는다)
python3 tools/seed_local_backend.py http://localhost:8000
```

### 지금 연결된 것과 아직 없는 것

| 콘솔 기능 | 상태 |
|---|---|
| 흐름도 숫자(입력·변환·원문 전송·오탐·선택·필수) | `/logs/events` 최근 7일로 계산 |
| 선택 검토·오탐 신고·필수 검토 목록 | 이벤트에서 만든다. 직원·부서·AI·사유 글·잡힌 값은 서버에 없어 빈칸 |
| 판단·되돌리기·정책 수정·서명 후 배포 | 화면 안에서만 동작(서버 API 없음) |

빠진 API와 제안은 [docs/BACKEND-API-GAP.md](docs/BACKEND-API-GAP.md), 정책 번들·서명 형식은 [docs/BUNDLE-SPEC.md](docs/BUNDLE-SPEC.md)에 있다.

## 구조

| 경로 | 내용 |
|---|---|
| `index.html` | 화면과 동작 전부. 맨 아래 `백엔드 연동` 절이 서버 연결부 |
| `style.css` | 스타일. 맨 위는 라이트 토큰, 뒤쪽 `v15`~ 절에서 다크·앰버 테마로 덮어쓴다 |
| `fonts/` | Pretendard Variable (SIL OFL 1.1, `Pretendard-OFL.txt`) |
| `docs/DESIGN-SETTINGS-DARK.md` | 디자인 설정(색·글자·치수·컴포넌트). 직원 쪽 프로그램도 이 기준을 따른다 |
| `docs/BACKEND-API-GAP.md` | 콘솔 ↔ 백엔드 API 대조와 요청 목록 |
| `docs/BUNDLE-SPEC.md` | 변환 정책 번들(DSSE) · Ed25519 서명 명세 |
| `tools/policy_bundle.py` | 번들 서명·검증 참고 구현 (`pip install cryptography`) |
| `tools/seed_local_backend.py` | 로컬 백엔드에 예시 이벤트 넣기 |

## 화면

- **작업판**: 흐름도 노드가 곧 대기열. 노드를 고르면 아래 트레이에 지금 한 건과 단계 바가 나오고, 위반 · 예외 인정 · 오탐을 한 번에 고른다(되돌리기 가능).
- **위반 검토 / 오탐 신고 / 변환 정책**: 목록·상세·정책 편집.
- 오른쪽 위 **시연 순서 보기**: 발표용 3단계 안내.
