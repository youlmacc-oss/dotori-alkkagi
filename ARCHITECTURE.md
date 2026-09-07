# [ARCHITECTURE] 무비용 고안정성 웹 1:1 알까기 아키텍처 (dotori-alkkagi)

## 1. 인프라 및 엔진
- **배포 & 호스팅**: Vercel (무료 티어 CDN). `vercel.json` 으로 Vite `dist` 를 올린다.
- **네트워크**: Supabase Realtime. 채널 `dotori-lobby`.
- **동시접속**: `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` 가 있으면 실 클라이언트, 없으면 로컬 Mock.
- **클라이언트**: Vanilla JS + Matter.js (물리) + Howler.js (사운드) + Three.js (판)
- **배포는 화면만**: Vercel은 `dist` CDN. 방 권위와 무관하다.

## 1-1. 방 하나 = 상태 하나
- **권위는 둘뿐**: `room_state`(방 생명주기)와 `spectator_update`의 `seq`+`matchGen`(판). Presence는 대기실 좌석·닉만 알린다. `started` / `guestId` / 상대 유무 / 시작 버튼에 쓰지 않는다.
- **방 상태 Broadcast** (`room_state`): 호스트가 `{ roomId, hostId, guestId, inviteTargetId, started, phase, matchGen, seq, hostAcorns, guestAcorns, acked }` 전체를 보낸다. 수락은 `guestId`를 박은 뒤 `ack`로 확정한다. 시작·퇴장·다시하기는 이 객체를 바꾼 뒤 다시 보낸다. 대기 중 퇴장은 `guestId`를 비우고 `started`/`acked`/`seq`를 끈다. 시작된 판에서 상대가 사라지면 남은 화면은 기권승을 정산한다. 다시하기는 같은 방의 `started`만 끄고 `matchGen++`한다.
- **수락 핸드셰이크** (`pvp_invite`): 팝업은 `pvp_invite`만. 게스트 입장 후 `hello` → 호스트 `applyRoomGuest` + `ack` + 전체 `room_state` 재방송. ACK 전에도 대기 화면은 열리되 시작 버튼은 잠근다. Presence로 수락을 추론하지 않는다. `hello`를 못 받으면 1.5초 간격 2회 재전송.
- **판 Broadcast** (`spectator_update`): 채널 이름은 유지. 페이로드는 `seq` + `matchGen` + `event`. 같은 방·남이 보낸 패킷만, `matchGen`이 같고 `seq`가 lastSeq보다 클 때만 적용한다. timestamp는 구패킷 tie-break만.
  - `camp`: 시작 직전 자기 색 돌만. 재배치 중에는 방송하지 않는다.
  - `start`: 호스트가 흑+백 진형을 합친 뒤 한 번. 양쪽 `applyRemoteMatchState` 후 `resumeMatch`.
  - `launch`: 쏜 사람. 돌 좌표 없음. 피어는 `applyRemoteLaunch`만. `awaitingStart`/`paused`면 무시.
  - `turnEnd`: 쏜 사람이 로컬 정지가 끝나면 전체 돌 스냅샷. 피어는 `RESOLVING`이어도 덮어쓴다. 슈터 `turnEnd`가 900ms 안 오면 호스트가 자기 정지 스냅샷으로 한 번만 보정.
  - `gameOver`: 먼저 확정한 쪽. 같은 `matchGen`+정산 키면 한 번만 정산.
- **선공**: 도토리 적은 쪽. 판단 입력은 Presence가 아니라 `room_state`의 acorn 필드.
- **접속 안내**: 가이드북을 닫거나 튜토리얼을 끝내거나 건너뛰면 초대만 가능하다는 안내를 한 번 띄운다. 초대 링크로 들어온 손님에게는 띄우지 않는다.
- **대기실 AI 좌석**: `ai_dotori`(도토리봇)는 Presence가 아니라 로컬 좌석이다. 초대하면 즉시 `guestId`+`acked`로 수락하고, 봇 턴은 기존 AI 슈터가 친다. 봇은 초대를 보내지 않는다. 사람 1:1 공개 여부와 별개다. 봇 도토리는 10에서 시작해 `ai_wallet`과 localStorage에 누적한다. 설정 AI 연습전은 건드리지 않는다.

## 2. 동적 사운드 연동
- 바둑알 충돌 이벤트(collisionStart) 발생 시 상대 속도 계산
- SoundEngine.js에서 속도 기반으로 피치/볼륨 변조 및 모바일 진동 트리거

## 3. 뷰포트 대응
- 720x1280 (9:16) 가상 해상도 반응형 스케일러 + Safe Area Inset 적용
