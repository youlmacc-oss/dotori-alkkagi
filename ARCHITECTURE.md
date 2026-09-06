# [ARCHITECTURE] 무비용 고안정성 웹 1:1 알까기 아키텍처 (dotori-alkkagi)

## 1. 인프라 및 엔진
- **배포 & 호스팅**: Vercel (무료 티어 CDN). `vercel.json` 으로 Vite `dist` 를 올린다.
- **네트워크**: Supabase Realtime. 채널 `dotori-lobby`.
- **동시접속**: `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` 가 있으면 실 클라이언트, 없으면 로컬 Mock.
- **클라이언트**: Vanilla JS + Matter.js (물리) + Howler.js (사운드) + Three.js (판)
- **배포는 화면만**: Vercel은 `dist` CDN. 방 권위와 무관하다.

## 1-1. 방 하나 = 상태 하나
- **Presence**: 대기실 좌석·누가 방을 열었는지만 알린다. 초대 시트·상대 입장·시작 여부의 권위가 아니다.
- **방 상태 Broadcast** (`room_state`): 호스트가 `{ roomId, hostId, guestId, inviteTargetId, started, phase }` 전체를 보낸다. 수락·시작·퇴장은 이 객체를 바꾼 뒤 다시 보낸다. 대기 중 퇴장은 `guestId`를 비우고 `started`를 끈다. 시작된 판에서 상대가 사라지면 남은 화면은 기권승을 정산한다. 다시하기는 같은 방의 `started`만 끈다.
- **판 Broadcast** (`spectator_update`): 시작된 1:1의 돌·턴·승패 스냅샷. 같은 방만 적용한다.
- **초대 Broadcast** (`pvp_invite`): 팝업을 띄운다. 수락 결과는 `room_state.guestId`로만 호스트 화면에 반영한다.
- **접속 안내**: 가이드북을 닫거나 튜토리얼을 끝내거나 건너뛰면 초대만 가능하다는 안내를 한 번 띄운다. 초대 링크로 들어온 손님에게는 띄우지 않는다.

## 2. 동적 사운드 연동
- 바둑알 충돌 이벤트(collisionStart) 발생 시 상대 속도 계산
- SoundEngine.js에서 속도 기반으로 피치/볼륨 변조 및 모바일 진동 트리거

## 3. 뷰포트 대응
- 720x1280 (9:16) 가상 해상도 반응형 스케일러 + Safe Area Inset 적용
