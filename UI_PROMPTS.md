# [UI_PROMPTS] 도토리 알까기 화면 규격

이 문서만으로 HUD·대기실·설정을 다시 짤 수 있어야 한다. 규칙은 `PRD.md`, 모듈은 `ARCHITECTURE.md`. **Zero-Layout-Shift**: 기존 컨테이너·버튼은 1px도 바꾸지 않는다.

`index.html`은 인라인 HUD CSS + `/src/style.css?v=` + `/src/main.js?v=`. 본판 버전 문자열: **`20260912f`**. 배포 후 캐시를 깨려면 `?v=`만 올린다.

## 1. 셸

```
html lang=ko
  head: charset UTF-8
        viewport width=device-width, initial-scale=1, viewport-fit=cover,
                 interactive-widget=resizes-content, user-scalable=no
        theme-color #1b0e0c
        Cache-Control / Pragma / Expires no-cache
        title 도토리 알까기
        og:title 도토리 알까기 대전 초대
        og:description 도토리 알까기 한판 승부! 링크를 눌러 입장하세요.
        link /src/style.css?v=
  body
    #table
      #stage-slot
        #stage
          #board (canvas)
          HUD / 모달 / 로비
    script type=module /src/main.js?v=
```

- `#table` fixed 100% × 100svh, safe-area padding, flex 가운데, 배경 radial `#4a2a18 → #1a0c0a → #070304`.
- `#stage-slot` / `#stage` max-width **540px**, 높이 100%. `#board` 전면.
- body `#0f0705` / rosewood `#140908`. user-select none, touch-action none.

### 토큰

```
--walnut #2C1B14
--rosewood #140908
--kaya #E8C382 / #e9c587
--gold #FFD13B
--amber #C87A38
--champagne #ffe082
--hud-gold #f4c06e
--hud-dark rgba(22, 13, 10, 0.88)
--hud-border rgba(244, 192, 110, 0.35)
--hud-top-h 56px
--hud-bottom-h 64px
--stage-w 720px
--stage-h 1280px
```

폰트: Apple SD Gothic Neo / Noto Sans KR.

본판 `public/assets/` 디렉터리는 없다. 알·판은 Three가 생성한다. 배경 파일 업로더 DOM(`#bg-match-file` 등)을 만들지 않는다.

## 2. 대기실 `#lobby-users`

기본 접속 시 연다. `#lobby-overlay` + `#lobby-panel`.

```
header.lobby-header
  #lobby-book-open.lobby-title  "도토리 알까기"  + #user-count[hidden]
  #lobby-settings.lobby-close   ⚙️
  #lobby-close.lobby-close      ✕ (게임종료)
#lobby-modes
  #lobby-mode-solo[data-mode=solo]     1인
  #lobby-mode-ai[data-mode=ai].is-on   AI
  #lobby-mode-pvp[data-mode=pvp][hidden] 1:1
.lobby-nick
  label 닉네임
  #lobby-nick-input maxlength=5
  #lobby-nick-save 저장
  #lobby-nick-hint 닉네임은 5글자 이내
  #lobby-location-guide  1인 연습 · AI 대국
#lobby-book-bar
  #lobby-book-bar-guide 가이드북
  #lobby-book-bar-clinic 점검
#lobby-list                    (동적 .lobby-room)
footer.lobby-footer
  #lobby-exit 게임종료
```

모드 버튼 `.lobby-mode-btn` 높이 36, radius 18, flex 1:1, 금 그라데이션.

```
border 1px #f0c57a
background linear-gradient(180deg, #fffdf6, #ffe7b0 46%, #f3c56a)
color #6a3a12
box-shadow inset 0 2px 0 #fff, 0 3px 0 #c48a32, 0 6px 10px rgba(140,70,16,.22)
.is-on: #fff4b8 → #ffcc55 → #ff9d1a, color #4a2208
```

**숨김(제품)**: `#lobby-mode-pvp`, `#pvp-guide-pick`, `#invite-share-sheet`, `#invite-nick-modal`, `#lobby-invite-modal`, `#invite-only-notice`, `#invite-copy`. 열지 않는다.

### 가이드북 `#lobby-book`

탭 안내/점검. `#lobby-book-body`. 이전/점/다음. 도크: 스킵 체크 `다음 접속시에는 이 창을 띄우지 않음`, `바로시작`, `튜토리얼 시작`.

7장 카피(`GUIDE_PAGES`)는 아래와 **글자 단위로 동일**해야 한다. 키: `dotori-alkkagi-book-seen`(session), `dotori-alkkagi-book-skip`(local). `BOOK_SKIP_LABEL` / `BOOK_PLAY_LABEL` 위와 같음. `shouldOfferInviteOnlyNotice`는 항상 false.

| id | kicker | title | visual | lead |
| --- | --- | --- | --- | --- |
| cover | 대기실 | 도토리 알까기 | cover | 원목 판 위에서 알을 당기고 튕깁니다. |
| pull | 손맛 | 뒤로 당기고 놓기 | sling | 내 알을 잡아 반대 방향으로 당긴 뒤 손을 뗍니다. |
| modes | 방 만들기 | 두 가지 대전 | modes | 대기실에서 고른 모드가 곧 방입니다. |
| ready | 시작 전 | 바둑돌을 다시 놓기 | ready | 대전방에 들어오면 5초 동안 재배치를 묻습니다. |
| acorn | 선공 · 도토리 | 호스트가 먼저 | acorn | 선공은 호스트(흑). 도토리는 접속마다 10개, AI 대전만 승 +1 / 패 −1. |
| fall | 승패 | 장외가 곧 승부 | fall | 한 쪽 돌이 모두 판 밖으로 나가면 끝입니다. |
| sound | 설정 | 소리·액션캠·재배치 | sound | ⚙️에서 음량·판 색·감도·액션캠·시작 전 재배치·이력을 맞춥니다. |

points:
- cover: 1인 연습 / AI 대국 / 시작 전 3·5·7·9알과 일자·쐐기·방어를 고릅니다 / 바로시작은 시작 화면 · 다음 접속 숨김 가능
- pull: 바둑돌 위로는 당길 수 없습니다 / 가까이 붙은 돌 축은 당길 수 없습니다 / 같은 색이 붙어 있으면 약한 충격으로는 갈라지지 않습니다 / 정면으로 세게 쳐야 붙임이 풀립니다 / POWER가 찰수록 더 멀리 날아갑니다 / 15초 안에 쏘지 않으면 턴이 넘어갑니다
- modes: 1인: 흑·백 모두 나 · 호스트(흑)가 먼저 / AI: 위는 봇, 아래는 나 / AI는 상대 알이 붙거나 5mm 안이면 때리지 않고 판 안으로 달아납니다 / 다시하기는 같은 모드로 한 판 더
- ready: 시작 전 같은 줄에서 3알·5알·7알·9알과 일자형·쐐기형·방어형을 고릅니다 / 고르면 본판이 바로 바뀌고 저장 진형에 남습니다 / 예를 누르면 10초 동안 첫째 선 안에서 자기 진영 돌을 옮깁니다 / 10부터 1까지 내려가며 셉니다 / 아니오·무응답이면 시작 버튼을 기다립니다 / ⚙️에서 재배치를 끄면 시작 버튼이 바로 나옵니다
- acorn: 1인은 호스트(흑)가 먼저입니다 / AI는 내가 흑·선공입니다 / 1인 연습은 도토리를 건드리지 않습니다 / AI 대전만 ±1 정산합니다 / 창을 닫으면 도토리는 다시 10개입니다
- fall: 장외는 격자선이 아니라 나무판 끝입니다 / 장외 알은 판 밖 액션캠으로 따라갑니다 / ⚙️에서 액션캠을 끄면 클로즈업이 없습니다 / 마지막 알은 액션캠 뒤 한 박자 쉬고 결과 / 기권은 바로 승부가 갈립니다
- sound: 액션캠을 끄면 장외 클로즈업이 없습니다 / 재배치를 끄면 시작 버튼이 바로 나옵니다 / 조준선 켜기·끄기와 색은 ⚙️에서 맞춥니다 / 이력은 조회만 하고 앱이 지우지 않습니다 / 왼쪽 턴은 반시계, 오른쪽과 빈 판 탭은 시계 +45° / 대국 중에는 설정을 적용할 수 없습니다 / 첫 터치로 소리가 열립니다 / 모바일은 세로로 잡는 것이 기준입니다 / 다음 접속시 이 창을 숨길 수 있습니다

커버·당김 본문에 `[data-tutorial-start] 튜토리얼 시작`.

점검 리드: `물리 · 붙임 · AI 도주 · 알 수·진형 · 이력 · 턴 · 조준선 · 설정`. `1:1 참가 배제` 문구 금지.

26행 라벨: 물리 엔진 / 3D 판 / 사운드 / 탭 세션 / 새로고침 유지 / 1인 / AI / 1인 · AI만 / 닉 · 내닉네임 / 가이드 바로시작 / 선공 규칙 / 도토리 정산 / 기권 정산 없음 / 결과 한 박자 / 액션캠 / 시작 전 재배치 / 당김 금지 / 혼자 두기 / 시작 게이트 / 기권 · 대기방 / 환경설정 / 혼자 두기 / 같은 색 붙임 / AI 클러스터 도주 / 알 수 · 진형 / 접속 이력 / 보기 회전 · 턴.

### 튜토리얼 `#tutorial-coach`

카드: 키커 `튜토리얼`, `#tutorial-title`, `#tutorial-text`, `#tutorial-skip` 건너뛰기, `#tutorial-finish` 가이드로(완료 시).

1. 알 잡기 — 아래쪽 검은 알을 손가락으로 누르세요.
2. 당기기 — 잡은 채로 화면 아래쪽으로 당기세요. 다른 돌 위로는 당기지 않습니다.
3. 발사 — 손을 떼면 알이 날아갑니다.
4. 완료 — 잘하셨습니다. 가이드로 돌아가 1인 연습 또는 AI 대국을 고르면 됩니다.

## 3. 대전 HUD — 상단

`.hud-top` absolute, top `max(16px, safe-area)`, left `var(--board-left,12px)`, width `var(--board-width)`, height 52, z-index 20. 자식만 pointer-events.

- `#acorn-wallet` 높이 46 radius 23. `🌰` + `#acorn-count` 기본 10.
- `#seat-name-white.seat-name-far` 가로 중앙(상대).
- `#seat-name-black.seat-name-near` 판 아래쪽(나).
- `#match-timer` 높이 46 min-width 110 radius 23. SVG viewBox 0 0 120 46, rect pathLength 100. `.is-urgent` stroke `#ff5252`. `#match-badge` `흑 턴 15`.
- `#hud-mode`, `#settings-btn` **display:none**. 설정은 `#lobby-settings`만.

## 4. 대전 HUD — 하단 (레이아웃 고정)

`.hud-bottom-zone` = 턴 FAB + `.floating-buttons` + POWER + 티커.

### 4-1. `.floating-buttons` (flex, 밀면 안 됨)

같은 줄 높이 **50px**:

| id | 크기 | 라벨 |
| --- | --- | --- |
| `#surrender-btn` | 50×50 flex 0 0 50 | 기권 |
| `#lobby-leave` | 50×50 | 대기방 |
| `#guide-btn` | 50×50 | 🎯 + ON/OFF. 기본 is-on |
| `#play-count-3` … `#play-count-9` | 높이 50, 가로는 28(24–32). `data-play-count` | 3알·5알·7알·9알. 시작 전만 |
| `#play-formation-line` | 높이 50, `data-play-shape=line` | 일자형. 시작 전만 |
| `#play-formation-wedge` | `wedge` | 쐐기형 |
| `#play-formation-defense` | `defense` | 방어형 |

기권·대기방·조준선 **50×50 불변**. 알 수 4개와 진형 3개는 awaitingStart+solo/ai에서만 보이고 시작 후 hidden. 조준선 오른쪽, **같은 줄** 순서: 3알→5알→7알→9알→일자형→쐐기형→방어형.

칩 CSS(인라인 HUD):
- `.play-formation-btn` 기본 50×50, radius 7, font 11/900.
- `.play-count-btn` `flex 0 1 28px; width 28; min 24; max 32; font 10`.
- 칩이 보일 때 `.floating-buttons` gap 4, max-width `calc(100% - 8px)`.
- 그때 진형 칩은 `flex 0 1 40px; min 28; max 50; font 10`.
- `.is-on` 배경 `#f4c06e`. `[hidden]` `display:none !important`. 로비/설정은 visibility hidden.
- `?v=20260912f`.

### 4-2. 턴 FAB (flex 밖 absolute)

`#board-spin-ccw.is-ccw` 왼쪽, `#board-spin-btn` 오른쪽. 50×50 radius 25, 라벨 `턴`. 로비·설정 `display:none`. 조준선 줄과 겹치지 않게 좌우 바깥.

### 4-3. POWER

`.power-slot` 높이 50, 스테이지 가로 중앙(`--board-cx`). 라벨 `POWER`. `#power-fill` scaleX(0..1). >0.02 `.is-charged`, ≥0.7 `.is-hot`.

### 4-4. 티커

`#ticker-billboard-text` 기본 `READY: 바둑알을 뒤로 당겨 튕겨내세요!`

## 5. 게이트·토스트·결과·종료

`#match-start-gate` 판 중앙.

- `#ready-ask-box`: `바둑돌을 재배치 하시겠습니까?` `#ready-ask-yes` 예 / `#ready-ask-no` 아니오. 한 줄.
- `#match-start` 시작. `--board-cx` 가로 중앙, 활성일 때 enabled.
- `#pvp-start-hint` HTML 기본 문구가 남아도 제품은 `FIRST_HINT`를 쓴다: `호스트(흑)가 먼저입니다. 선공이 시작 버튼을 누릅니다.`
- `#invite-copy` hidden.

`#pull-block-toast` 기본 `붙어 있는 돌 방향으로는 당길 수 없습니다.`

`#result-modal` `.result-sheet`: `#result-title` 기본 `승리!`, `#result-sub`, `#result-again` `🌰한 판 더`, `#result-exit` `대기실`. 제목/부제는 `PRD` §8.

`#game-exit-screen`: `게임이 종료되었습니다` / `창을 닫아 주세요`.

관전 DOM(`#spectator-badge`, `#spectate-bar`, `#seat-watchers`)은 있어도 제품 1인/AI가 열지 않는다.

## 6. 설정 `#settings-modal`

스테이지를 덮음. 헤더 ~52: `#settings-close` ✕ / `설정` / `#settings-apply` 저장.

### 톤 `#board-tone-panel`

칩 `#board-color-chips`: kaya `#f1bf70`, ebony `#3A2B20`, jade `#2A4849`, maple `#DFD3C3`. `#board-color-reset` 기본값.

슬라이더: `#board-hue` −40..40, `#board-bright` 65..135, `#settings-volume` 0..100 기본 80, `#settings-mute` 소리.

### `.settings-lab` (도크를 키우지 않음)

- `#settings-action-cam` 액션캠 사용여부 (기본 checked)
- `#settings-rearrange-ask` 게임시작전 재배치 사용여부 (기본 checked)
- `#settings-power-ratio` 발사 감도 1.0–6.0 step 0.1 기본 3.8. [−] range [+] `3.8x`
- 캡션 `설정 바둑판 · 진형 미리보기 · 돌을 당겨 발사 테스트`
- `#formation-preview` 360×360. 랩 최소 가시 높이 ≥220 (`test:loop`)
- `#formation-status` `진형을 고르면 이 판에 바로 보입니다`
- `#visit-log-panel` **absolute 오버레이** (랩·도크 높이 불변)
  - `#visit-log-query` search maxlength 12, placeholder `닉·아이디 검색`
  - `#visit-log-count` `0명`
  - `#visit-log-close` 닫기
  - `#visit-log-list`
  - `.visit-log-keep` `이 기록은 재배포 뒤에도 지우지 않습니다`
  - **삭제 버튼 없음**

### `.settings-dock` 줄 높이 28 (뷰포트 높이 ≤740이면 26). 라벨 flex 0 0 40px.

| 라벨 | 내용 |
| --- | --- |
| 대전 | `#mode-tabs` 1인 / AI 연습.is-on / **1:1 대전 hidden** |
| 난이도 | `#ai-diff-chips` 초급 / 중급 / 고급.is-on |
| 돌 수 | 3알 / 5알.is-on / 7알 / 9알 |
| 진형 | `#formation-shapes` (3알: 일자 쐐기 종대 / 그 외: 일자 쐐기 방어) |
| 배치 | 프리셋.is-on / 직접 놓기 / 내 진형 |
| 조작 | `#settings-guide` 조준선 사용중 · `#formation-save` 진형 저장 · `#formation-load` 진형 열기 · `#visit-log-open` **이력** |
| 조준선 | 스와치 + `#ffcc00` `#7cff6b` `#4de4ff` `#ff6b9a` `#fff4cc` + `#guide-color-pick` + `#guide-color-reset` 기본 |

조작 네 버튼 한 줄 gap 4. 이력을 넣어도 도크 높이를 키우지 않는다.

대국 시작 후 저장 → `대국 중에는 적용할 수 없습니다`. 미리보기·이력은 가능.

짧은 화면 `@media (max-height: 740px)`: 바 46, 도크 패딩 축소, 칩 26/11px.

## 7. 3D 보기

쿼터뷰 원목. 알은 납작한 구(Y 0.46), 시각 1.14. 흑 아래 / 백 위. 조준선은 당김 반대. 폰은 `AIM_GUIDE_VISUAL`로 선 길이 축소. `viewYaw`만 회전 — 픽은 Matter. 액션캠 on이면 장외 클로즈업.

판이 `#table` 밖이면 실패. `test:loop` NDC spanX≥1.55, spanY≥0.40.

## 8. 고정 카피

도토리 알까기 / 1인 / AI / 기권 / 대기방 / 조준선 / 3알 / 5알 / 7알 / 9알 / 일자형 / 쐐기형 / 방어형 / 턴 / 시작 / 한 판 더 / 대기실 / 설정 / 저장 / 이력 / 진형 저장 / 진형 열기 / 가이드북 / 점검 / 바로시작 / 튜토리얼 시작 / 게임종료 / 닉네임은 5글자 이내 / 1인 연습 · AI 대국 / 다음 접속시에는 이 창을 띄우지 않음.

## 9. 캡처

`npm run test:loop` 1회. 393×852, 360×780, 412×1014, 1280×720. `?loop=1`. `public/test-result.png`. 설정 도크에 **이력**.

금지: 이미지 스튜디오, 썸네일 대기열, 3단 합성기, `showSaveFilePicker`, `checkerboard-bg`.
