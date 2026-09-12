# [ARCHITECTURE] 도토리 알까기

이 문서만으로 모듈·상수·식·저장소·배포를 다시 짤 수 있어야 한다. 제품 규칙은 `PRD.md`, 화면은 `UI_PROMPTS.md`, 절차는 `ALL-IN-ONE PRODUCTION PROTOCOL.md`.

## 1. 스택과 스크립트

프레임워크 없음. `"type": "module"`, 버전 `0.1.0`. 엔트리 `src/main.js`.

| 역할 | 패키지 | 버전 |
| --- | --- | --- |
| 번들 | vite | ^7.1.3 |
| 물리 | matter-js | ^0.20.0 |
| 3D | three | ^0.185.1 |
| 사운드 | howler | ^2.2.4 |
| 모션 | gsap | ^3.13.0 |
| 폭죽 | canvas-confetti | ^1.9.3 |
| 실시간 | @supabase/supabase-js | ^2.57.4 |
| 단위테스트 | vitest | ^3.2.4 |
| 캡처 | playwright | ^1.55.0 |

```
cache:purge / predev / prebuild / pretest / pretest:loop / pretest:lobby
  → node scripts/purge-cache.js
dev          → vite --force
dev:dual     → vite --force --open /?dual=1
build        → vite build
test         → vitest run
test:loop    → node scripts/loop-test.js
test:lobby   → node scripts/lobby-scenario.js
beep / beep:remind / posttest → node scripts/headset-beep.js
```

`purge-cache.js`는 `node_modules/.vite`, `node_modules/.cache`, `.next/cache`를 `rmSync(..., { recursive, force })`.

`vite.config.js`:
- `base`: `process.env.GITHUB_PAGES === '1' ? '/dotori-alkkagi/' : '/'`
- `publicDir: 'public'`
- server host true, port 5173, Cache-Control no-cache
- test: `environment: 'node'`, `include: ['tests/**/*.test.js']`, `restoreMocks: true`

Pages 워크플로 `.github/workflows/pages.yml`: `main` 푸시 또는 workflow_dispatch. Node 20. `npm ci --ignore-scripts` (실패 시 `npm install --ignore-scripts`). `GITHUB_PAGES=1 npm run build`. `cp dist/index.html dist/404.html`. `actions/upload-pages-artifact` path `./dist`. `actions/deploy-pages`. concurrency group `pages`, cancel-in-progress.

라이브 `https://youlmacc-oss.github.io/dotori-alkkagi/`.

## 2. 다른 PC 재현 순서

상세 유의는 `PRD.md` §11. 라이브 https://youlmacc-oss.github.io/dotori-alkkagi/ , `?v=20260912f`.

1. **Node 20**. 위 `package.json`을 만들고 `npm ci` (실패 시 `npm install`). 18/22 금지.
2. §3 파일 트리대로 모듈을 나눈다. 상수는 이 문서 숫자를 그대로 쓴다. React 없음. `main.js`는 `ThreeRenderer`만 new.
3. `index.html`은 `UI_PROMPTS.md` DOM·id·`?v=20260912f`·Cache-Control. `public/assets/` 없음.
4. 실시간: `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`가 있으면 실채널, 없으면 Mock. `?loop=1` Mock(캡처). `?dual=1` DualMock(제품 아님).
5. `npm test` 전원 Pass(본판 41파일 / 305). `npx playwright install chromium` 후 `npm run test:loop` exit 0, `public/test-result.png`.
6. Pages는 §1 워크플로 (`GITHUB_PAGES=1`, `404.html` 복사). Git은 사용자 **백업 및 배포** 후.

막히면: `setMatchConfig` 직후 play-formation 복구, visit-log 삭제 금지, SameColorBond/AIBot 식 불변, 1:1 UI hidden, `cache:purge` + `vite --force`. Windows는 `&&` 대신 `;`.

## 3. 파일 트리

```
index.html
vite.config.js
package.json
.github/workflows/pages.yml
scripts/purge-cache.js
scripts/loop-test.js
scripts/lobby-scenario.js
scripts/headset-beep.js
src/main.js
src/style.css
src/physics/GameEngine.js
src/physics/ResultBeat.js          # RESULT_BEAT_MS=420, RESULT_FALL_HOLD_MS=1920
src/physics/SameColorBond.js       # 같은 색 붙임. 다른 모듈 상수 불변
src/ai/AIBot.js
src/ai/TurnManager.js
src/ui/ThreeRenderer.js            # 본판 렌더. main이 이것만 new
src/ui/CanvasRenderer.js           # 존재만. main이 import하지 않음
src/ui/FormationModal.js           # SettingsModal
src/ui/SettingsPanel.js
src/ui/BoardSpin.js
src/ui/GuideBook.js
src/ui/Tutorial.js
src/ui/PlayPrefs.js
src/ui/HudPower.js
src/ui/MatchFab.js
src/ui/ViewportShell.js
src/ui/GameExit.js
src/audio/SoundEngine.js
src/render/SceneManager.js
src/render/BoardRenderer.js
src/network/RealtimeClient.js      # SUPABASE_URL_ENV, SUPABASE_ANON_ENV
src/network/RealtimeManager.js
src/network/VisitLog.js            # 삭제 API 없음
src/network/NightSession.js
src/network/AcornPolicy.js
src/network/Nickname.js
src/network/LobbyRooms.js          # LOBBY_CAP=10
src/network/PresencePolicy.js
src/network/MatchReady.js
src/network/MatchStart.js
src/network/MatchSync.js           # event spectator_update
src/network/RoomState.js           # leftover
src/network/PvpInvite.js           # leftover, 제품 버튼 hidden
src/network/PvpMatchLoop.js
src/network/LobbyAi.js             # leftover 대기실 봇 좌석 없음
src/network/LobbyClinic.js
src/network/LobbySeed.js
src/network/DualMock.js
tests/*.test.js                    # 41파일. SameColorBond·AIBot 포함
public/                            # test-result.png. 본판에 public/assets 디렉터리 없음
index.html                         # ?v=20260912f + Cache-Control
```

## 4. 부팅 (`main.js`)

1. `clearAcornHistory()` — local `dotori-alkkagi-acorns` 삭제, 세션 도토리 10.
2. `clearPermanentNickname()` — local `dotori-alkkagi-nickname` 삭제. 닉은 session만.
3. `localStorage.removeItem('dotori-alkkagi-scene-bg')`.
4. `takeNightUserId({ makeId: newNightUserId })` → RealtimeManager `userId`. claim live 8000ms.
5. `new ThreeRenderer(canvas)`. `GameEngine({ mapPointer: (e) => renderer.pointerToMatter(e) })`.
6. `renderer.setGuideEnabled(readGuideEnabled())` — 키 없으면 true.
7. 로비 표시. `shouldAutoOpenGuideBook`이면 가이드.
8. Presence/join/connect → `noteVisit`. 수신 `absorbVisitLog`. 연결 후 `broadcastVisitLog` 전체.
9. **visit-log 키는 removeItem 하지 않는다.**

`pointerToMatter`: NDC 레이캐스트 → 평면 Y=`STONE_Y` → Matter `x = hit.x * (720/(480-68)) + 360`, `y = hit.z * scale + 360`.

`__dotori` 캡처 API: renderer, viewport, settingsModal. `?loop=1`은 로비·설정 시나리오. `?dual=1`은 DualMock(제품 아님).

## 5. 물리

가상 720×1280. `Engine.create({ gravity: { x:0, y:0, scale:0 } })`. world gravity 0.

### 알 바디 `STONE_BODY_OPTIONS`

restitution 0.85, friction 0.02, frictionAir 0.025, frictionStatic 0.05, density 0.005, slop 0, sleepThreshold 28.

### 상수

- `STONE_RADIUS` 24, `STONE_VISUAL_SCALE` 1.14, `STONE_PICK_SLOP` 1.52, `STONES_PER_SIDE` 5.
- `BOARD.outer` {x:40,y:40,size:640}, rim 28, inner {x:68,y:68,size:584}.
- `BOARD_VISUAL` MESH 480, INSET 68. `boardFallBounds(world)`: usable=MESH-INSET, half=MESH/2, span=half*(world/usable), mid=world/2, {min: mid-span, max: mid+span}.
- `WORLD_CATCH_PAD` 280.
- `SLINGSHOT`: MAX_PULL 360, MAX_LAUNCH_SPEED 54, PULL_GAIN 1, AIM_LINE_SCALE 1.15, PULL_DEADZONE 14, ENGINE_DELTA_MS 1000/60, FRICTION_AIR 0.025.
- `estimateLaunchTravel(v)` = |v| / 0.025. `PREVIEW_LAUNCH` FRICTION_AIR 0.025, REST_SPEED 0.12, RESTITUTION 0.85.
- `CLASH_SOUND_MIN_SPEED` 0.4.
- `POWER_RATIO` 1–6 step 0.1 default 3.8, key `dotori_power_ratio`.
- `REST` speed 0.05, angular 0.04, frames 18.
- `TURN` 15000 / urgent 5000 / delta cap 100.
- `STONE_NEAR_SLOP` 14, `PULL_BLOCK_COS` = cos(40°).
- 같은 색 붙임 — 모듈 `src/physics/SameColorBond.js`. 상수만 이 파일. GameEngine은 `planSameColorBondHold`만 호출.
  - `SAME_COLOR_BOND`: SCALE 1.5, CONTACT_SLOP 6, BASELINE_SPEED `360*3.8*0.025*0.3`.
  - 문턱 `sameColorBondThreshold()` = BASELINE × SCALE ≈ 15.39.
  - `collisionStart`에서 살아 있는 돌-돌만 `_bondHits[{a,b,relSpeed,velA,velB}]`.
  - `_handleAfterUpdate` 첫 줄 `_applySameColorBonds`. `phase!==RESOLVING` 또는 `placementOnly`면 히트만 비움.
  - `incomingForBond`: 다른 색 스트라이커 속도 vs **−bondOut**(짝→맞은 알). 쌍 내부 충돌은 cos=1. 외부 없으면 분리 속 |sep|.
  - `effectiveBondSpeed` = speed × max(0, cos). `shouldHold` = effective < 문턱.
  - hold: 분리 sep>0이면 각 0.5씩 상쇄 → 속도 평균. `holdPositions`: `0.4 < gap ≤ slop+2`일 때만 반씩 닫음.
  - 적용: `Body.setVelocity` / 있으면 `setPosition`. restitution·슬링샷·다른 색 바디 옵션 불변.
- `PHASE` idle/aiming/resolving/gameOver/spectating.
- `GAME_MODE` ai/pvp/solo/spectate. 제품 시작 solo·ai.
- `AI_DIFFICULTY` beginner/intermediate/expert.
- `TOUCH_FEEL` EMA 0.38, TENSION_EXPONENT 1.15, stages 0.3/0.7/1, haptic 8/15.
- `AIM_GUIDE_VISUAL` DESKTOP 0.52, PHONE_MIN 0.34, PHONE_MAX 0.46, REF_WIDTH 720, PHONE_MAX_WIDTH 480, PHONE_TALL_MAX_WIDTH 600, PHONE_MIN_ASPECT 1.35.
- `FORMATION_COUNTS` [3,5,7,9]. `FORMATION_ZONE_RATIO` 0.3. `FORMATION_MIN_SEPARATION` = 24*2*1.2.
- `FORMATION_SHAPE` line/wedge/column/defense.
- `FORMATION_FIRST_LINE` WHITE 1, BLACK 7. `SECOND` WHITE 2, BLACK 6. `EDGE` 0–8.
- `FORMATION_FACEOFF_REQUEST` black {360,640}, white {360,100}.
- `FORMATION_SLOT` mine/custom/preset. `FORMATION_MODE` preset/custom.
- `FORMATION_STORAGE_KEY` `dotori-alkkagi:my-formation`. `formationStorageKey(slot)` = `${KEY}:${slot}`.

### 슬링샷 `computeSlingshotLaunch(origin, pointer, options)`

```
raw = pointer - origin
gained = origin + raw * gain(1)
pull = clamp to maxPull 360
mag = |pull|
power = mag / maxPull
powerScale = clampPowerScale(options.powerScale ?? 3.8)
travel = mag * powerScale
speed = min(travel * 0.025, maxSpeed 54)
velocity = normalize(-pull) * speed
inDeadzone = |raw| < 14
```

발사 방향은 당김의 **반대**.

### `setMatchConfig({ mode, difficulty })`

허용 모드 pvp|ai|solo|spectate, 난이도 beginner|intermediate|expert. spectator/aiOpponent 정리. `inputLocked=false`. 마지막에 **`applyDefaultMatchFormation(count)` → `setupFormation(count, PRESET, LINE)`**. 호출 측이 `applySavedPlayFormation`으로 덮는다.

### 프리셋 배치 `createPresetLayout(count, shape)`

격자 Y: 텍스처 1024, pad 68, mesh 480, inset 68. `t = (pad + index * ((1024-pad*2)/8)) / 1024` → Matter Y.

`rowXs(count, inner, padX)`: count≥7이면 pad 40 아니면 88. 1알은 중앙.

count 1 → 항상 line(대치). count 3+defense → wedge. count 5+column → line.

| count | shape | 백 진영 (흑은 Y 미러) |
| --- | --- | --- |
| * | line | `rowXs(count)` at homeY(WHITE) |
| 3 | wedge | 뒤 2 + 앞 1(간격 중앙) |
| 5 | wedge | 뒤 3 + 앞 2(gapXs) |
| 5 | defense | 뒤 3 + 앞 2 alignedXs |
| 7 | wedge | 뒤 4 pad 56 + 앞 gaps |
| 7 | defense | 뒤 4 + 앞 3 aligned |
| 9 | wedge | 뒤 5 pad 40 + 앞 gaps |
| 9 | defense | 뒤 5 + 앞 4 aligned |
| * | column | packCampGrid(..., 'column') |

### 승패

생존 0 → 상대 승. 동시 0 → draw. surrender → 상대 승.

결과 제목(`main.js`): draw→`무승부`, AI 흑승→`승리!`, AI 백승→`패배 (AI 승리)`, 그 외 `흑 승`/`백 승`. 부제 `resultSubLine`: 기권 / 동시 장외 / AI 전멸 / 내 돌 전멸 / 기본 장외.

결과 지연: `resultRevealDelayMs(lastFallAt)` = lastFallAt 없으면 0, 있으면 max(0, 1920 − (now−at)). 폴링은 낙사 있으면 홀드 후 420ms 박자.

## 6. 보기 회전

`BOARD_SPIN_STEP` π/4, `BOARD_SPIN_MS` 260, `BOARD_SPIN_TAP_PX` 14, `BOARD_SPIN_CLEAR_SLOP` 1.85.

`canBoardSpin`: inMatch+matchStarted, not paused/placementOnly/killCam/aiming/inputBlocked, phase IDLE.

빈 판 탭: `isBoardSpinTarget`(outer 안 + 살아 있는 돌에서 radius*1.85 밖) + `isBoardSpinTap` ≤14px → **+45°만**.

`#board-spin-btn` +45°, `#board-spin-ccw` −45°. `canBoardSpinButton`은 내 턴이 아니어도 보기 회전 가능, AIMING/RESOLVING만 막음.

`boardSpinFabVisible`: inMatch+started, not lobby/spectating/gameOver.

## 7. 진형 저장 (`FormationModal` / SettingsModal)

키: `dotori-alkkagi:play-formation`, `dotori-alkkagi:play-formation-slot`, 슬롯 `dotori-alkkagi:my-formation:{mine|custom|preset}`. 레거시 mine은 `dotori-alkkagi:my-formation`.

`GAME_MODE_KEY` `dotori_game_mode` (solo|ai만 저장). `AI_DIFFICULTY_KEY` `dotori_ai_difficulty_v2` (없으면 expert).

`apply()`: 대국 중이면 차단. `commitPlayLayout` 검증 → `saveFormationSlot` + `savePlayFormation` → `setMatchConfig` + `applySavedPlayFormation` → 톤·조준선·prefs → `onApply({ toLobby:true })`.

로비 1인/AI: `setGameMode(mode, { startMatch:true })` → 위와 같으나 `onApply({ toLobby:false })` → `enterMatchRoom()` → 솔로/AI면 다시 `applyCurrentPlayFormation` → `beginMatchReady`. `shouldStartWithoutPeer(solo|ai)` true.

`playFormationPickVisible`: inMatch && awaitingStart && (solo|ai). HUD 칩은 slot preset. 같은 줄 알 수 버튼(`data-play-count` 3/5/7/9)은 `selectPlayFormationCount` → 현재 진형으로 `setupFormation(count, PRESET, shape)` 후 `savePlayFormation`. 설정 미리보기는 `SettingsModal.syncFromPlayFormation`.

한 판 더 솔로/AI: `enterMatchRoom` + `setMatchConfig` + `applyCurrentPlayFormation`.

## 8. AI

`AI_ERROR_DEG` 전부 0. `AI_HIT_EMBED` beginner 12 / intermediate 14 / expert 18. `AI_THINK` MIN 1000 MAX 1500 AIM 500. `STONE_CONTACT_SLOP` 6. `PLAYER_CLUSTER_GAP` 11. `DOUBLE_ALIGN_COS` = cos(14°).

도주 상수: `FLEE_INNER_PAD` = r+36, `FLEE_KEEP` = r+28, `FLEE_MIN_PULL` = 16, `FLEE_MAX_PULL` = 42. 이동거리 ≈ pull × 3.8 (`estimateLaunchTravel` = |v| / 0.025).

`playerHasCluster(player)`: 살아 있는 흑 한 쌍이라도 `dist − r − r ≤ 11`.

`calculateShot` 순서:
1. 클러스터면 `pickFleeShot(inner)` → 실패 시 pad r+12 재시도. 성공이면 `{ kind:'flee', shooterId, targetId:shooter.id, pointer, angle, velocity, travel }`.
2. `pickFleeShot`: 각 백 알에 대해 중앙·상대 반대·수직·8방. `rayRoom`은 inner를 pad만큼 축소한 사각형. `fleePullForRoom`이 장외 여유(`room ≥ travel+KEEP`) 없으면 버림. 이동거리 안에 `firstHitStone`이 있으면 버림(아군 포함). `resolvePullBlock`이면 ±8/14/22°만 재시도.
3. 점수: room×1.15 + inwardDot×240 + awayDot×140 + travel×0.25 − (상대 레이 위) − (클러스터 방향) − (바깥쪽).
4. 도주 실패 + 묶이지 않은 흑이 있으면 `excludeTargetIds`로 그 묶음만 빼고 기존 녹아웃/더블.
5. 전부 묶였고 도주도 실패면 기존 녹아웃.

`eligibleShotPairs`: 흑·백 접촉 슈터/쌍은 건너뛰고, 대안 없을 때만 허용.

`TurnManager.schedule`: 생각/조준 타이머가 이미 있으면 no-op. `beginAiAim`은 shooterId+pointer만 필요(flee의 targetId가 백이어도 됨).

## 9. 렌더 (`ThreeRenderer`)

- Camera: Perspective FOV 38, near 4, far 4000. camBase (0, 780, 640), lookBase (0, 15, 10). 쿼터뷰 pitch 52°, 거리 이진 탐색 280–2800.
- 판: `BOARD_MESH_SIZE` 480, `BOARD_WORLD_INSET` 68, `BOARD_THICKNESS` 70, `SIDE_WOOD` 0x241208, `STONE_Y` = 70+8.
- `worldScale` = (480-68)/720. 알 Sphere(r * worldScale * 1.14, 32, 18).scale(1, 0.46, 1).
- 흑 재질 0x111111 roughness 0.15 metalness 0.28. 백 0xfcf9f2 r 0.18 m 0.1.
- `viewYaw`만 회전. `spinView(step)` 260ms 이징.
- 킬캠: SLOW_MO_S 1.5, CLOSE_BACK 132, CLOSE_UP 44, CLOSE_SIDE 28, DROP_DEPTH 155, CLOSE_FOV 34, MIN_CAM_Y 92, BOARD_HALF 240.
- 조준선 색 `dotori_guide_color` 기본 `#ffcc00`. 사용 `dotori_guide_enabled` '1'/'0'.
- 톤 `dotori_board_color` JSON `{ preset, base, hue, bright }`. 기본 base `#f1bf70`. 레거시 `#e9c587` → `#f1bf70`. hue −40..40, bright 슬라이더 65..135를 /100.
- `ViewportShell.PLAYFIELD_HUD` topPx 76, bottomPx 178, nameBottomPx 248, edgePad 0.03.

## 10. 사운드

키 `dotori-alkkagi-volume`(기본 0.8), `dotori-alkkagi-mute`.

| 메서드 | 시점 |
| --- | --- |
| unlock | 첫 pointer/touch/click, engine pointerdown |
| setVolume / setMuted | 설정 |
| playClashByVelocity | 충돌, min 0.35, ref 25 |
| playFlick(power) | launch |
| playFall | stoneFallen 장외 |
| playDoor enter/leave | 대전방 출입 |
| playStart | applyMatchStarted |
| playTurn | turnEnd |
| playTimerTick | 긴급 ≤5s |
| playResult win/lose/draw/end | gameOver |
| playSurrender | reason surrender |
| setPull / stopPull | aiming |
| setAmbience lobby/wait/match/off | syncSceneMode |

## 11. 네트워크

채널 `dotori-lobby`. `BROADCAST_WAIT_MS` 400. Presence heartbeat 30s, stale 5분, retrack grace 2s. `KEEP_CONNECTED_NICKNAME` `도토리1`. `VIRTUAL_USER_PREFIX` `virt_`.

이벤트: `spectator_update`, `room_state`, `pvp_invite`, `lobby_state`, `lobby_sweep`, `ai_wallet`, **`visit_log`**.

`room_state` 필드: roomId, hostId, hostName, guestId, guestName, inviteTargetId, started, phase, matchGen, seq, acked, hostAcorns, guestAcorns, firstId. `PVP_ROOM_ID` `dotori-pvp` (제품 오프).

`spectator_update` (`packMatchSync`): kind board|launch|camp; event ''|launch|camp|start|turnEnd|timer|gameOver; matchId, roomId, senderId, timestamp, started, phase, currentTurn, turnRemainingMs, winner, scores; stones[{id,color,fallen,position,x,y,velocity}]; launch {stoneId,x,y,velocity,force,power,color}; seq, matchGen.

동기 타이밍: TURN_END_WATCHDOG 900, CAMP_WAIT 800, HOST_CLOCK 250.

`visit_log` 행 `{ userId, nickname≤5, firstSeen, lastSeen, visits }`. merge: firstSeen min, lastSeen max, visits max. `noteVisit`는 기존 lastSeen부터 30분(`VISIT_SESSION_GAP_MS`) 지나야 visits+1. `queryVisitLog`는 nick/userId 부분문자열. `formatVisitStamp` `YYYY-MM-DD HH:mm`. **clear/delete 함수 금지.**

재배치: READY_ASK_MS 5000, REARRANGE_MS 10000, FIRST_HINT_AFTER_MS 3000.

도토리: `SESSION_ACORNS` 10, `ACORN_WIN` +1, `ACORN_LOSS` −1. `shouldSettleAcorns`는 mode==='ai' && started && !spectating && winner not null/draw. settleKey `roomId:matchGen:winner`. 1인·무승부 0.

## 12. 저장소

부팅이 **지움**: `dotori-alkkagi-acorns`(local), `dotori-alkkagi-nickname`(local만), `dotori-alkkagi-scene-bg`.

| 키 | 저장소 | 비고 |
| --- | --- | --- |
| `dotori-alkkagi:visit-log` | local | **앱이 지우지 않음** |
| `dotori-alkkagi:play-formation` | local | 본판 좌표 |
| `dotori-alkkagi:play-formation-slot` | local | mine/custom/preset |
| `dotori-alkkagi:my-formation` + `:mine|:custom|:preset` | local | |
| `dotori_power_ratio` | local | |
| `dotori_game_mode` | local | solo\|ai |
| `dotori_ai_difficulty_v2` | local | 없으면 expert |
| `dotori_guide_enabled` | local | '1'/'0', 없으면 on |
| `dotori_guide_color` | local | #rrggbb |
| `dotori_board_color` | local | JSON |
| `dotori-alkkagi-action-cam` | local | 없으면 on |
| `dotori-alkkagi-rearrange-ask` | local | 없으면 on |
| `dotori-alkkagi-volume` | local | 기본 0.8 |
| `dotori-alkkagi-mute` | local | |
| `dotori-alkkagi-book-skip` | local | |
| `dotori-alkkagi-night-claim` | local | {userId,tab,at} |
| `dotori-alkkagi-night-user` | session | |
| `dotori-alkkagi-night-acorns` | session | |
| `dotori-alkkagi-nickname` | session | |
| `dotori-alkkagi-book-seen` | session | |
| `dotori-alkkagi-invite-only-seen` | session | 안내 자체는 안 띄움 |

닉: `NICKNAME_MAX` 5 (코드포인트 `Array.from`). prefix `도토리`. 중복 시 접미 2–99 또는 다음 빈 `도토리N`.

## 13. 제품 시작 vs leftover

구현해도 제품이 호출하지 않음: `startOwnPvpRoom`, 공개 방 참가, 대기실 `ai_dotori` 좌석, `openPvpGuidePick`(false), `shouldOfferInviteOnlyNotice`(false). 테스트(`RoomState`, `PvpInvite`, `LobbyAi` 등)와 스텁은 남겨 305를 맞출 수 있다. UI는 hidden.

1인: `myColor = currentTurn`. AI: 사람 black, 봇 white, 백 턴 입력 잠금. 혼자 로비 기본 제안은 AI이나 강제 전환하지 않음(`defaultGameModeForLobbyCount`).

## 14. 테스트 (재현 완료 조건)

`vitest run` 41파일 / 305 Pass.

파일: SameColorBond, VisitLog, PlayFormation, BoardSpin, StonePick, AIBot, FormationCamp, GameEngine, MatchReady, MatchStart, MatchSync, AcornPolicy, NightSession, Nickname, GuideColor, PlayPrefs, HudPower, MatchFab, ViewportShell, Tutorial, ResultBeat, BoardTone, FormationSlot, SoundEngine, KillCam, LobbyRooms, LobbyClinic, LobbyAi, LobbySeed, PresencePolicy, RoomState, PvpInvite, PvpCycle, PvpRematchLoop, PvpLiveSync, ChatSpectator, RealtimeClient, DualMock, GameExit, SeatYaw, MatchPlacement.

`test:loop` (`?loop=1`, 포트 4179, env supabase 빈 문자열). 기기 393×852, 360×780, 412×1014, 1280×720, dpr 2.

단언 요약: 판 NDC contained + `#table` 안 + spanX≥1.55 spanY≥0.40. 로비 가이드에 1인+AI, `1:1` 없음. `#lobby-mode-pvp` hidden. 초대만 안내 hidden. 가이드 표제에 도토리, 튜토리얼/바로시작. 점검 ≥18행, 액션캠·재배치·당김·바로시작·대기방·내닉네임·조준선·붙임·도주·3알·이력·턴. AI 입장 후 재배치 박스. 시작 버튼 `--board-cx` 중앙. 알 수 3·5·7·9와 진형 3버튼이 `#guide-btn`과 같은 줄, 기권·대기방·조준선 50×50. 시작 후 선택 칩 hidden, 턴 FAB 보임. 설정 미리보기 ≥220, **이력** 버튼, 액션캠/재배치 체크, scene-bg 키 없음. iPhone에서 결과 `대기실` 버튼.

`runLobbyClinic` 26행 id 순서: engine, renderer, sound, session, night, modes, product, nick, bookSkip, first, acorn, forfeit, result, actionCam, ready, pull, cap, gate, fabs, volume, realtime, bond, aiFlee, playHud, visit, spin.

헬퍼: `bondClinicOk` SCALE 1.5·SLOP 6·문턱 hold, `aiFleeClinicOk` gap 11 + clustered→flee / spaced→knockout, `playHudClinicOk` `#play-count-3|5|7|9` + `#play-formation-line|wedge|defense`, `visitClinicOk` 키·query/note·clear/delete 없음 + `#visit-log-open`, `spinClinicOk` STEP π/4·MS 260 + `#board-spin-btn` / `#board-spin-ccw`.

`clinicSnapshot`(`main.js`)은 엔진·렌더·사운드·닉·도토리·모드 버튼·게이트·FAB·볼륨·액션캠·재배치·조준선색·당김 문구·킬캠 1.5·북 스킵/바로시작 + 위 칩·이력·턴 id를 넣는다.

`renderClinicList` 리드: `물리 · 붙임 · AI 도주 · 알 수·진형 · 이력 · 턴 · 조준선 · 설정`.

출력 `public/test-result.png` (iPhone 캡처).

본판 동결: 네 MD 밖의 기능을 추가하지 않는다. 재현 완료 = 41파일/305 + loop exit 0 + Pages `/dotori-alkkagi/`.
