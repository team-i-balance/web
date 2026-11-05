# 변환 정책 번들·서명 명세 1.0

보안팀 콘솔에서 바꾼 변환 규칙을 직원 PC로 보내는 파일 형식과 서명 방식이다.
원칙은 하나: **직원 PC는 보안팀이 서명한 번들만 적용하고, 운반 경로는 믿지 않는다.** 그래서 HTTPS·CDN·공유 폴더·MDM 어디로 보내도 된다.

참고 구현: `tools/policy_bundle.py` (keygen / sign / verify, 의존성 `cryptography` 하나). 예시: `tools/bundle-example/`(정책 JSON, 서명된 번들, 공개키. 비밀키는 넣지 않음).

## 1. 흐름

```
콘솔 [서명 후 배포] → 백엔드: payload 생성 → 버전+1 → Ed25519 서명 → DSSE 봉투 저장
                                                              │
직원 PC(로컬 Python 프로세스) ← GET /policy/latest ←──────────┘
   → 서명 확인 → 버전·조직·만료·모델 확인 → SLM set_policy(rules) 적용 → 마지막 정상본 저장
   → POST /policy/ack {device, version, status, reason}
```

## 2. 파일 형식 (DSSE 봉투)

파일 이름 `policy-v{version}.dsse.json`, 내용 형식 `application/vnd.piiguard.policy+json`.

```json
{
  "payloadType": "application/vnd.piiguard.policy+json",
  "payload": "<정책 JSON 바이트의 base64>",
  "signatures": [{ "keyid": "console-2026-11", "sig": "<Ed25519 서명 base64>" }]
}
```

- 서명 대상은 JSON 객체가 아니라 **PAE 바이트**다: `"DSSEv1 " + len(type) + " " + type + " " + len(payload) + " " + payload`. 그래서 JSON 정규화(키 순서·공백)를 신경 쓰지 않아도 된다.
- 검증 측은 payload 를 base64 디코딩한 **그 바이트**로 서명을 확인한 뒤에만 JSON 파싱한다.

## 3. payload (정책 JSON)

```json
{
  "schema": 1,
  "org": "acme",
  "version": 13,
  "issued_at": "2026-11-05T16:40:00+09:00",
  "expires_at": "2026-12-05T00:00:00+09:00",
  "prev": "sha256:<v12 payload 해시>",
  "model": { "name": "pii-slm", "version": "0.3.0", "sha256": "<모델 파일 해시>" },
  "thresholds": { "confidential": 0.45, "personal": 0.35, "high_confidence": 0.7 },
  "rules": [
    { "id": "r-24702", "label": "고객 ID", "description": "CU로 시작하는 6자리 고객번호", "grade": "S", "action": "대체" }
  ],
  "types":   { "주민등록번호": { "on": true }, "사업자번호": { "on": false } },
  "dict":    [],
  "exclude": []
}
```

| 필드 | 필수 | 설명 |
|---|---|---|
| `schema` | ✓ | 이 명세 버전. 지금 1. 모르는 값이면 거부 |
| `org` | ✓ | 조직 ID. 다른 조직 번들 거부 |
| `version` | ✓ | 1씩 오르는 정수. **PC는 지금보다 큰 값만 받는다**(롤백 방지) |
| `issued_at` / `expires_at` | ✓ | ISO 8601. 만료되면 새 번들은 거부하되, 쓰던 정책은 계속 쓴다 |
| `prev` | ✓ | 직전 payload 의 sha256. 콘솔 감사·이력용(PC는 검사 안 해도 됨) |
| `model` | ✓ | 이 규칙과 맞는 SLM 모델. 설치된 모델 해시가 다르면 거부 |
| `thresholds` | ✓ | SLM 기준값(기밀·개인정보·높은 확신) |
| `rules` | ✓ | **SLM `rules.json` 의 rules 와 같은 형식**. `label` 15자 이내 명사구, `description` 40자 이내, `grade` S\|C, `action` 대체\|일반화\|삭제\|태그. 고정 라벨 3개(P-NAME 등)는 모델 패키지에 있으므로 넣지 않는다 |
| `types` | 선택 | 정규식 탐지 항목별 켬/끔. PC 쪽 지원 전까지는 무시해도 됨 |
| `dict` / `exclude` | 선택 | 회사 고유 단어·탐지 제외 값. **평문 대신 해시**로 보낸다. 콘솔에서 직접 넣은 값은 `{"h":"sha256:<평문 SHA-256>"}`, 서버 이벤트의 오탐 신고에서 제외한 값은 평문이 없으므로 이벤트의 `value_hash`(조직 키 HMAC-SHA256, 이슈 #21)를 `{"h":"hmac:<64자 hex>"}` 로 보낸다. PC는 접두어에 맞춰 같은 방식으로 값 해시를 계산해 비교한다 |

PC로 보내지 않는 것: 변경 출처(사건 번호), 직원 이름, 판단 근거. 콘솔 감사 기록에만 둔다.

## 4. 서명·검증

- 알고리즘: **Ed25519**. 키 ID(`keyid`)로 키를 구분해 교체할 수 있게 한다.
- 비밀키: 백엔드(콘솔 서버)만 가진다. 운영은 KMS·HSM, 해커톤 시연은 서버 로컬 파일.
- 공개키: PC 에이전트를 설치할 때 `trust/<keyid>.pub` 로 함께 깐다(MDM 배포). PC는 여기 있는 키로만 확인한다.
- 키 교체(운영 단계): 오프라인 루트 키가 콘솔 서명 키를 위임 서명하고, PC는 루트 공개키만 고정한다. 시연에서는 키 1개로 단순화.

**PC 검증 순서** (하나라도 실패하면 적용하지 않고 쓰던 정책 유지 + 사유 보고)

| 순서 | 확인 | 실패 사유 코드 |
|---|---|---|
| 1 | `payloadType` 이 맞는가 | `bad_type` |
| 2 | 신뢰하는 `keyid` 의 서명이 PAE 바이트와 맞는가 | `bad_signature` |
| 3 | `schema` 를 아는가 | `unsupported_schema` |
| 4 | `org` 가 내 조직인가 | `wrong_org` |
| 5 | `version` 이 마지막 정상본보다 큰가 | `rollback` |
| 6 | `expires_at` 이 지나지 않았는가 | `expired` |
| 7 | `model.sha256` 이 설치된 모델과 같은가 | `model_mismatch` |

통과하면 `SlmDetector.set_policy(rules)` 로 적용하고 `{org, version, bundle 해시}` 를 마지막 정상본으로 저장한다.

## 5. 모델 파일

모델(약 150MB)은 정책과 따로 배포한다. 같은 키로 서명한 작은 매니페스트(`{name, version, sha256, url}`, 같은 DSSE 봉투, payloadType `application/vnd.piiguard.model+json`)를 함께 두고, PC는 내려받은 파일 해시가 매니페스트와 같을 때만 설치한다. 정책의 `model.sha256` 이 이 해시를 가리킨다.

## 6. API (백엔드)

| 메서드 | 경로 | 하는 일 |
|---|---|---|
| `POST` | `/policy/publish` | 콘솔이 호출. 변경 목록을 받아 payload 생성 → version+1 → 서명 → 저장. 응답 `{version, keyid, bundle_sha256}` |
| `GET` | `/policy/latest` | PC가 5분마다 호출. `ETag: <bundle_sha256>`, 바뀌지 않았으면 304 |
| `GET` | `/policy/{version}` | 특정 버전(감사·재현용) |
| `POST` | `/policy/ack` | PC 결과 보고 `{device_id, version, status: applied\|rejected, reason}` |

## 7. 역할 나누기

| 누가 | 할 일 |
|---|---|
| **백엔드** | 6절 API 4개, 서명 키 보관·서명, 번들·이력 저장, ack 집계 |
| **PC 에이전트(SLM 쪽)** | 5분 주기 받아오기, 4절 검증, `set_policy` 적용, 마지막 정상본·버전 저장, ack 보고 |
| **콘솔(우리)** | 정책 편집 화면을 3절 필드에 맞추기(규칙 label 15자·description 40자 입력 제한), "서명 후 배포" → `/policy/publish`, 버전·키 ID·PC 적용 현황(적용 n대·거부 n대와 사유) 표시 |

## 8. 아직 정할 것

1. `dict`·`exclude` 해시 매칭을 PC에서 언제 지원할지(지원 전엔 빈 배열)
2. `expires_at` 기본 기간(제안 30일)
3. 해커톤 시연에서 배포 서버를 백엔드 FastAPI 에 붙일지, 별도 작은 서버로 할지
