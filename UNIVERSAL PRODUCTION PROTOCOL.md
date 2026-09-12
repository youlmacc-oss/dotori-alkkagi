# UNIVERSAL PRODUCTION PROTOCOL (dotori-alkkagi)

`ALL-IN-ONE PRODUCTION PROTOCOL.md`와 **동일 계열**이다. 한쪽만 고치지 않는다. 제품 근거는 `PRD.md`, `ARCHITECTURE.md`, `UI_PROMPTS.md`.

타 프로젝트 Purge: 이미지 스튜디오, 썸네일 잘림, 대기열 카드, 3단 합성기, `showSaveFilePicker`, 이모티콘/내PC 소스 탭.

---

## 재구축

빈 PC에서는 네 MD만 연다.

1. Node 20 → `ARCHITECTURE.md` 스택·스크립트·파일 트리·상수·식·키.
2. `UI_PROMPTS.md`로 `index.html`과 HUD. 1:1·초대 DOM은 hidden. `?v=20260912f`.
3. `PRD.md` 잠금: 1인+AI, 세션 도토리, 이력 비삭제, 저장 진형, 카메라 턴, 같은 색 붙임, AI 클러스터 도주.
4. `SameColorBond.js` + `AIBot.js` 식은 `ARCHITECTURE` §5·§8을 그대로.
5. 가이드북 7장 + 점검 26행은 `UI_PROMPTS` / `ARCHITECTURE` §14.
6. `npm test` 100% (41파일 / 305) + `npm run test:loop` exit 0이면 본판 재현.
7. 호스팅 GitHub Pages (`GITHUB_PAGES=1`, `base /dotori-alkkagi/`). 본판 동결.

네 문서에 없는 기능은 추가하지 않는다.

---

## Step 0 (불변)

수정 전 `node_modules/.vite` 삭제. `vite --force`. `index.html` no-cache + `?v=`. 상세는 ALL-IN-ONE §1.

---

## 모드

- **VISUAL**: Zero-Layout-Shift → 수정 → `npm run test:loop` 1회 → 비프 → `[1]/[2]` 대기.
- **LOGIC**: 테스트 → `npm test` 최대 5회 100% → 비프 → `[1]/[2]` 대기.
- 혼합: LOGIC 먼저. 레이아웃이 바뀌면 VISUAL.

Git은 승인 전 금지.

---

## 이 게임 잠금

- 1인 + AI만. 1:1 UI hidden.
- 접속이력 키 `dotori-alkkagi:visit-log` 삭제 금지.
- 저장 진형을 일자로 덮지 않는다 (적용·입장·재대전).
- 빈 판 탭 = 시계 +45°. 왼쪽 턴만 반시계.
- 이력 패널은 설정 랩 오버레이. 도크 높이 불변.
- 같은 색 붙임은 RESOLVING만. AI는 흑 클러스터를 때리지 않고 판 안으로 달아난다.
- ROI 밖 오염 0.00%.

---

## VISUAL 고정 문구

> 🎧 [BEEP!] 1회 수정 및 화면 캡처(`public/test-result.png`)가 완료되었습니다. 브라우저 화면(또는 캡처 이미지)을 확인해 주세요.
>
> **[1: 승인 및 종료] / [2: 추가 수정 필요]** 중 선택해 주세요.

배포는 사용자가 백업 및 배포를 요청한 뒤에만 `main` 푸시.
