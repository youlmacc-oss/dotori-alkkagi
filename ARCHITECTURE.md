# [ARCHITECTURE] 무비용 고안정성 웹 1:1 알까기 아키텍처 (dotori-alkkagi)

## 1. 인프라 및 엔진
- **배포 & 호스팅**: Vercel (무료 티어 CDN). `vercel.json` 으로 Vite `dist` 를 올린다.
- **네트워크**: Supabase Realtime (Presence 10인 정원 락, Broadcast 샷 벡터). 채널 `dotori-lobby`.
- **동시접속**: `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` 가 있으면 실 클라이언트, 없으면 로컬 Mock.
- **클라이언트**: Vanilla JS + Matter.js (물리) + Howler.js (사운드) + Three.js (판)

## 2. 동적 사운드 연동
- 바둑알 충돌 이벤트(collisionStart) 발생 시 상대 속도 계산
- SoundEngine.js에서 속도 기반으로 피치/볼륨 변조 및 모바일 진동 트리거

## 3. 뷰포트 대응
- 720x1280 (9:16) 가상 해상도 반응형 스케일러 + Safe Area Inset 적용
