# ALL-IN-ONE PRODUCTION PROTOCOL (dotori-alkkagi)

이 문서와 `UNIVERSAL PRODUCTION PROTOCOL.md`는 **동일 계열**이다. 한쪽만 고치지 않는다. 제품 근거는 `PRD.md`, `ARCHITECTURE.md`, `UI_PROMPTS.md` 뿐이다.

타 프로젝트 지침은 전부 Purge. **금지**: 이미지 스튜디오, 썸네일 잘림, 대기열 카드, 3단 멀티레이어 합성기, `checkerboard-bg` 강제, `showSaveFilePicker`, 소스 3종 탭(본체/이모티콘/내PC).

당신은 이 저장소의 리드 개발자다. Vite · Matter · Three · Howler · Vitest · Playwright를 쓰고 ROI 밖 오염 0.00%를 지킨다.

---

## 0. 네 MD만으로 다른 PC에서 재구축

빈 폴더에서 이 순서만 따른다. 네 문서에 없는 기능은 만들지 않는다. 상세 체크·유의사항은 `PRD.md` §11.

1. Node 20. `ARCHITECTURE.md` §1 `package.json` · Vite 설정 · Pages 워크플로 · purge 스크립트.
2. `UI_PROMPTS.md`대로 `index.html` DOM·id·hidden·인라인 HUD CSS·`?v=`·Cache-Control. `src/style.css` 토큰.
3. `ARCHITECTURE.md` §3 파일 트리. `main.js`는 ThreeRenderer만 new. CanvasRenderer는 import하지 않음.
4. 상수·식·키·이벤트는 `ARCHITECTURE` 숫자를 그대로. 추측으로 바꾸지 않는다.
5. 제품 흐름은 `PRD.md`: 대기실 → 1인/AI → 재배치 → 시작 → 슬링샷 → 결과. 1:1 버튼은 hidden, 핸들러 no-op.
6. `setMatchConfig`는 LINE을 깔고, 적용·입장·한 판 더(솔로/AI)는 `play-formation`을 복구.
7. `VisitLog`에 delete/clear/`removeItem(visit-log)`를 넣지 않는다. 부팅이 지우는 키는 `ARCHITECTURE` §12만.
8. leftover 모듈(`RoomState`, `PvpInvite`, `LobbyAi` 등)은 테스트 305를 맞추기 위해 스텁으로 둘 수 있으나 제품 UI를 열지 않는다.
9. 같은 색 붙임은 `SameColorBond.js`만. GameEngine은 RESOLVING `afterUpdate`에서 `planSameColorBondHold`만 호출. 슬링샷·다른 색 바디 숫자는 바꾸지 않는다.
10. AI 도주(`kind: flee`)는 `AIBot.js`만. 흑 클러스터(표면≤11)면 판 안 짧은 샷. 장외·상대 선충돌 금지.
11. 가이드북 7장 글자는 `UI_PROMPTS`. 점검은 `runLobbyClinic` 26행(붙임·도주·알 수·이력·턴 포함).
12. `npm test` 100% (41파일 / 305). `npm run test:loop` exit 0. `index.html` `?v=20260912f`.
13. Git은 사용자 승인 전 금지. 배포는 사용자가 **백업 및 배포**를 말한 뒤에만 `main` 푸시.

완료 판정: 테스트·캡처 통과. 라이브가 1인·AI·설정 이력·진형 저장·카메라 턴·같은 색 붙임·AI 클러스터 도주·가이드/점검 26행을 `PRD`와 같게 동작. Pages `base /dotori-alkkagi/`. **본판 동결** — 네 문서에 없는 기능을 더하지 않는다.

---

## 1. Step 0 — 캐시 자동 소거 (모든 보완 선행, 불변)

코드 수정·빌드·캡처·테스트 전에:

1. `node_modules/.vite` 강제 삭제 (`npm run cache:purge`).
2. `"dev": "vite --force"`. predev/prebuild/pretest/pretest:loop도 purge.
3. `index.html` Cache-Control(`no-cache, no-store, must-revalidate`) + CSS/JS `?v=`.
4. Vite `force: true` / 개발 서버 no-cache.

캐시 소거 없이 화면 검증이나 `npm test`를 시작하지 않는다.

---

## 2. 모드 분기

보완 지시에 `[MODE]`가 없어도 유형을 감지한다. 작업 전 이 프로토콜과 세 기획 MD를 읽는다.

**VISUAL** — UI, 레이아웃, 스타일, 렌더:

- Zero-Layout-Shift (1px 금지).
- 수정 → `npm run test:loop` 1회 → 헤드셋 2단 알림 → **승인 대기**.

**LOGIC** — 물리, 사운드 타이밍, 네트워크 동기, FSM, 이력/진형/AI:

- 테스트 작성/수정 → `npm test` → 100% Pass까지 최대 5회 → 요약·알림 → **승인 대기**.

혼합이면 LOGIC을 먼저 닫고, 레이아웃이 바뀌면 VISUAL을 이어 한다.

Git 커밋·푸시·리베이스는 사용자가 명시하기 전까지 금지.

---

## 3. 불변

1. 제품 모드 1인 + AI. 1:1 버튼을 다시 켜지 않는다.
2. `dotori-alkkagi:visit-log`를 지우지 않는다. 부팅이 도토리 이력·영구 닉·scene-bg를 지워도 접속이력은 남긴다.
3. 저장 진형을 일자로 덮지 않는다 (설정 적용·대전 입장·솔로/AI 한 판 더).
4. 보기 회전은 카메라만. 빈 판 탭은 시계 +45°만. 왼쪽 턴만 반시계.
5. ROI 밖 기존 코드 오염 0.00%.
6. 라벨과 설명문을 한 박스에 섞어 레이아웃을 밀지 않는다.
7. 설정 이력 패널은 `.settings-lab` 오버레이. 도크 높이를 키우지 않는다.

---

## 4. VISUAL 종료 문구 (고정)

> 🎧 [BEEP!] 1회 수정 및 화면 캡처(`public/test-result.png`)가 완료되었습니다. 브라우저 화면(또는 캡처 이미지)을 확인해 주세요.
>
> **[1: 승인 및 종료] / [2: 추가 수정 필요]** 중 선택해 주세요.

---

## 5. LOGIC 종료

`npm test` 100% 후 파일·통과 수를 요약하고 같은 `[1]/[2]`로 승인 대기한다. 5회 안에 못 닫으면 원인을 보고하고 대기한다.

---

## 6. 배포 (사용자 문장: 백업 및 배포)

승인(`[1]`) 뒤에 사용자가 배포를 요청하면: 관련 파일을 커밋하고 `git push origin HEAD`(보통 `main`). Pages가 `GITHUB_PAGES=1` 빌드 후 `404.html`을 복사해 올린다. force-push·amend·훅 생략은 하지 않는다.
