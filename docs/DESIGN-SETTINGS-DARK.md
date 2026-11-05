디자인 설정 (다크)

스타일: 어두운 바탕 위에 아웃라인으로 경계를 만드는 구성. 다크 모드 기준이며 라이트 모드는 두지 않는다. 떠 있는 표면만 한 단계 밝게 띄우고, 그림자는 보조로만 쓴다.
색: 거의 검정(#131416) 바탕의 무채색 구성. 강조색은 앰버(#F6A623) 하나이고, **"지금 처리할 곳"에만** 쓴다. 빨강·초록·노랑은 오류·성공·경고 상태에만 쓴다.
글꼴: Pretendard를 전제로 하고, 자간을 줄여 쓴다.
아이콘: 되도록 쓰지 않고 글자로 전달한다.

1. 색
원색 (Primitives)
gray는 #131416에서 #F1F1F3까지 아주 약하게 푸른 기를 띤 무채색 단계다. amber는 강조색, red·green은 상태색이다.

토큰	값	토큰	값
gray/950	#131416	amber/500	#F6A623
gray/900	#1B1C20	amber/300	#FFC55C
gray/850	#212227	amber/a14	rgba(246,166,35,.14)
gray/800	#222327	red/300	#FF8A80
gray/750	#2A2B30	red/a13	rgba(255,107,107,.13)
gray/700	#2B2C31	green/300	#5BD38A
gray/650	#303137	green/a12	rgba(91,211,138,.12)
gray/600	#33343A
gray/500	#4A4C54
gray/400	#6F727C
gray/350	#8A8D96
gray/300	#A7A9B1
gray/200	#C9CBD2
gray/50	#F1F1F3
amber/ink	#1A1000

의미 토큰 (Semantic, 모드 Dark)
토큰	원색	값	용도
bg/canvas	gray/950	#131416	화면 배경
bg/surface	gray/900	#1B1C20	카드·패널·트레이 표면
bg/raised	gray/850	#212227	대화상자·시연 안내처럼 화면 위에 떠 있는 표면
bg/subtle	gray/800	#222327	카드 안 타일, 보조 버튼 면, hover 배경
bg/selected	gray/700	#2B2C31	선택된 메뉴·탭 (앰버를 쓰지 않는 선택)
bg/neutral	gray/750	#2A2B30	중립 배지, 보조 버튼 hover
bg/primary	amber/500	#F6A623	지금 처리할 곳의 주요 버튼, 진행 점, 토스트
bg/primary-pressed	amber/300	#FFC55C	주요 버튼 hover·pressed
bg/danger-subtle	red/a13	rgba(255,107,107,.13)	오류·원문 노출 배경
bg/success-subtle	green/a12	rgba(91,211,138,.12)	성공 배경
bg/warning-subtle	amber/a14	rgba(246,166,35,.14)	경고·대기 배경, 처리할 건수 배지
text/primary	gray/50	#F1F1F3	제목·본문
text/secondary	gray/300	#A7A9B1	설명
text/tertiary	gray/350	#8A8D96	캡션, placeholder
text/disabled	gray/400	#6F727C	비활성, 아직 오지 않은 단계
text/on-primary	amber/ink	#1A1000	앰버 면 위 글자
text/link	gray/50	#F1F1F3	링크. 본문과 색이 같으므로 밑줄로 구분한다
text/accent	amber/500	#F6A623	지금 단계 이름, 고른 노드 라벨
text/danger	red/300	#FF8A80	오류 글자, 원문 전송 숫자
text/success	green/300	#5BD38A	성공 글자, 배포 효과 숫자
text/warning	amber/300	#FFC55C	경고 글자, "사유 대기 중"
border/default	gray/650	#303137	표면·구획 아웃라인, 구분선
border/strong	gray/500	#4A4C54	조작 요소 아웃라인, 떠 있는 표면 테두리
border/focus	amber/500	#F6A623	포커스·지금 단계·고른 항목
border/danger	red/300	#FF8A80	오류
border/disabled	gray/600	#33343A	비활성 조작 요소, 점선 노드
icon/default	gray/300	#A7A9B1	기본 아이콘
icon/primary	gray/50	#F1F1F3	강조 아이콘
icon/disabled	gray/400	#6F727C	비활성 아이콘
dot	—	#25262A	흐름도 바탕의 점 격자

앰버 사용 원칙
- 앰버는 한 화면에서 "지금 처리할 한 곳"으로 시선을 모으는 데만 쓴다. 고른 노드, 지금 단계, 주요 버튼 하나, 진행 점, 처리 토스트.
- 메뉴·탭 선택, 켜짐 스위치, 지표 막대처럼 "지금 할 일"이 아닌 것에는 쓰지 않는다. 이런 선택은 bg/selected 회색으로 표시한다.
- 고른 노드는 통째로 칠하지 않는다. 어두운 바탕에 앰버 테두리와 은은한 빛(아래 그림자 참고)만 준다.
그라데이션은 고른 노드의 바탕(#26221A → #1F1E1C) 한 곳에만 쓴다.

2. 글자
글꼴은 Pretendard를 전제로 한다. 코드만 JetBrains Mono를 쓴다. Light 굵기는 쓰지 않는다.

Pretendard는 항상 자간을 줄여 쓴다. 기본 자간(0)으로 두지 않으며, 새 스타일을 만들 때도 20px 이상은 -2.5% 이하, 그보다 작으면 -2%를 적용한다.

스타일	글꼴·굵기	크기/줄 높이	자간	용도
title/32	Pretendard Bold	32/40	-3%	카드 제목, 요약 숫자
title/24	Pretendard SemiBold	24/32	-2.5%	패널·대화상자 제목, 흐름도 노드 숫자
heading/20	Pretendard SemiBold	20/28	-2.5%	섹션 제목, 대기열 제목, Field·kv 라벨, 빈 상태 제목
body/16	Pretendard Medium	16/24	-2%	본문, 목록 항목, 버튼
body/16-regular	Pretendard Regular	16/24	-2%	카드 설명, 입력값, 직원 사유 인용
label/14	Pretendard Medium	14/20	-2%	설명, 안내, 메뉴, 칩, 단계 이름
caption/12	Pretendard Regular	12/16	-2%	캡션, 단계 보조 설명
badge/11	Pretendard Medium	11/14	-2%	배지
code/12	JetBrains Mono Medium	12/18	-2%	코드, 명령, JSON, 콘솔 출력
한 단계씩 줄이지 않고, 제목과 본문 사이를 2배 가까이 띄운다.
코드 스타일은 코드에만 쓴다. 사용자에게 설명하는 오류 안내는 일반 글자 스타일을 쓴다.
숫자가 열로 정렬되는 곳(건수, 비율)은 tabular-nums를 쓴다.

3. 치수
분류	값
간격	space/4, 8, 12, 16, 20, 24, 32, 64
모서리	radius/sm 4, radius/md 16, radius/lg 28, radius/full 99
컨트롤 높이	size/control-sm 40, size/control-md 48
모서리 사용처는 다음과 같다.

radius/lg: Card, Dialog, Checklist item
radius/md: Code block, Inline hint, 흐름도 노드, 목록 카드, 인용 타일
radius/sm: 본문 안 강조(mark)
radius/full: Button, Input, Select, Chip, Badge, Toast, Switch, Nav item, Tab

4. 그림자
경계는 아웃라인이 만들고, 그림자는 보조로만 쓴다. 다크 바탕에서는 그림자가 잘 보이지 않으므로 떠 있는 표면은 bg/raised로 한 단계 밝히는 것이 먼저다.

스타일	값	용도
elevation/raised	0 12px 32px rgba(0,0,0,.45)	대화상자, 시연 안내, 토스트, 메뉴
elevation/node	0 10px 24px rgba(0,0,0,.28)	흐름도 노드
glow/focus	0 0 0 4px rgba(246,166,35,.14)	고른 노드, 지금 단계 점
elevation/inset	inset 0 1px 6px rgba(0,0,0,.4)	눌린 버튼
카드와 카드 안 항목에는 그림자를 넣지 않는다.

5. 아웃라인
경계는 아웃라인으로 만든다. 표면 색 차이나 그림자에 기대지 않는다. 선은 안쪽 정렬이다.

경우	값	대상
표면	border/default 1px	Card, 패널, 트레이, 목록 카드, 흐름도 노드
떠 있는 표면	border/strong 1px	Dialog, 시연 안내, 메뉴
구획	border/default 1px	카드 안 타일, Code block, Checklist item
구분선	border/default 1px	표 행 사이, 나란히 붙은 면 사이
조작	border/strong 1px	Input, Select, secondary 버튼, Chip, Segmented, Checkbox, Switch
포커스	border/focus 2px	Input, Select, Search field
선택	border/focus 1px + glow/focus	고른 노드, 고른 목록 항목, 지금 단계
선택(앰버 아님)	bg/selected 면 + border/strong 1px	선택된 탭
오류	border/danger 1px	Input 오류
비활성	border/disabled 1px	비활성 secondary 버튼, 처리할 게 없는 노드(점선)
ghost 버튼, Icon button, Nav item은 평소 아웃라인 없이 hover 배경으로 표시한다.
주색 면(primary 버튼, 토스트)과 tone 색 면(Badge, Inline hint)은 면 자체로 구분되므로 아웃라인을 넣지 않는다.

6. 카드 높이와 스크롤
화면 자체는 스크롤하지 않고, 카드 안에서 스크롤한다.
데이터가 적어도 카드는 높이를 채운다. 내용에 맞춰 줄이지 않는다.
높이를 채우는 카드는 content 영역도 채우고 그 안에서 세로 스크롤한다. 제목 줄은 고정된다.
패널·트레이는 body 영역만 스크롤한다.
높이가 800px 이하인 화면에서는 트레이 머리·단계 바 간격을 한 단계씩 줄여 주요 버튼이 첫 화면 안에 들어오게 한다.
폭 860px 이하에서는 화면 스크롤을 허용하고 카드를 세로로 쌓는다.

7. 여백
위치	값
화면 바깥	16
카드 사이, 카드↔패널	24
카드 안쪽	32
카드 제목 줄↔본문	32
카드 제목↔설명	8
카드 안 섹션 사이	64
덩어리 사이	32
섹션 제목(heading/20)↔내용	12
목록 항목 사이	8
kv 라벨↔값	8
좁은 표면(패널·대화상자) 안쪽	24
좁은 표면 제목 아래	12
제목부터 다음 제목 전까지가 한 덩어리다. 표 행, 체크리스트, 설정 줄처럼 한 목록의 항목들은 하나의 덩어리로 본다.

8. 컴포넌트
버튼과 선택
컴포넌트	규격	상태별 값
Button	높이 48, 여백 12/20, radius/full, body/16	아래 표
Icon button	40×40, radius/full. 글자로 대신하기 어려울 때만 쓴다	hover bg/subtle
Chip	높이 40, 좌우 16, label/14	기본 bg/surface + border/strong, hover bg/subtle, 선택 bg/selected + border/strong
Segmented	여백 4, 간격 4, bg/subtle + border/strong	선택지 2~3개
Segment	높이 40, 좌우 16, label/14	선택 bg/surface + border/focus 2px + text/primary
Switch	44×24 고정, 여백 2	끔 트랙 #26272C + border/strong, 손잡이 gray/400. 켬 트랙 gray/200, 손잡이 gray/950. 상태색·앰버를 쓰지 않는다
Checkbox·Radio	20×20, 간격 12	켬 amber/500 (accent-color)
Nav item	높이 40, 좌우 16, label/14	hover bg/subtle, 선택 bg/selected + text/primary
Tab	높이 40, 좌우 16, label/14	선택 bg/selected + border/strong 1px. 탭 안 건수 배지는 그대로 둔다
Button	default	hover	pressed	disabled
primary	bg/primary, text/on-primary	bg/primary-pressed	bg/primary-pressed + inset	bg/subtle, text/disabled
secondary	bg/subtle + border/strong, text/primary	bg/neutral + border/strong	bg/neutral + inset	bg/surface + border/disabled, text/disabled
ghost	채움 없음, text/secondary	bg/subtle, text/primary	bg/subtle + inset	채움 없음, text/disabled
한 화면에 primary 버튼은 하나만 둔다. 판단 버튼 3개(위반·예외 인정·오탐)처럼 동등한 선택지는 모두 secondary로 같은 크기에 둔다.

입력
컴포넌트	규격	상태별 값
Input	높이 48, 좌우 20, radius/full, body/16-regular	기본 bg/surface + border/strong, 포커스 border/focus 2px, 오류 bg/danger-subtle + border/danger + 안내 문구
Textarea	최소 높이 96, 여백 12/20, radius/md	Input과 같은 상태
Select	높이 48(표 안 40), 여백 왼쪽 20·오른쪽 44, bg/surface + border/strong, 화살표 16px 선 1.4 gray/300	포커스 border/focus 2px
Field	세로 간격 12	라벨 heading/20, 컨트롤, 안내 label/14

표면과 구조
컴포넌트	규격
Card	bg/surface, radius/lg, border/default, 안쪽 32, 간격 32, 제목 title/32, 설명 body/16-regular
Dialog	폭 520, 안쪽·간격 24, radius/lg, bg/raised, border/strong, elevation/raised, 제목 title/24. 바깥 덮개 rgba(0,0,0,.55)
Toast	높이 56, radius/full, bg/primary, text/on-primary, elevation/raised, body/16. 화면 아래 가운데. 되돌릴 수 있는 처리 뒤에는 오른쪽에 ghost "되돌리기" 버튼을 두고 6초간 보인다
Table row	머리 40(label/14, text/secondary), 행 56(body/16), 좌우 20, 간격 16. 행 사이 border/default 1px. 정보 표는 hover 없음
List card	여백 16/20, radius/md, border/default. hover bg/subtle, 선택 bg/neutral + border/focus 1px

흐름도(작업판)
컴포넌트	규격
Canvas	bg/surface 위 점 격자(dot, 1.2px 점, 20px 간격). 확대·축소·끌어서 이동. 축소된 캔버스 안에 핵심 글자를 넣지 않는다
Node	176×88, radius/md, bg/surface, border/default, elevation/node. 라벨 label/14 text/secondary → 숫자 title/24 → 보조 13px text/secondary
Node · 고른 노드	바탕 #26221A→#1F1E1C, border/focus, glow/focus. 라벨만 text/accent
Node · 처리할 게 없음	border/disabled 점선, 숫자 text/secondary
Node · 원문 전송	숫자 text/danger
Node 건수 배지	노드 오른쪽 위 원형 28, 14px Bold. 기본 bg/neutral, 고른 노드만 bg/primary + text/on-primary. 바깥 3px bg/canvas 테두리
Edge	주 경로 1.5px text/tertiary 실선, 갈래 1.5px text/disabled 점선(1 6), 위험 경로 2px text/danger, 순환(배포 대기) 2px amber 점선 흐름 애니메이션
Edge chip	높이 26, radius/full, bg/surface + border/disabled, 13px text/secondary
Tray	흐름도 아래 bg/surface, 위 테두리 border/default. 고른 노드 아래에서 선이 내려와 트레이 위 앰버 삼각 꼬리(30×15)에 닿는다. 노드를 바꾸면 꼬리가 0.45초 동안 미끄러진다
Tray · 지금 한 건	왼쪽 큰 칸. 제목 heading/20 + 진행 점(8px, 지금 점만 amber) + "1 / 2"
Tray · 다음	오른쪽 320 칸, List card 세로 목록. 대기 중인 건은 점선 + text/secondary

표시와 안내
컴포넌트	규격
Badge	높이 22, 여백 4/8, badge/11. 중립 bg/neutral + text/primary, 처리할 건수 bg/warning-subtle + text/warning, 위험 bg/danger-subtle + text/danger, 성공 bg/success-subtle + text/success. 색과 문구를 함께 쓴다
Inline hint	여백 10/14, radius/md, label/14. tone별 subtle 배경
Quote(직원 사유)	여백 12/16, radius/md, bg/subtle, body/16-regular
Mark(가린 원문)	여백 2/6, radius/sm, bg/danger-subtle + text/danger SemiBold
Code block	여백 12/16, 간격 8, radius/md, bg/subtle, border/default, code/12
Empty state	안쪽 32, 간격 16, 제목 heading/20, 설명 body/16-regular. 항상 다음 행동 하나를 제시
Step bar(건별 단계)	가로 한 줄, 단계당 최소 96. 점 24px 원 + 이름 label/14 + 보조 caption/12. 끝난 단계 gray/400 채움 + ✓, 지금 단계 border/focus 2px 원 + 가운데 8px amber 점 + glow/focus + 이름 text/accent SemiBold, 아직 안 온 단계 빈 원 border/strong + 이름 text/disabled. 연결선 2px, 지금 단계 뒤만 amber→gray 그라데이션
Spotlight(시연 안내 대상)	outline 2px border/focus, offset 4→8 맥박

아이콘
기본은 글자다. 메뉴, 버튼, 안내, 대화상자, 토스트에 아이콘을 넣지 않고 문구로 뜻을 전달한다.
체크 표시, Select 화살표, 닫기, 확대·축소(+ −)처럼 컨트롤 자체를 나타내는 표시만 예외로 쓴다.
쓸 때는 16px 전용과 24px 전용 두 계열만 쓴다. 24px 아이콘을 줄여 쓰지 않고, 같은 행에서 두 계열을 섞지 않는다.
선 아이콘이고 끝과 이음은 둥글게 처리한다. 선 굵기는 24px 1.6, 16px 1.4다.

9. 배치와 문구 규칙
배치
카드의 주요 작업은 제목 줄 오른쪽에 둔다. 본문을 읽은 뒤 실행하는 동작은 하단에 둘 수 있다.
카드 하단은 안내 문구 왼쪽, 버튼 오른쪽이다. 주요 버튼이 맨 오른쪽이고 왼쪽으로 갈수록 계층이 낮아진다.
버튼이 있는 배너는 문구 왼쪽, 버튼 오른쪽, 세로 가운데다.
짧은 카드는 [제목·본문 | 버튼] 한 행이다.
체크 상자·번호 같은 작은 앞 요소는 옆 글자 묶음의 세로 가운데에 둔다. 첫 줄에 맞추지 않는다.
입력 Field는 가로를 채우고, 스위치처럼 크기가 정해진 컨트롤은 고정한다.
탭은 Navigation 컴포넌트를, 생성 마법사는 Step과 연결선을 쓰고 이전·다음 버튼은 단계 줄에 둔다.
할 일 화면은 "흐름 속 위치 → 지금 한 건 → 판단 버튼" 순서로 읽히게 둔다. 지금 할 일과 흐름도의 위치는 선·꼬리로 시각적으로 잇는다.
설명형 문구(이 화면은 무엇인지)를 화면에 늘어놓지 않는다. 처음 보는 사람용 안내는 시연 안내처럼 따로 띄운다.

선택 컨트롤
버튼을 토글처럼 쓰지 않는다.

상황	컨트롤
적은 수의 짧은 단일 선택	Segmented
많거나 긴 선택지	Select + Menu
검색이 필요한 선택	Combobox
날짜	Date input + Picker
즉시 적용되는 켜기·끄기	Switch
여러 항목 선택, 동의	Checkbox
바꿀 수 없지만 읽기·복사가 필요한 값	Read-only
한 번에 끝나는 판단	같은 크기의 secondary 버튼 나란히 + 처리 뒤 "되돌리기" 토스트

표
10행을 넘을 수 있을 때만 페이지네이션을 넣는다.
정보만 보여 주는 표는 행 hover가 없다.
상세를 여는 행은 선택 상태와 hover를 함께 두고, hover 케이스는 선택된 행과 다른 행에 그린다.

문구
해요체를 쓴다. 메뉴는 한국어로 쓰고 버튼은 동사로 끝낸다.
쉬운 용어(원문, 오탐, 배포 등)를 지나치게 풀어 쓰지 않는다. 길게 풀면 오히려 읽히지 않는다.
브랜드명·픽토그램과 뜻이 겹치는 보조 문구는 넣지 않는다. 일반 부제와 설명을 금지하는 규칙은 아니다.
색만으로 상태를 전달하지 않고 문구를 함께 쓴다.
원문(개인정보)은 화면에 일부만 보여 준다(가림 표시).

작업 방식
공통 요소는 컴포넌트로 만들어 인스턴스로 배치하고, 화면별 차이는 속성으로 표현한다. 화면마다 프레임을 복제하지 않는다.
색·글자·간격은 변수와 스타일에 연결한다.
프로토타입은 사용자가 직접 만들므로 추가하지 않는다.
사용자가 후보정한 부분은 재검수하지 않고, 설명한 수정 내용을 그대로 믿는다.
사용자의 보정 방향은 지적한 화면뿐 아니라 대화상자·상태·흐름까지 모든 생성물에 적용한다.

10. 코드용 토큰
위 토큰을 CSS로 옮긴 것이다. 코드 프로젝트가 아니면 건너뛰면 된다.

:root {
  color-scheme: dark;

  /* 배경 */
  --bg-canvas: #131416;
  --bg-surface: #1B1C20;
  --bg-raised: #212227;
  --bg-subtle: #222327;
  --bg-selected: #2B2C31;
  --bg-neutral: #2A2B30;
  --bg-primary: #F6A623;
  --bg-primary-pressed: #FFC55C;
  --bg-danger-subtle: rgba(255, 107, 107, 0.13);
  --bg-success-subtle: rgba(91, 211, 138, 0.12);
  --bg-warning-subtle: rgba(246, 166, 35, 0.14);
  --bg-node-selected: linear-gradient(180deg, #26221A, #1F1E1C);
  --dot: #25262A;

  /* 글자 */
  --text-primary: #F1F1F3;
  --text-secondary: #A7A9B1;
  --text-tertiary: #8A8D96;
  --text-disabled: #6F727C;
  --text-on-primary: #1A1000;
  --text-link: #F1F1F3;
  --text-accent: #F6A623;
  --text-danger: #FF8A80;
  --text-success: #5BD38A;
  --text-warning: #FFC55C;

  /* 아웃라인 */
  --border-default: #303137;
  --border-strong: #4A4C54;
  --border-focus: #F6A623;
  --border-danger: #FF8A80;
  --border-disabled: #33343A;

  /* 아이콘 */
  --icon-default: #A7A9B1;
  --icon-primary: #F1F1F3;
  --icon-disabled: #6F727C;

  /* 모서리 */
  --radius-sm: 4px;
  --radius-md: 16px;
  --radius-lg: 28px;
  --radius-full: 99px;

  /* 그림자 */
  --elevation-raised: 0 12px 32px rgba(0, 0, 0, 0.45);
  --elevation-node: 0 10px 24px rgba(0, 0, 0, 0.28);
  --glow-focus: 0 0 0 4px rgba(246, 166, 35, 0.14);
  --elevation-inset: inset 0 1px 6px rgba(0, 0, 0, 0.4);

  /* 글꼴 */
  --font-ui: "Pretendard", -apple-system, system-ui, sans-serif;
  --font-code: "JetBrains Mono", ui-monospace, monospace;

  /* 자간 */
  --tracking-title-32: -0.03em;
  --tracking-title: -0.025em; /* title/24, heading/20 */
  --tracking-base: -0.02em;
}

/* 줄인 자간을 기본값으로 깐다 */
body {
  background: var(--bg-canvas);
  color: var(--text-primary);
  font-family: var(--font-ui);
  letter-spacing: var(--tracking-base);
}

a {
  color: var(--text-link);
  text-decoration: underline;
}

참고: 이 값은 이 레포의 보안팀 콘솔(`style.css`)에서 실제로 쓰는 값이다.
