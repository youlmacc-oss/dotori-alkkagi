# [ARCHITECTURE] 무비용 고안정성 웹 1:1 알까기 아키텍처 (dotori-alkkagi)

## 1. 인프라 및 엔진
- **배포 & 호스팅**: Vercel (무료 티어 CDN). `vercel.json` 으로 Vite `dist` 를 올린다.
- **네트워크**: Supabase Realtime. 채널 `dotori-lobby`.
- **동시접속**: `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` 가 있으면 실 클라이언트, 없으면 로컬 Mock.
- **클라이언트**: Vanilla JS + Matter.js (물리) + Howler.js (사운드) + Three.js (판)
- **배포는 화면만**: Vercel은 `dist` CDN. 방 권위와 무관하다.

## 1-1. 방 하나 = 상태 하나
- **고정방**: 1:1 `roomId`는 상수 `dotori-pvp` 하나. 호스트는 1:1을 연 사람(초대한 사람). 대국 좌석 2. 사이트 접속 상한은 2가 아니다.
- **권위는 둘뿐**: `room_state`(방 생명주기)와 `spectator_update`의 `seq`+`matchGen`(판). Presence는 대기실 좌석·닉만 알린다. `started` / `guestId` / 상대 유무 / 시작 버튼에 쓰지 않는다.
- **방 상태 Broadcast** (`room_state`): 호스트가 `{ roomId, hostId, guestId, inviteTargetId, started, phase, matchGen, seq, hostAcorns, guestAcorns }` 전체를 보낸다. 수락은 `guestId`를 박으면 확정이다. hello/ack/동전 없음. 시작·퇴장·다시하기는 이 객체를 바꾼 뒤 다시 보낸다. 대기 중 퇴장은 `guestId`를 비운다. 호스트는 빈 방에 남고 게스트는 대기실로 간다. 시작된 판에서 상대가 사라지면 남은 화면은 기권승을 정산한 뒤 메인으로 간다. 다시하기는 같은 방의 `started`만 끄고 `matchGen++`하며 선공은 다시 호스트다.
- **수락** (`pvp_invite`): 팝업은 `pvp_invite`만(수락/거절). 게스트가 수락하면 호스트 `applyRoomGuest` + `room_state` 재방송. Presence로 수락을 추론하지 않는다.
- **판 Broadcast** (`spectator_update`): 채널 이름은 유지. 페이로드는 `seq` + `matchGen` + `event`. 같은 방·남이 보낸 패킷만, `matchGen`이 같고 `seq`가 lastSeq보다 클 때만 적용한다. timestamp는 구패킷 tie-break만. 양쪽 브라우저가 각자 Matter를 돌린다.
  - `camp`: 시작 직전 자기 색 돌만. 재배치 중에는 방송하지 않는다.
  - `start`: 호스트가 흑+백 진형을 합친 뒤 한 번. 양쪽 `applyRemoteMatchState` 후 `resumeMatch`. 후공은 `room_state.started`를 받으면 시작 대기를 닫고, 이 판 패킷으로 돌을 맞춘다.
  - `launch`: 쏜 사람. 돌 좌표 없음. 피어는 `applyRemoteLaunch`만. `awaitingStart`/`paused`면 무시.
  - `turnEnd`: 쏜 사람이 로컬 정지가 끝나면 전체 돌 스냅샷. 피어는 `RESOLVING`이어도 덮어쓴다. 슈터 `turnEnd`가 900ms 안 오면 호스트가 자기 정지 스냅샷으로 한 번만 보정.
  - `gameOver`: 먼저 확정한 쪽. 같은 `matchGen`+정산 키면 한 번만 정산.
- **선공**: 항상 호스트(흑). 게스트는 백. 1인·설정 AI도 호스트(흑)가 먼저. 도토리는 사람 1:1 정산만.
- **1인 시작**: `applyRoomStart`는 `guestId`가 있을 때만 `started`를 켠다. 1인·설정 AI는 피어 camp를 기다리지 않고 시작 버튼이 `applyMatchStarted`로 판을 연다.
- **수락 후 늦은 초대 room_state**: `incomingClearsOpponent`는 `leaverId`가 있고 `inviteTargetId`가 없을 때만 게스트를 지운다. 초대 대기 방송은 수락 좌석을 비우지 않는다.
- **접속 안내**: 가이드북을 닫거나 튜토리얼을 끝내거나 건너뛰면 초대만 가능하다는 안내를 한 번 띄운다. 초대 링크로 들어온 손님에게는 띄우지 않는다.
- **대기실 봇 없음**: `ai_dotori` 좌석·초대·지갑은 쓰지 않는다. 설정 AI 연습전은 로컬만.

## 2. 동적 사운드 연동
- 바둑알 충돌 이벤트(collisionStart) 발생 시 상대 속도 계산
- SoundEngine.js에서 속도 기반으로 피치/볼륨 변조 및 모바일 진동 트리거

## 3. 뷰포트 대응
- 720x1280 (9:16) 가상 해상도 반응형 스케일러 + Safe Area Inset 적용
