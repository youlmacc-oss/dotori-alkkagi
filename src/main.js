import {
  GAME_MODE,
  GameEngine,
  PHASE,
  PULL_BLOCK_NOTICE,
  PULL_OVER_NOTICE,
  STONE_COLOR,
  defaultGameModeForLobbyCount,
  intendedGameMode,
  isOutsideInnerBoard,
  shouldApplyLobbyDefaultMode,
} from './physics/GameEngine.js';
import { TurnManager } from './ai/TurnManager.js';
import { SettingsModal } from './ui/FormationModal.js';
import { PowerRatioController } from './ui/SettingsPanel.js';
import { BOARD_SPIN_STEP, boardSpinFabVisible, canBoardSpin, canBoardSpinButton, isBoardSpinTap, isBoardSpinTarget } from './ui/BoardSpin.js';
import { GUIDE_LINE_KEY, KILL_CAM, ResponsiveViewport, ThreeRenderer, shouldAttachKillCam } from './ui/ThreeRenderer.js';
import { isActionCamEnabled, isRearrangeAskEnabled, shouldBlockSettingsToLobby } from './ui/PlayPrefs.js';
import { aimChargeRatio, applyPowerFill, timerRingOffset } from './ui/HudPower.js';
import { exitGame, shouldQuitFromLobbyClose } from './ui/GameExit.js';
import { resultSubLine } from './physics/ResultBeat.js';
import { soundEngine } from './audio/SoundEngine.js';
import { RealtimeManager, bindPresenceUnload } from './network/RealtimeManager.js';
import {
  DUAL_HINT,
  dualGuestHref,
  isDualGuestSearch,
  isDualSearch,
  mountDualGuestFrame,
  openDualMatch,
  shouldSpawnDualGuestFrame,
} from './network/DualMock.js';
import {
  AI_ACCEPT_HINT,
  AI_LOBBY_NICKNAME,
  AI_LOBBY_USER_ID,
  isLobbyAiUser,
  mergeLobbyAiSeat,
  packAiWallet,
  readAiAcorns,
  settleAiAcorns,
  shouldApplyAiWallet,
  writeAiAcorns,
} from './network/LobbyAi.js';
import { createRealtimeClient, isLoopTestSearch, readSupabaseConfig, readViteSupabaseEnv } from './network/RealtimeClient.js';
import {
  LOBBY_CAP,
  dedupePresenceUsers,
  filterOwnIdleRooms,
  idleLobbyPresence,
  mergeSelfPresence,
  applyLivePresence,
  retainKnownPeers,
  presenceFromMatch,
  presenceViewKey,
  roomTitle,
  openRoomCount,
  roomsFromPresence,
  canJoinPvpFromLobby,
  canJoinPvpRoom,
  canSpectatePvpRoom,
  isLobbyFullStatus,
  isPvpWaiting,
  SPECTATE_LOCAL_HINT,
  lobbyGuideLine,
  hasLivePvpMatch,
  LOBBY_MODE_HINT,
  PVP_BUSY_GUIDE,
  roomStatusLabel,
  watcherLine,
} from './network/LobbyRooms.js';
import {
  applySeededPresence,
  seedPlayingGuests,
} from './network/LobbySeed.js';
import {
  LOCATION_GUIDE,
  MY_NICK_LABEL,
  NICKNAME_HINT,
  NICKNAME_LOCKED_HINT,
  NICKNAME_MAX,
  canChangeNickname,
  clearPermanentNickname,
  funAiNickname,
  matchSeatNames,
} from './network/Nickname.js';
import {
  PVP_WAIT_HINT,
  canStartMatch,
  firstPlayerId,
  firstStoneColor,
  overlayRoomAcorns,
  isPeerBoardReady,
  isPeerMatchStarted,
  presenceStartedFlag,
  isHostStartPending,
  isRematchWait,
  shouldArmCampWait,
  shouldFollowPeerStart,
  shouldGuestFollowHostStart,
  shouldHoldPvpStartGate,
  shouldReplayHostStart,
  shouldPollGuestStart,
  shouldStartWithoutPeer,
  startResetMode,
  usesPeerStart,
} from './network/MatchStart.js';
import {
  CAMP_WAIT_MS,
  HOST_CLOCK_MS,
  TURN_END_WATCHDOG_MS,
  canApplyRemoteBoard,
  isLaunchSync,
  isStaleEndedMatchSync,
  mergeCampLayouts,
  packStoneSync,
  nextMatchBoardReady,
  resetLiveSyncSession,
  shouldAcceptMatchBoard,
  shouldIgnoreLaunchPause,
  shouldApplyMatchSync,
  shouldFireTurnEndWatchdog,
  shouldApplyRematchStart,
  shouldFollowRemoteStart,
  shouldOpenGuestFromHostLive,
  shouldHoldGuestUntilHostBoard,
  shouldPauseMatchRunner,
  shouldIgnoreLateStartReplay,
  shouldPublishHostClock,
  shouldSyncSceneAfterHostStart,
  shouldPublishMatchSync,
  shouldPublishSettledTurnEnd,
  shouldPulseMatchSync,
  shouldTickLocalTurnTimer,
  shouldExpireLocalTurn,
  shouldNoteMatchSyncSeq,
  shouldWakeMatchOnSync,
} from './network/MatchSync.js';
import {
  applyRoomAck,
  applyRoomGuest,
  applyRoomClearInvite,
  applyRoomInvite,
  applyRoomLeave,
  applyRoomRematch,
  applyRoomStart,
  incomingResetsForRematch,
  resetRoomForIncomingRematch,
  createRoomState,
  PVP_ROOM_ID,
  normalizePvpRoomId,
  incomingClearsOpponent,
  shouldApplyPresenceOpponentLoss,
  mergeRoomState,
  pvpSeatColor,
  roomHasOpponent,
  roomMatchGen,
  shouldApplyRoomState,
  shouldKeepPvpRematch,
  shouldReturnToPvpWait,
  stampRoomAcorns,
} from './network/RoomState.js';
import {
  READY_ASK,
  READY_NO,
  READY_YES,
  answerReady,
  createMatchReady,
  isPeerRearranging,
  skipReadyAsk,
  startGateHint,
  stepMatchReady,
} from './network/MatchReady.js';
import {
  acornSettleKey,
  clearAcornHistory,
  parseAcorn,
  settleSessionAcorns,
  shouldForfeitOnLeave,
  shouldForfeitOnOpponentGone,
  shouldSettleAcorns,
} from './network/AcornPolicy.js';
import {
  newNightUserId,
  readNightAcorns,
  readNightUserId,
  takeNightUserId,
  writeNightAcorns,
  writeNightClaim,
} from './network/NightSession.js';
import { isLiveRealtime, runLobbyClinic } from './network/LobbyClinic.js';
import { STALE_LEAVE_HINT, SWEEP_LEAVE_HINT } from './network/PresencePolicy.js';
import {
  INVITE_NICK_PLACEHOLDER,
  INVITE_ROOM_GONE_HINT,
  attemptInviteJoin,
  LOBBY_INVITE_ACCEPT,
  LOBBY_INVITE_BTN,
  LOBBY_INVITE_DECLINE,
  LOBBY_INVITE_EMPTY,
  LOBBY_INVITE_HINT,
  LOBBY_INVITE_SENT,
  canInviteLobbyUser,
  joinedMatchRoomId,
  clearInviteQuery,
  evaluateInviteJoin,
  evaluateLobbyInvite,
  shouldOfferLobbyInvite,
  findInviteRoom,
  inviteMissFallback,
  guestInviteNickname,
  idleLobbyInvitees,
  buildInviteReply,
  announceLobbyInvite,
  buildLobbyInvite,
  guestClaimHeld,
  incomingRejectsMyGuestSeat,
  INVITE_ACTION_ACCEPT,
  INVITE_ACTION_CANCEL,
  INVITE_ACTION_DECLINE,
  HELLO_RETRY_MAX,
  HELLO_RETRY_MS,
  buildRoomAck,
  buildRoomHello,
  shouldApplyRoomAck,
  lobbyInviteAsk,
  pickJoinablePvp,
  roomFromInvite,
  shouldApplyInviteAccept,
  shouldApplyInviteDecline,
  shouldDismissInviteModal,
  shouldKeepHostInviteSheet,
  peerJoiningHostRoom,
  presenceInvitePayload,
  shouldOpenPresenceInvite,
  sentInviteFields,
  shouldRepublishOpenRoom,
  readStoredInviteRoom,
  resolveInviteRoom,
  writeStoredInviteRoom,
  inviteUrlFor,
  persistInviteNickname,
  PVP_GUIDE_ASK,
  PVP_ROOM_HINT,
  PVP_WAIT_EXPIRE_HINT,
  PVP_WAIT_EXPIRE_MS,
  PVP_PEER_GONE_HINT,
  readInvitePrefill,
  readInviteRoomId,
  roomOpenedAt,
  shareOrCopyInvite,
  shareViaKakaoTalk,
  shouldExpirePvpWait,
  shouldInvitePvp,
} from './network/PvpInvite.js';
import {
  BOOK_SKIP_LABEL,
  BOOK_PLAY_LABEL,
  INVITE_ONLY_NOTICE,
  INVITE_ONLY_OK,
  guidePageAt,
  guidePageCount,
  hasSeenInviteOnlyNotice,
  hasSkipGuideOnConnect,
  markGuideBookSeen,
  markInviteOnlyNoticeSeen,
  renderClinicList,
  renderGuidePage,
  setSkipGuideOnConnect,
  shouldAutoOpenGuideBook,
  shouldOfferInviteOnlyNotice,
} from './ui/GuideBook.js';
import {
  advanceTutorial,
  createTutorialState,
  isTutorialDone,
  startTutorialState,
  tutorialStep,
} from './ui/Tutorial.js';

const table = document.getElementById('table');
const stage = document.getElementById('stage');
const canvas = document.getElementById('board');
const powerFill = document.getElementById('power-fill');
const matchBadge = document.getElementById('match-badge');
const matchTimer = document.getElementById('match-timer');
const timerRing = document.getElementById('timer-ring');
const acornCount = document.getElementById('acorn-count');
const guideBtn = document.getElementById('guide-btn');
const resultModal = document.getElementById('result-modal');
const resultTitle = document.getElementById('result-title');
const resultSub = document.getElementById('result-sub');
const spectatorBadge = document.getElementById('spectator-badge');
const lobbyToggle = document.getElementById('lobby-toggle');
const lobbyUsers = document.getElementById('lobby-users');
const lobbyList = document.getElementById('lobby-list');
const lobbyClose = document.getElementById('lobby-close');
const lobbyOverlay = document.getElementById('lobby-overlay');
const userCount = document.getElementById('user-count');
const nickInput = document.getElementById('lobby-nick-input');
const nickHint = document.getElementById('lobby-nick-hint');
const nickSave = document.getElementById('lobby-nick-save');
const inviteCopyBtn = document.getElementById('invite-copy');
const inviteShareSheet = document.getElementById('invite-share-sheet');
const inviteShareKakao = document.getElementById('invite-share-kakao');
const inviteShareApps = document.getElementById('invite-share-apps');
const inviteShareCopy = document.getElementById('invite-share-copy');
const inviteShareClose = document.getElementById('invite-share-close');
const inviteModal = document.getElementById('invite-nick-modal');
const guestNickInput = document.getElementById('guest-nickname-input');
const inviteEnterBtn = document.getElementById('btn-enter-room');
const inviteNickDesc = document.getElementById('invite-nick-desc');
const seatNameBlack = document.getElementById('seat-name-black');
const seatNameWhite = document.getElementById('seat-name-white');
const spectateBar = document.getElementById('spectate-bar');
const seatWatchers = document.getElementById('seat-watchers');
const tickerText = document.getElementById('ticker-billboard-text');
const pullBlockToast = document.getElementById('pull-block-toast');
let pullBlockToastTimer = 0;

const renderer = new ThreeRenderer(canvas);
const engine = new GameEngine({
  element: canvas,
  autoStart: true,
  soundEngine,
  mapPointer: (event) => renderer.pointerToMatter(event),
});
const turnManager = new TurnManager({ engine });

let boardSpinPending = null;

function boardSpinState() {
  return {
    inMatch: inMatchRoom,
    matchStarted,
    lobby: lobbyVisible,
    spectating: engine.phase === PHASE.SPECTATING,
    gameOver: engine.phase === PHASE.GAME_OVER,
    paused: Boolean(engine.isPaused?.()),
    placementOnly: Boolean(engine.placementOnly),
    killCam: Boolean(renderer.killCam),
    aiming: Boolean(engine.aim),
    inputBlocked: engine.isHumanInputBlocked(),
    phase: engine.phase,
  };
}

function syncBoardSpinBtn() {
  const state = boardSpinState();
  const hidden = !boardSpinFabVisible(state);
  const disabled = !canBoardSpinButton(state);
  for (const id of ['board-spin-btn', 'board-spin-ccw']) {
    const btn = document.getElementById(id);
    if (!btn) continue;
    btn.hidden = hidden;
    btn.disabled = disabled;
  }
}

function onBoardSpinDown(event) {
  boardSpinPending = null;
  if (!canBoardSpin(boardSpinState())) return;
  const point = renderer.pointerToMatter(event);
  if (!isBoardSpinTarget(point, engine.getAliveStones(), engine.board)) return;
  boardSpinPending = { id: event.pointerId, x: event.clientX, y: event.clientY };
}

function onBoardSpinMove(event) {
  if (!boardSpinPending || event.pointerId !== boardSpinPending.id) return;
  if (!isBoardSpinTap(boardSpinPending, { x: event.clientX, y: event.clientY })) {
    boardSpinPending = null;
  }
}

function onBoardSpinUp(event) {
  const pending = boardSpinPending;
  boardSpinPending = null;
  if (!pending || event.pointerId !== pending.id) return;
  if (!isBoardSpinTap(pending, { x: event.clientX, y: event.clientY })) return;
  if (!canBoardSpin(boardSpinState())) return;
  const point = renderer.pointerToMatter(event);
  if (!isBoardSpinTarget(point, engine.getAliveStones(), engine.board)) return;
  renderer.nudgeViewYaw();
}

function onBoardSpinCancel(event) {
  if (!boardSpinPending || event.pointerId === boardSpinPending.id) boardSpinPending = null;
}

canvas.addEventListener('pointerdown', onBoardSpinDown);
canvas.addEventListener('pointermove', onBoardSpinMove);
canvas.addEventListener('pointerup', onBoardSpinUp);
canvas.addEventListener('pointercancel', onBoardSpinCancel);

let nightClaim = takeNightUserId({ makeId: newNightUserId });
const realtimeManager = new RealtimeManager({
  supabaseClient: createRealtimeClient(readViteSupabaseEnv()),
  channelName: 'dotori-lobby',
  userId: nightClaim.userId,
  presenceKey: nightClaim.userId,
  userCharacter: '🐶',
  nicknameStorage: globalThis.sessionStorage,
  onPresenceUpdate: (users) => {
    const mapped = users.map((u) => ({
      id: u.userId,
      userId: u.userId,
      presenceKey: u.presenceKey || u.userId,
      nickname: u.nickname,
      character: u.character,
      seat: u.seat,
      status: u.status,
      mode: u.mode,
      roomId: u.roomId,
      acorns: u.acorns,
      rearranging: Boolean(u.rearranging),
      started: Boolean(u.started),
      matchGen: Number(u.matchGen) > 0 ? Math.floor(Number(u.matchGen)) : 0,
      boardReady: Boolean(u.boardReady),
      ended: Boolean(u.ended),
      inviteTargetId: u.inviteTargetId || null,
      inviteAt: u.inviteAt,
      pvpOpenedAt: u.pvpOpenedAt,
      lastSeen: u.lastSeen,
      joinedAt: u.joinedAt,
      isOwner: u.userId === realtimeManager.userId,
    }));
    updateLobbyUserList(applyLivePresence(
      retainKnownPeers(lobbyUserList, mapped, {
        selfId: realtimeManager.userId,
        leftIds: realtimeManager.leftPresenceKeys(),
      }),
      selfPresence(),
    ));
    syncNickField();
  },
  onLobbyFull: () => {
    setTicker(`대기실이 가득 찼습니다 (${LOBBY_CAP}명)`);
  },
  onStaleLeave: () => {
    handleStaleLeave();
  },
  onSweepLeave: () => {
    handleSweepLeave();
  },
  onPvpInvite: (payload) => {
    if (shouldApplyInviteDecline(payload, {
      myId: realtimeManager.userId,
      sentTargetId: sentLobbyInvite?.inviteTargetId,
    })) {
      sentLobbyInvite = null;
      matchRoom = applyRoomClearInvite(matchRoom);
      publishPresence();
      publishRoomState();
      return;
    }
    if (shouldApplyInviteAccept(payload, {
      myId: realtimeManager.userId,
      sentTargetId: sentLobbyInvite?.inviteTargetId,
      roomId: currentMatchRoomId(),
      inRoom: inMatchRoom && engine.phase !== PHASE.SPECTATING,
      guestId: matchRoom?.guestId,
    })) {
      applyHostAcceptedInvite(payload);
      return;
    }
    if (shouldApplyRoomAck(payload, {
      myId: realtimeManager.userId,
      roomId: currentMatchRoomId(),
    })) {
      applyGuestRoomAck(payload);
      return;
    }
    receiveLobbyInvite(payload);
  },
  onRoomState: (payload) => {
    applyIncomingRoomState(payload);
  },
  onAiWallet: (payload) => {
    applyIncomingAiWallet(payload);
  },
  onSpectatorData: (gameState) => {
    applyIncomingMatchSync(gameState);
  },
});

let matchStarted = false;
let suppressResult = false;
clearAcornHistory();
clearPermanentNickname();
let sessionAcorns = readNightAcorns();
acornCount.textContent = String(sessionAcorns);
matchBadge.textContent = '흑 턴 15';

let lobbyVisible = false;
let lobbyUserList = [];
let lastLobbyModeCount = null;
let lastLobbyViewKey = '';
let inMatchRoom = false;
let awaitingStart = false;
let matchReady = null;
let lastPublishedRearranging = false;
let activeRoomId = null;
let joiningRoom = false;
let joiningRoomId = '';
let startingPvp = false;
let matchRoom = null;
let pvpOpenedAt = null;
let pvpExpireTimer = 0;
let pendingInviteRoom = '';
let lastRoomMates = new Set();
let lastTimerSec = -1;
let sentLobbyInvite = null;
const lastSeenInviteAt = new Map();
let lastMatchSyncAt = 0;
let lastMatchSyncTs = 0;
let lastMatchSyncSeq = 0;
let matchSyncSeq = 0;
let lastPeerCamp = null;
let campSentForStart = false;
let lastAcornSettleKey = '';
let aiWallet = packAiWallet({ acorns: readAiAcorns(), seq: 0 });
let helloRetryTimer = 0;
let helloRetryLeft = 0;
let helloRetryInvite = null;
let turnEndWatchdog = 0;
let campWaitTimer = 0;
let lastLaunchAt = 0;
let gotShooterTurnEnd = false;
let emittingStartBoard = false;
let lastHostStartReplayAt = 0;
let lastHostClockAt = 0;
let matchBoardReady = false;
let pendingHostLaunch = null;
let lastHostLaunch = null;
let matchWakeLock = null;

let settingsModal = null;

function applyLobbyDefaultMode(count) {
  const next = defaultGameModeForLobbyCount(count);
  if (!settingsModal) return;
  if (inMatchRoom || joiningRoom || startingPvp) {
    lastLobbyModeCount = count;
    return;
  }
  if (next == null || engine.gameMode === GAME_MODE.AI || engine.gameMode === GAME_MODE.SOLO || engine.gameMode === GAME_MODE.PVP) {
    lastLobbyModeCount = count;
    return;
  }
  if (engine.gameMode === next) {
    lastLobbyModeCount = count;
    return;
  }
  if (lastLobbyModeCount === count) return;
  if (!shouldApplyLobbyDefaultMode(engine.getSnapshot(), next, {
    inRoom: inMatchRoom,
    joining: joiningRoom,
    startingPvp,
  })) return;
  lastLobbyModeCount = count;
  settingsModal.syncLobbyDefaultMode(next);
}

function readGuideEnabled() {
  try {
    const raw = localStorage.getItem(GUIDE_LINE_KEY);
    if (raw == null) return true;
    return raw === '1' || raw === 'true' || raw === 'on';
  } catch {
    return true;
  }
}

function setTicker(text) {
  if (tickerText) tickerText.textContent = text;
}

function syncNickField() {
  if (nickInput && document.activeElement !== nickInput) {
    nickInput.value = realtimeManager.userNickname || '';
  }
  syncNickLock();
}

function pvpOpponentName() {
  const mine = realtimeManager.userId;
  const roomId = currentMatchRoomId();
  const other = lobbyUserList.find((u) => (
    (u.userId ?? u.id) !== mine
    && u.mode === GAME_MODE.PVP
    && u.status === 'playing'
    && u.roomId === roomId
    && u.nickname
  ));
  return other?.nickname || '';
}

function currentMatchRoomId() {
  if (engine.phase === PHASE.SPECTATING) return engine.spectatorData?.matchId || '';
  if (engine.gameMode === GAME_MODE.PVP && inMatchRoom) {
    return matchRoom?.roomId || PVP_ROOM_ID;
  }
  return activeRoomId || `room_${realtimeManager.userId}`;
}

function syncWatchers() {
  const rooms = lobbyRooms();
  const room = rooms.find((r) => r.id === currentMatchRoomId());
  let watchers = room?.watchers ? room.watchers.slice() : [];
  if (engine.phase === PHASE.SPECTATING) {
    const mine = realtimeManager.userNickname;
    if (mine && !watchers.some((w) => w.nickname === mine || w.id === realtimeManager.userId)) {
      watchers = [...watchers, { id: realtimeManager.userId, nickname: mine }];
    }
  }
  const line = watcherLine(watchers);
  if (seatWatchers) {
    seatWatchers.textContent = line;
    seatWatchers.hidden = !line;
  }
}

function markSeatMine(el, mine) {
  if (!el) return;
  el.classList.toggle('is-mine', Boolean(mine));
  el.dataset.myNick = mine ? MY_NICK_LABEL : '';
}

function syncSeatNames() {
  if (engine.phase === PHASE.SPECTATING && engine.spectatorData) {
    if (seatNameBlack) seatNameBlack.textContent = engine.spectatorData.playerA || '';
    if (seatNameWhite) seatNameWhite.textContent = engine.spectatorData.playerB || '';
    markSeatMine(seatNameBlack, false);
    markSeatMine(seatNameWhite, false);
    syncWatchers();
    return;
  }
  const mine = realtimeManager.userNickname || '도토리1';
  const names = matchSeatNames({
    mode: engine.gameMode,
    myName: mine,
    opponentName: pvpOpponentName(),
    seed: realtimeManager.userId,
    aiName: funAiNickname(realtimeManager.userId),
  });
  const color = myStoneColor();
  const solo = engine.gameMode === GAME_MODE.SOLO;
  if (seatNameBlack) seatNameBlack.textContent = names.black;
  if (seatNameWhite) seatNameWhite.textContent = names.white;
  markSeatMine(seatNameBlack, solo || color === STONE_COLOR.BLACK);
  markSeatMine(seatNameWhite, solo || color === STONE_COLOR.WHITE);
  syncWatchers();
}

function nickLockState() {
  return {
    inMatch: Boolean(inMatchRoom),
    spectating: engine.phase === PHASE.SPECTATING,
  };
}

function isNickLocked() {
  return !canChangeNickname(nickLockState());
}

function syncNickLock() {
  const locked = isNickLocked();
  if (nickInput) {
    nickInput.readOnly = locked;
    nickInput.disabled = locked;
  }
  if (nickSave) nickSave.disabled = locked;
  if (nickHint) {
    nickHint.textContent = locked ? NICKNAME_LOCKED_HINT : NICKNAME_HINT;
    nickHint.classList.toggle('is-warn', false);
  }
}

function saveNickname() {
  if (!nickInput || isNickLocked()) return;
  const result = realtimeManager.setDisplayNickname(nickInput.value, { locked: isNickLocked() });
  nickInput.value = result.nickname;
  if (nickHint) {
    nickHint.textContent = result.renamed ? result.hint : (result.ok ? NICKNAME_HINT : result.hint);
    nickHint.classList.toggle('is-warn', !result.ok || Boolean(result.renamed));
  }
  publishPresence();
  syncSeatNames();
}

function showPullBlockToast(message = PULL_BLOCK_NOTICE) {
  if (!pullBlockToast) return;
  pullBlockToast.textContent = message;
  pullBlockToast.hidden = false;
  if (pullBlockToastTimer) clearTimeout(pullBlockToastTimer);
  pullBlockToastTimer = setTimeout(() => {
    pullBlockToast.hidden = true;
    pullBlockToastTimer = 0;
  }, 1600);
}

function hideResult() {
  resultModal.hidden = true;
}

function showResult(payload) {
  const ai = engine.gameMode === GAME_MODE.AI;
  if (payload.winner === 'draw') {
    resultTitle.textContent = '무승부';
  } else if (ai && payload.winner === STONE_COLOR.BLACK) {
    resultTitle.textContent = '승리!';
  } else if (ai && payload.winner === STONE_COLOR.WHITE) {
    resultTitle.textContent = '패배 (AI 승리)';
  } else {
    resultTitle.textContent = payload.winner === STONE_COLOR.BLACK ? '흑 승' : '백 승';
  }
  resultSub.textContent = resultSubLine(payload, engine.gameMode);
  resultModal.hidden = false;
}

function showSpectatorBadge(playerA, playerB) {
  const spectatorText = spectatorBadge.querySelector('.spectator-text');
  spectatorText.textContent = `실시간 관전 중 (${playerA} vs ${playerB})`;
  spectatorBadge.hidden = false;
  if (spectateBar) spectateBar.hidden = false;
}

function hideSpectatorBadge() {
  spectatorBadge.hidden = true;
  if (spectateBar) spectateBar.hidden = true;
}

function toggleLobby() {
  if (lobbyVisible) hideLobby();
  else showLobby();
}

function syncAcornHud() {
  if (acornCount) acornCount.textContent = String(sessionAcorns);
}

function myAcorns() {
  return sessionAcorns;
}

function myStoneColor() {
  const seat = pvpSeatColor({
    myId: realtimeManager.userId,
    hostId: matchRoom?.hostId,
    roomId: currentMatchRoomId(),
  });
  return seat === STONE_COLOR.WHITE ? STONE_COLOR.WHITE : STONE_COLOR.BLACK;
}

function isMatchHost() {
  if (matchRoom?.hostId) return String(matchRoom.hostId) === String(realtimeManager.userId);
  return myStoneColor() === STONE_COLOR.BLACK;
}

function currentAiAcorns() {
  return parseAcorn(aiWallet?.acorns, readAiAcorns());
}

function publishAiWallet() {
  const payload = packAiWallet({
    acorns: currentAiAcorns(),
    seq: aiWallet.seq,
    settleKey: aiWallet.settleKey,
  });
  return realtimeManager.broadcastAiWallet(payload);
}

function applyIncomingAiWallet(payload) {
  if (!shouldApplyAiWallet(payload, aiWallet)) return false;
  const next = writeAiAcorns(payload.acorns);
  aiWallet = packAiWallet({
    acorns: next,
    seq: payload.seq,
    settleKey: payload.settleKey,
    timestamp: payload.timestamp,
  });
  if (isLobbyAiUser(matchRoom?.guestId)) {
    matchRoom = stampRoomAcorns(matchRoom, { myId: AI_LOBBY_USER_ID, acorns: next });
  }
  lastLobbyViewKey = '';
  updateLobbyUserList(lobbyUserList);
  return true;
}

function applyAcornResult(payload) {
  const settleKey = acornSettleKey({
    roomId: currentMatchRoomId(),
    matchGen: matchRoom?.matchGen,
    winner: payload?.winner,
  });
  const result = {
    mode: engine.gameMode,
    started: matchStarted,
    winner: payload?.winner,
    myColor: myStoneColor(),
    spectating: engine.phase === PHASE.SPECTATING,
    settleKey,
    lastSettledKey: lastAcornSettleKey,
  };
  const settled = shouldSettleAcorns(result);
  if (settled) lastAcornSettleKey = settleKey;
  sessionAcorns = writeNightAcorns(settleSessionAcorns(sessionAcorns, result));
  if (settled && isLobbyAiUser(matchRoom?.guestId)) {
    const nextAi = writeAiAcorns(settleAiAcorns(currentAiAcorns(), { ...result, aiOpponent: true }));
    aiWallet = packAiWallet({
      acorns: nextAi,
      seq: (Number(aiWallet.seq) || 0) + 1,
      settleKey,
    });
    matchRoom = stampRoomAcorns(matchRoom, { myId: AI_LOBBY_USER_ID, acorns: nextAi });
    void publishAiWallet();
    lastLobbyViewKey = '';
    updateLobbyUserList(lobbyUserList);
  }
  syncAcornHud();
  if (matchRoom?.roomId) publishRoomState();
}

function livePresencePool() {
  return applyLivePresence(
    [...lobbyUserList, ...Array.from(realtimeManager.onlineUsers.values())],
    selfPresence(),
  );
}

function matchPlayers() {
  return overlayRoomAcorns([], matchRoom, {
    myId: realtimeManager.userId,
    myAcorns: myAcorns(),
  });
}

function handshakeReady() {
  if (engine.gameMode !== GAME_MODE.PVP) return true;
  return roomHasOpponent(matchRoom);
}

function canStartNow() {
  if (engine.gameMode === GAME_MODE.PVP && !handshakeReady()) return false;
  if (engine.gameMode === GAME_MODE.PVP && matchRoom?.started && !matchStarted) return false;
  return canStartMatch({
    mode: engine.gameMode,
    userId: realtimeManager.userId,
    players: matchPlayers(),
    room: matchRoom,
  });
}

function currentReadyView(now = (typeof performance !== 'undefined' ? performance.now() : Date.now())) {
  return stepMatchReady(matchReady, now, {
    peerRearranging: isPeerRearranging(lobbyUserList, realtimeManager.userId, currentMatchRoomId()),
    askEnabled: isRearrangeAskEnabled(),
  });
}

function clearMatchReady() {
  matchReady = null;
  lastPublishedRearranging = false;
  engine.setPlacementOnly(false);
}

function beginMatchReady() {
  engine.setHost(myStoneColor() === STONE_COLOR.BLACK);
  matchReady = createMatchReady(typeof performance !== 'undefined' ? performance.now() : Date.now());
  lastPublishedRearranging = false;
  engine.setPlacementOnly(false);
}

function answerMatchReady(yes) {
  if (!awaitingStart || !matchReady || matchReady.answer != null) return;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  matchReady = answerReady(matchReady, yes, now);
  const view = currentReadyView(now);
  engine.setPlacementOnly(view.rearranging);
  lastPublishedRearranging = view.rearranging;
  publishPresence();
  syncStartGate();
}

function skipReadyAskNow() {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  matchReady = skipReadyAsk(matchReady ?? createMatchReady(now), now);
  if (matchReady.answer == null) matchReady = answerReady(matchReady, false, now);
  engine.setPlacementOnly(false);
  lastPublishedRearranging = false;
  publishPresence();
  syncStartGate();
}

function tickMatchReady() {
  if (beginMatchFromPeer()) return;
  if (!inMatchRoom || !awaitingStart || engine.phase === PHASE.SPECTATING) return;
  if (!matchReady) beginMatchReady();
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  let view = currentReadyView(now);
  if (view.answer == null && !view.askVisible) {
    matchReady = answerReady(matchReady, false, now);
    view = currentReadyView(now);
  }
  if (engine.placementOnly !== view.rearranging) {
    engine.setPlacementOnly(view.rearranging);
  }
  if (lastPublishedRearranging !== view.rearranging) {
    lastPublishedRearranging = view.rearranging;
    publishPresence();
  }
  syncStartGate();
}

function syncStartGate() {
  const gate = document.getElementById('match-start-gate');
  const hint = document.getElementById('pvp-start-hint');
  const btn = document.getElementById('match-start');
  const askBox = document.getElementById('ready-ask-box');
  const ask = document.getElementById('ready-ask');
  const yesBtn = document.getElementById('ready-ask-yes');
  const noBtn = document.getElementById('ready-ask-no');
  const show = inMatchRoom && awaitingStart && engine.phase !== PHASE.SPECTATING;
  if (gate) gate.hidden = !show;
  if (!show) {
    stage?.classList.remove('is-rearranging');
    hint?.classList.remove('is-rearrange-count');
    if (askBox) askBox.hidden = true;
    if (inviteCopyBtn) inviteCopyBtn.hidden = true;
    return;
  }
  const view = currentReadyView();
  const pvp = engine.gameMode === GAME_MODE.PVP;
  const ready = handshakeReady();
  stage?.classList.toggle('is-rearranging', Boolean(view.rearranging));
  if (ask) ask.textContent = READY_ASK;
  if (yesBtn) yesBtn.textContent = READY_YES;
  if (noBtn) noBtn.textContent = READY_NO;
  if (askBox) askBox.hidden = !view.askVisible;
  if (btn) {
    btn.hidden = !view.startVisible;
    btn.disabled = !canStartNow();
    const lead = firstPlayerId(matchPlayers(), matchRoom, { mode: engine.gameMode, userId: realtimeManager.userId });
    btn.title = !ready
      ? PVP_WAIT_HINT
      : pvp && lead && lead !== realtimeManager.userId ? '선공만 시작할 수 있습니다' : '시작';
  }
  const hintView = startGateHint({
    rearranging: view.rearranging,
    rearrangeCount: view.rearrangeCount,
    peerRearranging: view.peerRearranging,
    pvp,
    ready,
    hostStartPending: isHostStartPending({
      isHost: isMatchHost(),
      awaitingStart,
      matchStarted,
      roomStarted: Boolean(matchRoom?.started),
    }),
    startVisible: view.startVisible,
    firstHint: view.firstHint,
    room: matchRoom,
  });
  if (hint) {
    const hintShow = Boolean(hintView.text);
    hint.hidden = !hintShow;
    hint.classList.toggle('is-rearrange-count', hintView.kind === 'count');
    hint.classList.toggle('is-coin-toss', hintView.kind === 'coin');
    hint.dataset.face = hintView.face === 'front' ? '앞' : hintView.face === 'back' ? '뒤' : '';
    if (hintShow) hint.textContent = hintView.text;
  }
  syncInviteShare();
}

function peerHasStartedMatch() {
  return Boolean(matchRoom?.started) || isPeerMatchStarted(lobbyUserList, {
    myId: realtimeManager.userId,
    roomId: currentMatchRoomId(),
    matchGen: roomMatchGen(matchRoom),
  });
}

function clearSentLobbyInvite() {
  sentLobbyInvite = null;
}

function publishRoomState() {
  if (!matchRoom?.roomId || !matchRoom?.hostId) return false;
  matchRoom = stampRoomAcorns(matchRoom, {
    myId: realtimeManager.userId,
    acorns: myAcorns(),
  });
  return realtimeManager.broadcastRoomState(matchRoom);
}

function syncMatchRoom(next) {
  if (!next?.roomId) return;
  matchRoom = next;
  if (inMatchRoom) activeRoomId = next.roomId;
  if (roomHasOpponent(matchRoom)) clearSentLobbyInvite();
  syncInviteShare();
  syncStartGate();
}

function applyIncomingRoomState(payload) {
  if (!shouldApplyRoomState(payload, {
    myId: realtimeManager.userId,
    roomId: inMatchRoom ? currentMatchRoomId() : payload?.roomId,
    inRoom: inMatchRoom && engine.phase !== PHASE.SPECTATING,
  })) return false;
  if (incomingRejectsMyGuestSeat(matchRoom, payload, realtimeManager.userId)) {
    bounceRejectedJoin();
    return true;
  }
  if (incomingClearsOpponent(matchRoom, payload)) {
    const wasStarted = matchStarted;
    const phase = engine.phase;
    syncMatchRoom(applyRoomLeave(matchRoom, { leaverId: payload?.leaverId }));
    if (shouldForfeitOnOpponentGone({
      mode: engine.gameMode,
      started: wasStarted,
      phase,
      spectating: phase === PHASE.SPECTATING,
      hadOpponent: true,
      hasOpponent: false,
    })) {
      forfeitOpponent(payload?.leaverId);
      return true;
    }
    returnToPvpWait();
    return true;
  }
  if (incomingResetsForRematch(matchRoom, payload)) {
    followPvpRematch(payload);
    if (payload?.started === true) applyMatchStarted({ publishStart: false });
    return true;
  }
  const next = mergeRoomState(matchRoom, payload);
  if (!next) return false;
  syncMatchRoom(next);
  if (next.acked) stopHelloRetry();
  if (next.started && awaitingStart && !matchStarted) {
    if (!campSentForStart) {
      campSentForStart = true;
      publishCampLayout();
    }
    if (isMatchHost() && lastPeerCamp) emitHostStartBoard();
    else if (isMatchHost()) armCampWait();
    else if (shouldGuestFollowHostStart({
      isHost: false,
      awaitingStart,
      matchStarted,
      roomStarted: true,
      mode: engine.gameMode,
    })) {
      applyMatchStarted({ publishStart: false });
    }
  }
  beginMatchFromPeer();
  return true;
}

function currentSentInvite() {
  return sentInviteFields({
    inRoom: inMatchRoom,
    started: matchStarted,
    mode: engine.gameMode,
    sent: sentLobbyInvite,
    hasOpponent: roomHasOpponent(matchRoom),
  });
}

function inviteOfferState() {
  return {
    spectating: engine.phase === PHASE.SPECTATING,
    matchStarted,
    roomStarted: Boolean(matchRoom?.started),
    inRoom: inMatchRoom && engine.phase !== PHASE.SPECTATING,
    joining: joiningRoom,
    isHost: isMatchHost(),
    hasOpponent: roomHasOpponent(matchRoom),
  };
}

function syncPresenceInvites(users) {
  if (pendingLobbyInvite) return;
  if (!shouldOfferLobbyInvite(inviteOfferState())) return;
  for (const user of users || []) {
    const hostId = String(user?.userId ?? user?.id ?? '');
    if (!shouldOpenPresenceInvite(user, realtimeManager.userId, lastSeenInviteAt.get(hostId) || 0)) {
      continue;
    }
    const verdict = evaluateLobbyInvite(presenceInvitePayload(user), realtimeManager.userId);
    if (!verdict.ok) continue;
    lastSeenInviteAt.set(hostId, Number(user.inviteAt) || Date.now());
    openLobbyInviteModal(verdict.invite);
    return;
  }
}

function firstPlayerColor() {
  return firstStoneColor({
    mode: engine.gameMode,
    players: matchPlayers(),
    room: matchRoom,
    userId: realtimeManager.userId,
  });
}

function ownCampStones() {
  const color = myStoneColor();
  return engine.stones
    .filter((stone) => stone?.color === color)
    .map(packStoneSync)
    .filter(Boolean);
}

function publishCampLayout() {
  if (engine.gameMode !== GAME_MODE.PVP || !inMatchRoom) return false;
  return publishMatchSync({ force: true, event: 'camp', stones: ownCampStones() });
}

function clearTurnEndWatchdog() {
  if (turnEndWatchdog) clearTimeout(turnEndWatchdog);
  turnEndWatchdog = 0;
}

function armTurnEndWatchdog() {
  if (!isMatchHost() || awaitingStart) return;
  clearTurnEndWatchdog();
  const launchedAt = lastLaunchAt;
  turnEndWatchdog = setTimeout(() => {
    turnEndWatchdog = 0;
    if (!inMatchRoom || awaitingStart || gotShooterTurnEnd) return;
    if (!shouldFireTurnEndWatchdog({
      isHost: true,
      awaitingStart,
      launchedAt,
      now: Date.now(),
      gotShooterTurnEnd,
    })) return;
    publishMatchSync({ force: true, event: 'turnEnd' });
  }, TURN_END_WATCHDOG_MS);
}

function clearCampWait() {
  if (campWaitTimer) clearTimeout(campWaitTimer);
  campWaitTimer = 0;
}

function armCampWait() {
  if (!isMatchHost() || !awaitingStart) return;
  if (!shouldArmCampWait(Boolean(campWaitTimer))) return;
  campWaitTimer = setTimeout(() => {
    campWaitTimer = 0;
    if (awaitingStart && matchRoom?.started) emitHostStartBoard();
  }, CAMP_WAIT_MS);
}

function replayHostStartForGuest() {
  if (!shouldReplayHostStart({
    isHost: isMatchHost(),
    matchStarted,
    guestStarted: isPeerBoardReady(lobbyUserList, {
      myId: realtimeManager.userId,
      roomId: currentMatchRoomId(),
      matchGen: roomMatchGen(matchRoom),
    }),
    hasOpponent: roomHasOpponent(matchRoom),
    lastReplayAt: lastHostStartReplayAt,
    now: Date.now(),
    localPhase: engine.phase,
    hasLaunched: Boolean(lastHostLaunch),
  })) return false;
  lastHostStartReplayAt = Date.now();
  publishRoomState();
  return publishMatchSync({ force: true, event: 'start' });
}

function emitHostStartBoard() {
  if (!isMatchHost() || emittingStartBoard) return false;
  emittingStartBoard = true;
  clearCampWait();
  try {
    const hostCamp = engine.stones.filter((stone) => stone?.color === STONE_COLOR.BLACK);
    const guestCamp = lastPeerCamp?.stones
      || engine.stones.filter((stone) => stone?.color === STONE_COLOR.WHITE);
    const merged = mergeCampLayouts(hostCamp, guestCamp);
    engine.applyRemoteMatchState({
      event: 'start',
      phase: PHASE.IDLE,
      currentTurn: firstPlayerColor(),
      winner: null,
      stones: merged,
      started: true,
    });
    applyMatchStarted({ publishStart: false });
    matchBoardReady = true;
    publishMatchSync({ force: true, event: 'start', stones: merged });
    return true;
  } finally {
    emittingStartBoard = false;
  }
}

function applyMatchStarted({ publishStart = false } = {}) {
  if (!awaitingStart) return false;
  const localStart = shouldStartWithoutPeer(engine.gameMode);
  if (engine.phase === PHASE.GAME_OVER || engine.winner) {
    engine.setHost(localStart || pvpSeatColor({
      myId: realtimeManager.userId,
      hostId: matchRoom?.hostId,
      roomId: matchRoom?.roomId,
    }) === STONE_COLOR.BLACK);
    engine.setMatchConfig({
      mode: startResetMode(engine.gameMode),
      difficulty: engine.aiDifficulty,
    });
  }
  awaitingStart = false;
  matchStarted = true;
  campSentForStart = false;
  lastPeerCamp = null;
  clearSentLobbyInvite();
  clearCampWait();
  pvpOpenedAt = null;
  clearPvpWaitExpire();
  clearMatchReady();
  if (!localStart) matchRoom = applyRoomStart(matchRoom);
  soundEngine.playStart();
  syncStartGate();
  syncSceneMode();
  renderer.snapSeat(engine.getSnapshot());
  publishPresence();
  if (!localStart) publishRoomState();
  if (publishStart && isMatchHost()) {
    publishMatchSync({ force: true, event: 'start' });
  }
  return true;
}

function publishMatchSync({ force = false, event = '', launch = null, stones = null } = {}) {
  const watching = engine.phase === PHASE.SPECTATING;
  const pvpLive = engine.gameMode === GAME_MODE.PVP && inMatchRoom && !watching;
  if (!shouldPublishMatchSync({
    inPvp: pvpLive,
    isHost: isMatchHost(),
    force,
    event,
  })) return false;
  if (!force && awaitingStart) return false;
  const now = Date.now();
  if (!force && now - lastMatchSyncAt < 180) return false;
  lastMatchSyncAt = now;
  matchSyncSeq += 1;
  const packed = Array.isArray(stones) ? stones : engine.getSnapshot().stones;
  return realtimeManager.broadcastSpectatorData({
    ...engine.getSnapshot(),
    stones: packed,
    matchId: currentMatchRoomId(),
    roomId: currentMatchRoomId(),
    senderId: realtimeManager.userId,
    started: matchStarted || event === 'start' || event === 'camp',
    timestamp: now,
    event,
    kind: event === 'launch' ? 'launch' : event === 'camp' ? 'camp' : 'board',
    launch,
    stoneId: launch?.stoneId,
    x: launch?.x ?? launch?.position?.x,
    y: launch?.y ?? launch?.position?.y,
    velocity: launch?.velocity,
    force: launch?.force,
    power: launch?.power,
    color: launch?.color,
    seq: matchSyncSeq,
    matchGen: roomMatchGen(matchRoom),
  });
}

function noteIncomingMatchSeq(payload) {
  if (!shouldNoteMatchSyncSeq({
    event: isLaunchSync(payload) ? 'launch' : (payload?.event || ''),
    boardReady: matchBoardReady,
  })) return;
  lastMatchSyncTs = Number(payload?.timestamp) || lastMatchSyncTs;
  const seq = Number(payload?.seq);
  if (Number.isFinite(seq) && seq > 0) lastMatchSyncSeq = seq;
}

function flushPendingHostLaunch() {
  const shot = pendingHostLaunch;
  if (!shot || awaitingStart || applyingMatchSync) return false;
  pendingHostLaunch = null;
  return applyIncomingMatchSync(shot);
}

let applyingMatchSync = false;

function applyIncomingMatchSync(payload) {
  if (applyingMatchSync) {
    if (isLaunchSync(payload)) pendingHostLaunch = payload;
    return false;
  }
  applyingMatchSync = true;
  let applied = false;
  try {
    applied = applyIncomingMatchSyncBody(payload);
  } catch {
    applied = false;
  } finally {
    applyingMatchSync = false;
  }
  if (pendingHostLaunch && !awaitingStart) flushPendingHostLaunch();
  return applied;
}

function applyIncomingMatchSyncBody(payload) {
  const spectating = engine.phase === PHASE.SPECTATING;
  if (!shouldApplyMatchSync(payload, {
    myId: realtimeManager.userId,
    roomId: currentMatchRoomId(),
    lastTs: lastMatchSyncTs,
    lastSeq: lastMatchSyncSeq,
    matchGen: roomMatchGen(matchRoom),
    spectating,
    inPvp: inMatchRoom && engine.gameMode === GAME_MODE.PVP,
    boardReady: matchBoardReady,
    awaitingStart,
  })) return false;
  const haveSeats = Boolean(matchRoom?.hostId && payload?.senderId);
  if (!shouldAcceptMatchBoard({
    isHost: haveSeats ? isMatchHost() : null,
    senderIsHost: haveSeats
      ? String(payload.senderId) === String(matchRoom.hostId)
      : null,
    event: isLaunchSync(payload) ? 'launch' : (payload?.event || ''),
  })) return false;
  if (isStaleEndedMatchSync({
    awaitingStart,
    started: matchStarted,
    remotePhase: payload?.phase,
    remoteWinner: payload?.winner,
  })) return false;
  if (shouldApplyRematchStart({
    localPhase: engine.phase,
    remoteEvent: payload?.event,
    remoteGen: payload?.matchGen,
    localGen: roomMatchGen(matchRoom),
  })) {
    followPvpRematch({
      ...matchRoom,
      roomId: matchRoom?.roomId || payload?.roomId,
      hostId: matchRoom?.hostId || payload?.hostId,
      guestId: matchRoom?.guestId || payload?.guestId,
      matchGen: payload?.matchGen,
      started: false,
    });
  }
  if (payload?.event === 'camp') {
    noteIncomingMatchSeq(payload);
    lastPeerCamp = payload;
    if (isMatchHost() && awaitingStart && matchRoom?.started) emitHostStartBoard();
    else if (isMatchHost() && matchStarted) replayHostStartForGuest();
    else if (shouldFollowRemoteStart({
      awaitingStart,
      started: matchStarted,
      remoteStarted: payload?.started === true,
      mode: engine.gameMode,
      remotePhase: payload?.phase,
      remoteWinner: payload?.winner,
    })) {
      applyMatchStarted({ publishStart: false });
    }
    return true;
  }
  if (
    shouldOpenGuestFromHostLive({
      awaitingStart,
      matchStarted,
      remoteStarted: payload?.started === true,
      event: isLaunchSync(payload) ? 'launch' : (payload?.event || ''),
    })
    || payload?.event === 'start'
    || shouldFollowRemoteStart({
      awaitingStart,
      started: matchStarted,
      remoteStarted: payload?.started === true && payload?.event === 'start',
      mode: engine.gameMode,
      remotePhase: payload?.phase,
      remoteWinner: payload?.winner,
    })
  ) {
    if (awaitingStart) applyMatchStarted({ publishStart: false });
  }
  if (isLaunchSync(payload)) {
    if (spectating) return false;
    if (awaitingStart) {
      pendingHostLaunch = payload;
      return true;
    }
    const launched = engine.applyRemoteLaunch(payload, {
      ignorePause: shouldIgnoreLaunchPause({
        matchStarted,
        awaitingStart,
        isHost: isMatchHost(),
      }),
      wake: true,
    });
    if (!launched) return false;
    noteIncomingMatchSeq(payload);
    lastLaunchAt = Number(payload?.timestamp) > 0 ? Number(payload.timestamp) : Date.now();
    gotShooterTurnEnd = false;
    armTurnEndWatchdog();
    const wasReady = matchBoardReady;
    matchBoardReady = nextMatchBoardReady({
      applied: true, event: 'launch', previous: matchBoardReady,
    });
    if (matchBoardReady) publishPresence();
    engine.resumeMatch();
    if (shouldSyncSceneAfterHostStart({
      event: 'launch',
      boardReady: matchBoardReady,
      becameReady: matchBoardReady && !wasReady,
    })) {
      syncSceneMode();
    }
    flushMatchView();
    return true;
  }
  if (!spectating && shouldIgnoreLateStartReplay({
    localPhase: engine.phase,
    remoteEvent: payload?.event,
    localTurn: engine.currentTurn,
    remoteTurn: payload?.currentTurn,
    boardReady: matchBoardReady,
    matchStarted,
    awaitingStart,
  })) return false;
  if (!spectating && !canApplyRemoteBoard({
    localPhase: engine.phase,
    remotePhase: payload?.phase,
    localTurn: engine.currentTurn,
    remoteTurn: payload?.currentTurn,
    remoteEvent: payload?.event,
    boardReady: matchBoardReady,
    matchStarted,
    awaitingStart,
    lastLaunchAt,
    remoteTs: payload?.timestamp,
  })) return false;
  noteIncomingMatchSeq(payload);
  const applied = spectating
    ? engine.updateSpectatorState(payload)
    : engine.applyRemoteMatchState(payload);
  if (applied) {
    if (payload?.event === 'turnEnd') {
      gotShooterTurnEnd = true;
      clearTurnEndWatchdog();
    }
    const readyEvent = isLaunchSync(payload) ? 'launch' : (payload?.event || '');
    const wasReady = matchBoardReady;
    matchBoardReady = nextMatchBoardReady({
      applied: true,
      event: readyEvent,
      previous: matchBoardReady,
    });
    if (matchBoardReady && (readyEvent === 'start' || readyEvent === 'turnEnd' || readyEvent === 'launch')) {
      publishPresence();
    }
    if (shouldWakeMatchOnSync({ event: readyEvent })) {
      engine.resumeMatch();
    }
    if (shouldSyncSceneAfterHostStart({
      event: payload?.event,
      boardReady: matchBoardReady,
      becameReady: matchBoardReady && !wasReady,
    })) {
      syncSceneMode();
    }
    flushMatchView();
  }
  return applied;
}

function flushMatchView() {
  const snap = engine.getSnapshot();
  renderer.draw(snap);
  syncHud(snap);
  syncStartGate();
}

function beginMatchIfAllowed() {
  if (!awaitingStart || !canStartNow()) return false;
  if (shouldStartWithoutPeer(engine.gameMode)) {
    return applyMatchStarted({ publishStart: false });
  }
  if (isLobbyAiUser(matchRoom?.guestId)) {
    matchRoom = applyRoomStart(matchRoom);
    return emitHostStartBoard();
  }
  if (!campSentForStart) {
    campSentForStart = true;
    publishCampLayout();
  }
  matchRoom = applyRoomStart(matchRoom);
  let ok = publishRoomState();
  if (!ok) ok = publishRoomState();
  publishPresence();
  if (isMatchHost()) {
    if (lastPeerCamp) return emitHostStartBoard();
    armCampWait();
    syncStartGate();
    return true;
  }
  return applyMatchStarted({ publishStart: false });
}

function beginMatchFromPeer() {
  if (isHostStartPending({
    isHost: isMatchHost(),
    awaitingStart,
    matchStarted,
    roomStarted: Boolean(matchRoom?.started),
  })) return false;
  if (!shouldFollowPeerStart({
    awaitingStart,
    started: matchStarted,
    peerStarted: peerHasStartedMatch(),
    mode: engine.gameMode,
    isHost: isMatchHost(),
    roomStarted: Boolean(matchRoom?.started),
    rematchWait: isRematchWait({
      matchGen: roomMatchGen(matchRoom),
      roomStarted: Boolean(matchRoom?.started),
      matchStarted,
    }),
  })) return false;
  if (!campSentForStart) {
    campSentForStart = true;
    publishCampLayout();
  }
  if (isMatchHost() && lastPeerCamp) return emitHostStartBoard();
  if (isMatchHost()) {
    armCampWait();
    return false;
  }
  return applyMatchStarted({ publishStart: false });
}

function syncSceneMode() {
  const spectating = engine.phase === PHASE.SPECTATING;
  const lobbyMode = !spectating && (!inMatchRoom || lobbyVisible);
  stage.classList.toggle('is-lobby', lobbyMode);
  soundEngine.setAmbience(lobbyMode ? 'lobby' : awaitingStart ? 'wait' : spectating ? 'wait' : 'match');
  if (shouldPauseMatchRunner({
    lobby: lobbyMode,
    awaitingStart,
    roomStarted: Boolean(matchRoom?.started),
    spectating,
  })) {
    turnManager.cancel();
    engine.setLocalTimer(false);
    engine.pauseMatch();
    syncStartGate();
    syncBoardSpinBtn();
    return;
  }
  if (shouldHoldGuestUntilHostBoard({
    isHost: isMatchHost(),
    inPvp: inMatchRoom && engine.gameMode === GAME_MODE.PVP,
    boardReady: matchBoardReady,
    roomStarted: Boolean(matchRoom?.started),
  })) {
    turnManager.cancel();
    engine.setLocalTimer(true);
    engine.setTimerAuthority(false);
    engine.resumeMatch();
    engine.setInputLocked(true);
    if (!tutorial.active) setTicker('판을 맞추는 중');
    syncStartGate();
    syncBoardSpinBtn();
    return;
  }
  engine.setLocalTimer(shouldTickLocalTurnTimer({
    inPvp: inMatchRoom && engine.gameMode === GAME_MODE.PVP,
    isHost: isMatchHost(),
    spectating,
  }));
  engine.setTimerAuthority(shouldExpireLocalTurn({
    inPvp: inMatchRoom && engine.gameMode === GAME_MODE.PVP,
    isHost: isMatchHost(),
    spectating,
  }));
  if (!spectating) {
    engine.resumeMatch();
    turnManager.sync();
  }
  syncStartGate();
  syncBoardSpinBtn();
}

function syncLobbyWaitGuide(rooms = lobbyRooms()) {
  const guide = document.getElementById('lobby-location-guide');
  if (!guide) return;
  const line = lobbyGuideLine(rooms, LOCATION_GUIDE);
  guide.textContent = line.text;
  guide.classList.toggle('is-wait-blink', line.blink);
  guide.classList.toggle('is-pvp-busy', Boolean(line.busy));
}

function syncPvpInvite() {
  const pvpBtn = document.getElementById('lobby-mode-pvp');
  pvpBtn?.classList.remove('is-pvp-busy', 'is-invite-blink');
  if (pvpBtn) pvpBtn.setAttribute('aria-label', '1:1 배제');
}

function closePvpGuidePick() {
  const pick = document.getElementById('pvp-guide-pick');
  if (pick) pick.hidden = true;
}

function openPvpGuidePick() {
  return false;
}

function confirmPvpGuide(_enabled) {
  closePvpGuidePick();
}

function startOwnPvpRoom() {
  return false;
}

function refreshLobbyPresence({ reconnect = false, publish = false } = {}) {
  if (realtimeManager.isConnected && !realtimeManager.channelNeedsReconnect()) {
    realtimeManager.resyncPresence({ force: true });
    if (publish) publishPresence();
    return;
  }
  if (reconnect && !realtimeManager._connecting) bootRealtime();
}

function showLobby() {
  releaseMatchWakeLock();
  lobbyVisible = true;
  lobbyUsers.hidden = false;
  syncNickField();
  refreshLobbyPresence({ reconnect: true, publish: true });
  renderLobby();
  void publishAiWallet();
  syncSceneMode();
  if (!isDualGuestSearch(window.location.search) && shouldAutoOpenGuideBook() && !pendingInviteRoom) {
    bookOpenedByConnect = true;
    openLobbyBookSheet('guide');
    return;
  }
  if (!isDualGuestSearch(window.location.search)) {
    offerInviteOnlyNotice({ guidebookSkippedOnConnect: hasSkipGuideOnConnect() });
  }
}

function hideLobby({ force = false } = {}) {
  if (!inMatchRoom && !force) {
    showLobby();
    return;
  }
  closeLobbyBook();
  closeInviteOnlyNotice();
  closeLobbyInviteModal();
  closePvpGuidePick();
  lobbyVisible = false;
  lobbyUsers.hidden = true;
  syncSceneMode();
}

let bookPage = 0;
let bookTab = 'guide';
let bookOpenedByConnect = false;
let inviteOnlyNoticeShown = false;
let tutorial = createTutorialState();

function clinicSnapshot() {
  return {
    engine,
    renderer,
    soundUnlocked: Boolean(soundEngine.isUnlocked),
    volume: soundEngine.volume,
    muted: soundEngine.muted,
    userId: realtimeManager.userId,
    nickname: realtimeManager.userNickname,
    acorns: sessionAcorns,
    nightUserId: readNightUserId(),
    hasSolo: Boolean(document.getElementById('lobby-mode-solo')),
    hasAi: Boolean(document.getElementById('lobby-mode-ai')),
    hasPvp: Boolean(document.getElementById('lobby-mode-pvp')),
    pvpWaitHint: PVP_WAIT_HINT,
    hasStartGate: Boolean(document.getElementById('match-start')),
    hasReadyAsk: Boolean(document.getElementById('ready-ask-box')),
    hasSurrender: Boolean(document.getElementById('surrender-btn')),
    hasLeave: Boolean(document.getElementById('lobby-leave')),
    hasVolume: Boolean(document.getElementById('settings-volume')),
    hasActionCam: Boolean(document.getElementById('settings-action-cam')),
    hasRearrangeAsk: Boolean(document.getElementById('settings-rearrange-ask')),
    hasGuideColor: Boolean(document.getElementById('guide-color-pick')),
    actionCamOn: renderer.actionCamEnabled !== false && isActionCamEnabled(),
    rearrangeAskOn: isRearrangeAskEnabled(),
    pullOverNotice: PULL_OVER_NOTICE,
    pullBlockNotice: PULL_BLOCK_NOTICE,
    killCamSlowMo: KILL_CAM.SLOW_MO_S,
    killCamOffSkips: shouldAttachKillCam(false, null) === false
      && shouldAttachKillCam(true, null) === true,
    liveConfigured: readSupabaseConfig(readViteSupabaseEnv()).live,
    realtimeLive: isLiveRealtime(realtimeManager.supabaseClient),
    connected: Boolean(realtimeManager.isConnected),
    lobbyCap: LOBBY_CAP,
    hasInviteCopy: Boolean(inviteCopyBtn && inviteShareKakao),
    hasInviteNick: Boolean(inviteModal && guestNickInput && inviteEnterBtn),
    hasLobbyInvite: Boolean(document.getElementById('invite-lobby-list')),
    hasLobbyInviteModal: Boolean(document.getElementById('lobby-invite-modal') && document.getElementById('lobby-invite-accept')),
    hasInviteOnlyNotice: Boolean(document.getElementById('invite-only-notice') && document.getElementById('invite-only-ok')),
    hasBookSkip: Boolean(document.getElementById('lobby-book-skip')),
    hasBookPlay: Boolean(document.getElementById('lobby-book-play')),
  };
}

function renderLobbyBook() {
  const body = document.getElementById('lobby-book-body');
  const nav = document.getElementById('lobby-book-nav');
  const dots = document.getElementById('lobby-book-dots');
  const guideTab = document.getElementById('lobby-book-tab-guide');
  const clinicTab = document.getElementById('lobby-book-tab-clinic');
  if (!body) return;
  guideTab?.classList.toggle('is-on', bookTab === 'guide');
  clinicTab?.classList.toggle('is-on', bookTab === 'clinic');
  if (nav) nav.hidden = bookTab !== 'guide';
  const startBtn = document.getElementById('lobby-book-tutorial');
  const playBtn = document.getElementById('lobby-book-play');
  const dock = document.getElementById('lobby-book-dock');
  const skip = document.getElementById('lobby-book-skip');
  const skipLabel = document.getElementById('lobby-book-skip-text');
  if (dock) dock.hidden = bookTab !== 'guide';
  if (startBtn) startBtn.hidden = bookTab !== 'guide';
  if (playBtn) {
    playBtn.hidden = bookTab !== 'guide';
    playBtn.textContent = BOOK_PLAY_LABEL;
  }
  if (skipLabel) skipLabel.textContent = BOOK_SKIP_LABEL;
  if (skip) skip.checked = hasSkipGuideOnConnect();
  if (bookTab === 'clinic') {
    body.innerHTML = renderClinicList(runLobbyClinic(clinicSnapshot()));
    return;
  }
  const page = guidePageAt(bookPage);
  body.innerHTML = renderGuidePage(page);
  if (dots) {
    dots.innerHTML = '';
    for (let i = 0; i < guidePageCount(); i += 1) {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = i === bookPage ? 'book-dot is-on' : 'book-dot';
      dot.setAttribute('aria-label', `${i + 1}쪽`);
      dot.addEventListener('click', () => {
        bookPage = i;
        renderLobbyBook();
      });
      dots.appendChild(dot);
    }
  }
}

function openLobbyBookSheet(tab = 'guide') {
  bookTab = tab === 'clinic' ? 'clinic' : 'guide';
  const book = document.getElementById('lobby-book');
  if (book) book.hidden = false;
  markGuideBookSeen();
  renderLobbyBook();
}

function openLobbyBook(tab = 'guide') {
  const book = document.getElementById('lobby-book');
  if (book?.hidden !== false) bookOpenedByConnect = false;
  if (!lobbyVisible) {
    lobbyVisible = true;
    lobbyUsers.hidden = false;
    syncNickField();
    renderLobby();
    syncSceneMode();
  }
  openLobbyBookSheet(tab);
}

function closeLobbyBook({ offerNotice = false } = {}) {
  const book = document.getElementById('lobby-book');
  const wasOpen = Boolean(book && !book.hidden);
  if (book) book.hidden = true;
  if (offerNotice && wasOpen) {
    offerInviteOnlyNotice({ guidebookClosed: bookOpenedByConnect });
  }
}

function closeInviteOnlyNotice() {
  const root = document.getElementById('invite-only-notice');
  if (root) root.hidden = true;
  markInviteOnlyNoticeSeen();
}

function offerInviteOnlyNotice(reason = {}) {
  if (!shouldOfferInviteOnlyNotice({
    alreadyShown: inviteOnlyNoticeShown || hasSeenInviteOnlyNotice(),
    inviteJoin: Boolean(pendingInviteRoom),
    ...reason,
  })) return false;
  const root = document.getElementById('invite-only-notice');
  const text = document.getElementById('invite-only-text');
  const ok = document.getElementById('invite-only-ok');
  if (text) text.textContent = INVITE_ONLY_NOTICE;
  if (ok) ok.textContent = INVITE_ONLY_OK;
  if (root) root.hidden = false;
  inviteOnlyNoticeShown = true;
  bookOpenedByConnect = false;
  return true;
}

function syncTutorialCoach() {
  const root = document.getElementById('tutorial-coach');
  const title = document.getElementById('tutorial-title');
  const text = document.getElementById('tutorial-text');
  const skip = document.getElementById('tutorial-skip');
  const finish = document.getElementById('tutorial-finish');
  if (!root) return;
  if (!tutorial.active) {
    root.hidden = true;
    return;
  }
  const step = tutorialStep(tutorial);
  if (title) title.textContent = step.title;
  if (text) text.textContent = step.coach;
  if (skip) skip.hidden = isTutorialDone(tutorial);
  if (finish) finish.hidden = !isTutorialDone(tutorial);
  root.hidden = false;
  setTicker(step.coach);
}

function noteTutorial(event) {
  if (!tutorial.active) return;
  tutorial = advanceTutorial(tutorial, event);
  syncTutorialCoach();
}

function startTutorialPlay() {
  closeLobbyBook();
  tutorial = startTutorialState();
  settingsModal.setGameMode(GAME_MODE.SOLO, { startMatch: true });
  beginMatchIfAllowed();
  syncTutorialCoach();
}

function stopTutorial(event = 'leave') {
  if (!tutorial.active) return;
  tutorial = advanceTutorial(tutorial, event);
  syncTutorialCoach();
}

function syncLobbyLeaveBtn() {
  const btn = document.getElementById('lobby-leave');
  if (!btn) return;
  btn.hidden = engine.phase === PHASE.SPECTATING;
}

function playingMates() {
  const roomId = currentMatchRoomId();
  const mine = realtimeManager.userId;
  const rid = normalizePvpRoomId(roomId) || String(roomId || '').trim();
  return new Set(
    livePresencePool()
      .filter((u) => (u.userId ?? u.id) !== mine)
      .filter((u) => {
        if (u.status !== 'playing') return false;
        if (String(u.roomId || '') === String(roomId || '')) return true;
        const uidRoom = normalizePvpRoomId(u.roomId) || String(u.roomId || '').trim();
        return Boolean(rid && uidRoom && uidRoom === rid && u.mode === 'pvp');
      })
      .map((u) => u.userId ?? u.id),
  );
}

function noteRoomMates(playDiff) {
  if (!inMatchRoom) {
    lastRoomMates = new Set();
    return;
  }
  const next = playingMates();
  const lost = [...lastRoomMates].filter((id) => !next.has(id));
  if (playDiff && engine.phase !== PHASE.SPECTATING) {
    for (const id of next) {
      if (!lastRoomMates.has(id)) soundEngine.playDoor('enter');
    }
    for (const id of lost) soundEngine.playDoor('leave');
  }
  const hadOpponent = lastRoomMates.size > 0 || roomHasOpponent(matchRoom);
  if (playDiff && lost.length) {
    const confirmed = lost.some((id) => realtimeManager.leftPresenceKeys().includes(String(id)));
    if (!shouldApplyPresenceOpponentLoss({
      roomHasOpponent: roomHasOpponent(matchRoom),
      presenceHasOpponent: next.size > 0,
      confirmedLeave: confirmed,
    })) {
      return;
    }
    lastRoomMates = next;
    const gone = {
      inRoom: inMatchRoom,
      mode: engine.gameMode,
      spectating: engine.phase === PHASE.SPECTATING,
      hadOpponent,
      hasOpponent: next.size > 0,
      started: matchStarted,
      phase: engine.phase,
    };
    if (shouldForfeitOnOpponentGone(gone)) {
      forfeitOpponent(lost[0]);
      return;
    }
    if (shouldReturnToPvpWait(gone)) returnToPvpWait();
    return;
  }
  lastRoomMates = next;
}

function seatHostFromPeerPresence(users = lobbyUserList) {
  if (!inMatchRoom || engine.phase === PHASE.SPECTATING) return false;
  if (!isMatchHost() || roomHasOpponent(matchRoom)) return false;
  const peer = peerJoiningHostRoom(users, {
    myId: realtimeManager.userId,
    roomId: currentMatchRoomId(),
  });
  if (!peer) return false;
  const sent = sentLobbyInvite?.inviteTargetId;
  const peerId = peer.userId ?? peer.id;
  if (sent && String(peerId) !== String(sent)) return false;
  return applyHostAcceptedInvite({
    roomId: currentMatchRoomId(),
    hostId: realtimeManager.userId,
    targetId: peer.userId ?? peer.id,
    guestId: peer.userId ?? peer.id,
    guestName: peer.nickname,
    action: INVITE_ACTION_ACCEPT,
  });
}

function syncPvpWait() {
  if (!usesPeerStart(engine.gameMode) || !inMatchRoom || engine.phase === PHASE.SPECTATING) return;
  if (seatHostFromPeerPresence()) return;
  if (replayHostStartForGuest()) return;
  if (beginMatchFromPeer()) return;
  if (shouldHoldPvpStartGate({
    mode: engine.gameMode,
    started: matchStarted,
    hasOpponent: roomHasOpponent(matchRoom),
  })) {
    awaitingStart = true;
    turnManager.cancel();
    engine.pauseMatch();
  }
  syncStartGate();
}

function applyLiveSyncReset() {
  const liveSync = resetLiveSyncSession();
  lastMatchSyncSeq = liveSync.lastMatchSyncSeq;
  matchSyncSeq = liveSync.matchSyncSeq;
  lastMatchSyncTs = liveSync.lastMatchSyncTs;
  lastLaunchAt = liveSync.lastLaunchAt;
  lastHostStartReplayAt = liveSync.lastHostStartReplayAt;
  lastHostClockAt = 0;
  matchBoardReady = liveSync.matchBoardReady;
  gotShooterTurnEnd = liveSync.gotShooterTurnEnd;
  pendingHostLaunch = liveSync.pendingHostLaunch;
  lastHostLaunch = null;
}

function enterMatchRoom() {
  inMatchRoom = true;
  awaitingStart = true;
  matchStarted = false;
  applyLiveSyncReset();
  campSentForStart = false;
  if (shouldStartWithoutPeer(engine.gameMode) && (engine.phase === PHASE.GAME_OVER || engine.winner)) {
    engine.setHost(true);
    engine.setMatchConfig({
      mode: startResetMode(engine.gameMode),
      difficulty: engine.aiDifficulty,
    });
  }
  clearSentLobbyInvite();
  const joinedId = joinedMatchRoomId({
    joiningRoomId,
    joining: joiningRoom,
    myId: realtimeManager.userId,
    mode: engine.gameMode,
  });
  if (joinedId) activeRoomId = joinedId;
  if (!joiningRoom && !joiningRoomId) {
    pendingInviteRoom = '';
    writeStoredInviteRoom('');
    matchRoom = createRoomState({
      roomId: activeRoomId,
      hostId: realtimeManager.userId,
      hostName: realtimeManager.userNickname,
    });
    publishRoomState();
  }
  beginMatchReady();
  renderer.snapSeat(engine.getSnapshot());
  hideLobby({ force: true });
  void holdMatchWakeLock();
  syncNickLock();
  syncLobbyLeaveBtn();
  syncSceneMode();
  soundEngine.playDoor('enter');
  noteRoomMates(false);
  markPvpRoomOpened();
  armPvpWaitExpire();
  publishPresence();
}

function handleSweepLeave() {
  stopTutorial('leave');
  hideResult();
  inMatchRoom = false;
  awaitingStart = false;
  matchStarted = false;
  lastAcornSettleKey = '';
  clearMatchReady();
  activeRoomId = null;
  joiningRoomId = '';
  matchRoom = null;
  lastRoomMates = new Set();
  lobbyUserList = [];
  lastLobbyViewKey = '';
  pvpOpenedAt = null;
  lastPeerCamp = null;
  lastMatchSyncSeq = 0;
  matchSyncSeq = 0;
  stopHelloRetry();
  clearCampWait();
  clearTurnEndWatchdog();
  clearPvpWaitExpire();
  setTicker(SWEEP_LEAVE_HINT);
  showLobby();
  syncNickField();
}

function handleStaleLeave() {
  if (shouldForfeitOnLeave({
    mode: engine.gameMode,
    started: matchStarted,
    spectating: engine.phase === PHASE.SPECTATING,
    phase: engine.phase,
  })) {
    publishRoomLeave();
  }
  stopTutorial('leave');
  hideResult();
  inMatchRoom = false;
  awaitingStart = false;
  matchStarted = false;
  lastAcornSettleKey = '';
  clearMatchReady();
  activeRoomId = null;
  joiningRoomId = '';
  matchRoom = null;
  lastRoomMates = new Set();
  lobbyUserList = [];
  lastLobbyViewKey = '';
  pvpOpenedAt = null;
  lastPeerCamp = null;
  lastMatchSyncSeq = 0;
  matchSyncSeq = 0;
  stopHelloRetry();
  clearCampWait();
  clearTurnEndWatchdog();
  clearPvpWaitExpire();
  setTicker(STALE_LEAVE_HINT);
  showLobby();
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  realtimeManager.connect().then(() => {
    realtimeManager.startHeartbeat();
    publishPresence();
    syncNickField();
  }).catch(() => {});
}

function returnToPvpWait() {
  if (!inMatchRoom || engine.gameMode !== GAME_MODE.PVP || engine.phase === PHASE.SPECTATING) {
    return false;
  }
  const me = realtimeManager.userId;
  const already = awaitingStart
    && !matchStarted
    && !roomHasOpponent(matchRoom)
    && matchRoom?.hostId === me;
  if (already) return false;
  hideResult();
  suppressResult = true;
  matchStarted = false;
  awaitingStart = true;
  campSentForStart = false;
  clearSentLobbyInvite();
  lastPeerCamp = null;
  applyLiveSyncReset();
  stopHelloRetry();
  clearCampWait();
  clearTurnEndWatchdog();
  clearMatchReady();
  joiningRoomId = '';
  joiningRoom = false;
  if (!matchRoom || matchRoom.hostId !== me) {
    setTicker(PVP_PEER_GONE_HINT);
    hideResult();
    inMatchRoom = false;
    awaitingStart = false;
    matchStarted = false;
    matchRoom = null;
    activeRoomId = null;
    joiningRoomId = '';
    joiningRoom = false;
    lastRoomMates = new Set();
    pvpOpenedAt = null;
    suppressResult = false;
    publishIdleLobby();
    showLobby();
    return true;
  } else {
    matchRoom = applyRoomLeave(matchRoom, { leaverId: matchRoom.guestId });
  }
  engine.setHost(true);
  engine.setAiOpponent(false);
  engine.setMatchConfig({ mode: GAME_MODE.PVP, difficulty: engine.aiDifficulty });
  beginMatchReady();
  renderer.snapSeat(engine.getSnapshot());
  setTicker(PVP_PEER_GONE_HINT);
  markPvpRoomOpened();
  armPvpWaitExpire();
  syncSceneMode();
  syncStartGate();
  publishRoomState();
  publishPresence();
  suppressResult = false;
  return true;
}

function forfeitOpponent(leaverId) {
  if (engine.phase === PHASE.GAME_OVER || engine.phase === PHASE.SPECTATING) return false;
  const who = String(leaverId || '');
  const leaverColor = who && matchRoom?.hostId && who === matchRoom.hostId
    ? STONE_COLOR.BLACK
    : STONE_COLOR.WHITE;
  return engine.surrender(leaverColor);
}

function restartPvpRematch() {
  if (!shouldKeepPvpRematch({
    mode: engine.gameMode,
    inRoom: inMatchRoom,
    roomId: matchRoom?.roomId,
    hostId: matchRoom?.hostId,
    guestId: matchRoom?.guestId,
  })) {
    enterMatchRoom();
    engine.setMatchConfig({ mode: engine.gameMode, difficulty: engine.aiDifficulty });
    renderer.resetFx();
    matchBadge.textContent = '흑 턴 15';
    return false;
  }
  joiningRoomId = matchRoom.hostId === realtimeManager.userId ? '' : matchRoom.roomId;
  joiningRoom = Boolean(joiningRoomId);
  matchRoom = applyRoomRematch(matchRoom);
  awaitingStart = true;
  matchStarted = false;
  applyLiveSyncReset();
  campSentForStart = false;
  lastPeerCamp = null;
  lastAcornSettleKey = '';
  clearTurnEndWatchdog();
  inMatchRoom = true;
  engine.setHost(pvpSeatColor({
    myId: realtimeManager.userId,
    hostId: matchRoom.hostId,
    roomId: matchRoom.roomId,
  }) === STONE_COLOR.BLACK);
  engine.setMatchConfig({ mode: GAME_MODE.PVP, difficulty: engine.aiDifficulty });
  beginMatchReady();
  renderer.resetFx();
  renderer.snapSeat(engine.getSnapshot());
  hideLobby({ force: true });
  matchBadge.textContent = '흑 턴 15';
  syncStartGate();
  syncSceneMode();
  publishRoomState();
  publishPresence();
  joiningRoom = false;
  return true;
}

function followPvpRematch(payload) {
  syncMatchRoom(resetRoomForIncomingRematch(matchRoom, payload));
  hideResult();
  awaitingStart = true;
  matchStarted = false;
  applyLiveSyncReset();
  campSentForStart = false;
  lastPeerCamp = null;
  lastAcornSettleKey = '';
  clearTurnEndWatchdog();
  engine.setHost(pvpSeatColor({
    myId: realtimeManager.userId,
    hostId: matchRoom?.hostId,
    roomId: matchRoom?.roomId,
  }) === STONE_COLOR.BLACK);
  engine.setMatchConfig({ mode: GAME_MODE.PVP, difficulty: engine.aiDifficulty });
  beginMatchReady();
  renderer.resetFx();
  renderer.snapSeat(engine.getSnapshot());
  hideLobby({ force: true });
  matchBadge.textContent = '흑 턴 15';
  syncStartGate();
  syncSceneMode();
  publishRoomState();
  publishPresence();
  return true;
}

function publishRoomLeave() {
  if (!matchRoom?.roomId) return false;
  matchRoom = applyRoomLeave(matchRoom, { leaverId: realtimeManager.userId });
  return publishRoomState();
}

function leaveToWaitingRoom() {
  if (engine.phase === PHASE.SPECTATING) {
    leaveWatchedRoom();
    return;
  }
  const tutorialWas = Boolean(tutorial.active);
  stopTutorial('leave');
  if (shouldForfeitOnLeave({
    mode: engine.gameMode,
    started: matchStarted,
    spectating: engine.phase === PHASE.SPECTATING,
    phase: engine.phase,
  })) {
    suppressResult = true;
    engine.surrender(myStoneColor());
    suppressResult = false;
  }
  publishRoomLeave();
  hideResult();
  inMatchRoom = false;
  awaitingStart = false;
  matchStarted = false;
  lastAcornSettleKey = '';
  lastPeerCamp = null;
  lastMatchSyncSeq = 0;
  matchSyncSeq = 0;
  stopHelloRetry();
  clearCampWait();
  clearTurnEndWatchdog();
  clearMatchReady();
  activeRoomId = null;
  joiningRoomId = '';
  matchRoom = null;
  lastRoomMates = new Set();
  pvpOpenedAt = null;
  clearPvpWaitExpire();
  soundEngine.playDoor('leave');
  settingsModal?.setGameMode(GAME_MODE.AI, { startMatch: false });
  publishIdleLobby();
  showLobby();
  if (tutorialWas) offerInviteOnlyNotice({ tutorialSkipped: true });
}

function quitGameFromLobby() {
  if (gameExited) return;
  gameExited = true;
  settingsModal.close(false);
  exitGame({
    engine,
    turnManager,
    realtimeManager,
    root: stage,
    win: window,
    cancelFrame: () => {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = 0;
    },
  });
}

function enterSpectateRoom(room) {
  engine.enterSpectatorMode({
    matchId: room.id,
    playerA: room.playerA,
    playerB: room.playerB,
    mode: room.mode,
  });
  hideLobby({ force: true });
  soundEngine.playDoor('enter');
}

function exitSpectate() {
  engine.exitSpectatorMode();
}

function leaveWatchedRoom() {
  inMatchRoom = false;
  awaitingStart = false;
  matchStarted = false;
  clearMatchReady();
  activeRoomId = null;
  joiningRoomId = '';
  matchRoom = null;
  lastRoomMates = new Set();
  pvpOpenedAt = null;
  clearPvpWaitExpire();
  soundEngine.playDoor('leave');
  exitSpectate();
  showLobby();
}

function resolveJoinablePvp(room, invite) {
  const id = room?.id || invite?.roomId;
  return pickJoinablePvp([
    lobbyRooms().find((r) => r.id === id),
    resolveInviteRoom(lobbyRoomsUsers(), id),
    findInviteRoom(roomsFromPresence(lobbyRoomsUsers()), id),
    roomFromInvite(invite),
    room,
  ], realtimeManager.userId);
}

function applyHostAcceptedInvite(payload) {
  if (!inMatchRoom || engine.phase === PHASE.SPECTATING) return false;
  const next = applyRoomAck(applyRoomGuest(matchRoom || createRoomState({
    roomId: payload?.roomId || currentMatchRoomId(),
    hostId: realtimeManager.userId,
    hostName: realtimeManager.userNickname,
  }), {
    guestId: payload?.targetId || payload?.guestId,
    guestName: payload?.guestName,
  }));
  if (!roomHasOpponent(next)) return false;
  syncMatchRoom(next);
  clearSentLobbyInvite();
  publishPresence();
  publishRoomState();
  syncPvpWait();
  return true;
}

function applyGuestRoomAck(payload) {
  if (!inMatchRoom) return false;
  syncMatchRoom(applyRoomAck(mergeRoomState(matchRoom, payload)));
  stopHelloRetry();
  syncStartGate();
  return true;
}

function stopHelloRetry() {
  if (helloRetryTimer) clearInterval(helloRetryTimer);
  helloRetryTimer = 0;
  helloRetryLeft = 0;
  helloRetryInvite = null;
}

function startHelloRetry(invite) {
  stopHelloRetry();
  helloRetryInvite = invite;
  helloRetryLeft = HELLO_RETRY_MAX;
  helloRetryTimer = setInterval(() => {
    if (matchRoom?.acked || helloRetryLeft <= 0) {
      stopHelloRetry();
      return;
    }
    helloRetryLeft -= 1;
    void announceRoomHello(helloRetryInvite);
  }, HELLO_RETRY_MS);
}

async function announceRoomHello(invite) {
  if (!invite?.roomId || !invite?.hostId) return false;
  const hello = buildRoomHello(invite, {
    guestName: realtimeManager.userNickname,
    guestId: realtimeManager.userId,
  });
  let ok = await realtimeManager.broadcastPvpInvite(hello);
  if (!ok) ok = await realtimeManager.broadcastPvpInvite(hello);
  return ok;
}

async function announceRoomAck(state) {
  const ack = buildRoomAck(state, {
    hostName: realtimeManager.userNickname,
    guestName: state?.guestName,
  });
  if (!ack.roomId || !ack.targetId) return false;
  let ok = await realtimeManager.broadcastPvpInvite(ack);
  if (!ok) ok = await realtimeManager.broadcastPvpInvite(ack);
  return ok;
}

function enterJoinedPvp(room) {
  joiningRoom = true;
  startingPvp = true;
  joiningRoomId = room.id;
  activeRoomId = room.id;
  engine.setHost(false);
  try {
    settingsModal.setGameMode(GAME_MODE.PVP, { startMatch: true });
    if (engine.gameMode !== GAME_MODE.PVP) {
      engine.setMatchConfig({ mode: GAME_MODE.PVP, difficulty: engine.aiDifficulty });
    }
  } finally {
    joiningRoom = false;
    startingPvp = false;
  }
  publishPresence();
  const hostId = room.hostId || String(room.id || '').replace(/^room_/, '');
  matchRoom = applyRoomGuest(matchRoom || createRoomState({
    roomId: room.id,
    hostId,
    hostName: room.hostName,
  }), {
    guestId: realtimeManager.userId,
    guestName: realtimeManager.userNickname,
  });
  engine.setHost(pvpSeatColor({
    myId: realtimeManager.userId,
    hostId: matchRoom?.hostId,
    roomId: matchRoom?.roomId || room.id,
  }) === STONE_COLOR.BLACK);
  renderer.snapSeat(engine.getSnapshot());
  if (!guestClaimHeld(matchRoom, realtimeManager.userId)) {
    bounceRejectedJoin();
    return false;
  }
  publishRoomState();
  return inMatchRoom && activeRoomId === room.id && engine.gameMode === GAME_MODE.PVP;
}

function bounceRejectedJoin() {
  joiningRoom = false;
  joiningRoomId = '';
  inMatchRoom = false;
  awaitingStart = false;
  matchStarted = false;
  matchRoom = null;
  activeRoomId = null;
  lastRoomMates = new Set();
  setTicker(INVITE_ROOM_GONE_HINT);
  publishIdleLobby();
  showLobby();
}

function joinPvpRoom(_room, _invite) {
  return false;
  let live = resolveJoinablePvp(_room, _invite);
  if (!canJoinPvpRoom(live, realtimeManager.userId)) {
    refreshLobbyPresence({ reconnect: false });
    live = resolveJoinablePvp(room, invite);
  }
  if (!canJoinPvpRoom(live, realtimeManager.userId)) {
    setTicker(INVITE_ROOM_GONE_HINT);
    return false;
  }
  return enterJoinedPvp(live);
}

function inviteHostState(users = lobbyRoomsUsers()) {
  return {
    mode: engine.gameMode,
    inRoom: inMatchRoom && engine.phase !== PHASE.SPECTATING,
    started: matchStarted,
    isHost: isMatchHost(),
    users,
    myId: realtimeManager.userId,
    roomId: currentMatchRoomId(),
    myAcorns: myAcorns(),
    hasOpponent: roomHasOpponent(matchRoom),
    spectating: engine.phase === PHASE.SPECTATING,
  };
}

function hostWaitingForInvite() {
  return shouldKeepHostInviteSheet({
    room: matchRoom,
    myId: realtimeManager.userId,
    inRoom: inMatchRoom && engine.phase !== PHASE.SPECTATING,
    mode: engine.gameMode,
    hasOpponent: roomHasOpponent(matchRoom),
  });
}

function currentPvpOpenedAt() {
  return roomOpenedAt(lobbyUserList, currentMatchRoomId(), pvpOpenedAt);
}

function clearPvpWaitExpire() {
  if (pvpExpireTimer) clearTimeout(pvpExpireTimer);
  pvpExpireTimer = 0;
}

function markPvpRoomOpened() {
  if (engine.gameMode !== GAME_MODE.PVP || !inMatchRoom || matchStarted) {
    if (matchStarted || engine.gameMode !== GAME_MODE.PVP) pvpOpenedAt = null;
    return;
  }
  pvpOpenedAt = currentPvpOpenedAt() || pvpOpenedAt || Date.now();
}

function armPvpWaitExpire() {
  clearPvpWaitExpire();
}

function expirePvpWait() {
  if (!shouldExpirePvpWait({
    mode: engine.gameMode,
    openedAt: currentPvpOpenedAt(),
    started: matchStarted,
  })) return;
  leaveToWaitingRoom();
  setTicker(PVP_WAIT_EXPIRE_HINT);
}

function syncInviteShare() {
  const show = hostWaitingForInvite();
  if (inviteCopyBtn) inviteCopyBtn.hidden = !show;
  if (!show) closeInviteShareSheet();
}

function currentInviteUrl() {
  return inviteUrlFor(PVP_ROOM_ID, window.location);
}

function renderLobbyInviteList({ refresh = false } = {}) {
  const list = document.getElementById('invite-lobby-list');
  const hint = document.getElementById('invite-lobby-hint');
  if (hint) hint.textContent = LOBBY_INVITE_HINT;
  if (!list) return;
  list.innerHTML = '';
  if (refresh) realtimeManager.resyncPresence({ force: true });
  const guests = idleLobbyInvitees(
    applyLivePresence(
      [...lobbyUserList, ...Array.from(realtimeManager.onlineUsers.values())],
      selfPresence(),
    ),
    realtimeManager.userId,
  );
  if (!guests.length) {
    const empty = document.createElement('p');
    empty.className = 'invite-lobby-empty';
    empty.textContent = LOBBY_INVITE_EMPTY;
    list.appendChild(empty);
    return;
  }
  guests.forEach((user) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'invite-lobby-user';
    row.textContent = `${user.nickname || '손님'} · ${LOBBY_INVITE_BTN}`;
    row.addEventListener('click', () => sendLobbyInvite(user));
    list.appendChild(row);
  });
}

function openInviteShareSheet() {
  if (!hostWaitingForInvite() || !inviteShareSheet) return;
  refreshLobbyPresence({ reconnect: true });
  renderLobbyInviteList({ refresh: true });
  inviteShareSheet.hidden = false;
}

function closeInviteShareSheet() {
  if (inviteShareSheet) inviteShareSheet.hidden = true;
}

function openInviteNickModal(roomId) {
  pendingInviteRoom = roomId;
  writeStoredInviteRoom(roomId);
  if (inviteNickDesc) {
    inviteNickDesc.textContent = `[방 코드: ${roomId}] 방으로 입장합니다. 사용할 닉네임을 입력해 주세요.`;
  }
  if (guestNickInput) {
    guestNickInput.placeholder = INVITE_NICK_PLACEHOLDER;
    guestNickInput.value = String(readInvitePrefill(realtimeManager.nicknameStorage) || '').slice(0, 5);
  }
  if (inviteModal) inviteModal.hidden = false;
  hideLobby({ force: true });
  queueMicrotask(() => guestNickInput?.focus());
}

function closeInviteNickModal() {
  if (inviteModal) inviteModal.hidden = true;
}

let pendingLobbyInvite = null;

function closeLobbyInviteModal() {
  pendingLobbyInvite = null;
  const modal = document.getElementById('lobby-invite-modal');
  if (modal) modal.hidden = true;
}

function openLobbyInviteModal(invite) {
  pendingLobbyInvite = invite;
  closeLobbyBook();
  closeInviteOnlyNotice();
  if (lobbyUsers) lobbyUsers.hidden = false;
  lobbyVisible = true;
  const modal = document.getElementById('lobby-invite-modal');
  const ask = document.getElementById('lobby-invite-ask');
  const accept = document.getElementById('lobby-invite-accept');
  const decline = document.getElementById('lobby-invite-decline');
  if (ask) ask.textContent = lobbyInviteAsk(invite.hostName);
  if (accept) accept.textContent = LOBBY_INVITE_ACCEPT;
  if (decline) decline.textContent = LOBBY_INVITE_DECLINE;
  if (modal) modal.hidden = false;
}

function receiveLobbyInvite(payload) {
  if (shouldDismissInviteModal(pendingLobbyInvite, payload, realtimeManager.userId)) {
    closeLobbyInviteModal();
    return;
  }
  const verdict = evaluateLobbyInvite(payload, realtimeManager.userId);
  if (!verdict.ok) return;
  if (!shouldOfferLobbyInvite(inviteOfferState())) return;
  if (isDualGuestSearch(window.location.search)) {
    pendingLobbyInvite = verdict.invite;
    void acceptLobbyInvite();
    return;
  }
  openLobbyInviteModal(verdict.invite);
}

function seatAiGuest() {
  engine.setHost(true);
  engine.setAiOpponent(true, STONE_COLOR.WHITE);
  matchRoom = applyRoomAck(applyRoomGuest(matchRoom || createRoomState({
    roomId: currentMatchRoomId(),
    hostId: realtimeManager.userId,
    hostName: realtimeManager.userNickname,
  }), {
    guestId: AI_LOBBY_USER_ID,
    guestName: AI_LOBBY_NICKNAME,
  }));
  matchRoom = stampRoomAcorns(matchRoom, { myId: AI_LOBBY_USER_ID, acorns: currentAiAcorns() });
  matchRoom = stampRoomAcorns(matchRoom, { myId: realtimeManager.userId, acorns: myAcorns() });
  syncMatchRoom(matchRoom);
  clearSentLobbyInvite();
  syncPvpWait();
  syncStartGate();
  setTicker(AI_ACCEPT_HINT);
  return roomHasOpponent(matchRoom);
}

function inviteLobbyAiUser(target) {
  if (!isLobbyAiUser(target) || matchStarted || engine.phase === PHASE.SPECTATING) return false;
  if (
    inMatchRoom
    && engine.gameMode === GAME_MODE.PVP
    && roomHasOpponent(matchRoom)
    && !isLobbyAiUser(matchRoom?.guestId)
  ) return false;
  if (!inMatchRoom || engine.gameMode !== GAME_MODE.PVP) {
    startingPvp = true;
    try {
      settingsModal?.setGameMode(GAME_MODE.PVP, { startMatch: true });
      if (engine.gameMode !== GAME_MODE.PVP) {
        engine.setMatchConfig({ mode: GAME_MODE.PVP, difficulty: engine.aiDifficulty });
      }
    } finally {
      startingPvp = false;
    }
  }
  return seatAiGuest();
}

async function sendLobbyInvite(target) {
  if (isLobbyAiUser(target)) return;
  if (!canInviteLobbyUser({ ...inviteHostState(), target })) return;
  const payload = buildLobbyInvite({
    roomId: PVP_ROOM_ID,
    hostId: realtimeManager.userId,
    hostName: realtimeManager.userNickname,
    targetId: target.userId ?? target.id,
  });
  const prevTarget = sentLobbyInvite?.inviteTargetId;
  if (prevTarget && prevTarget !== payload.targetId) {
    void realtimeManager.broadcastPvpInvite(buildInviteReply({
      roomId: payload.roomId,
      hostId: payload.hostId,
      targetId: prevTarget,
    }, INVITE_ACTION_CANCEL));
  }
  sentLobbyInvite = { inviteTargetId: payload.targetId, inviteAt: Date.now() };
  matchRoom = applyRoomInvite(matchRoom || createRoomState({
    roomId: payload.roomId,
    hostId: payload.hostId,
    hostName: payload.hostName,
  }), payload.targetId);
  const ok = await announceLobbyInvite({
    publishPresence: () => { void publishPresence(); },
    publishRoom: () => { void publishRoomState(); },
    broadcast: () => realtimeManager.broadcastPvpInvite(payload),
  });
  if (ok) setTicker(LOBBY_INVITE_SENT);
}

async function announceInviteAccept(invite) {
  if (!invite?.roomId || !invite?.hostId) return false;
  const reply = buildInviteReply(invite, INVITE_ACTION_ACCEPT, {
    guestName: realtimeManager.userNickname,
  });
  let ok = await realtimeManager.broadcastPvpInvite(reply);
  if (!ok) ok = await realtimeManager.broadcastPvpInvite(reply);
  void publishPresence();
  void publishRoomState();
  return ok;
}

async function acceptLobbyInvite() {
  const invite = pendingLobbyInvite;
  const result = await attemptInviteJoin({
    roomId: invite?.roomId,
    join: (roomId) => joinRoom(roomId, { invite }),
    refresh: () => refreshLobbyPresence({ reconnect: false, publish: true }),
  });
  closeLobbyInviteModal();
  if (result.ok) {
    void announceInviteAccept(invite);
    hideLobby({ force: true });
    syncStartGate();
  }
  if (!result.ok) setTicker(INVITE_ROOM_GONE_HINT);
}

function joinRoom(_roomId, extras = {}) {
  return false;
  if (extras.nickname != null) {
    const named = guestInviteNickname(
      extras.nickname,
      lobbyUserList.filter((u) => (u.userId ?? u.id) !== realtimeManager.userId),
      realtimeManager.userId,
    );
    realtimeManager.setDisplayNickname(named.nickname);
    persistInviteNickname(named.nickname, realtimeManager.nicknameStorage);
    syncNickField();
  }
  const room = pickJoinablePvp([
    resolveInviteRoom(lobbyRoomsUsers(), roomId),
    findInviteRoom(roomsFromPresence(lobbyRoomsUsers()), roomId),
    roomFromInvite(extras.invite || { roomId, hostId: extras.hostId, hostName: extras.hostName }),
  ], realtimeManager.userId);
  if (!room) return false;
  if (room.hostId === realtimeManager.userId) {
    joiningRoom = false;
    activeRoomId = room.id;
    startOwnPvpRoom();
    return engine.gameMode === GAME_MODE.PVP;
  }
  const verdict = evaluateInviteJoin(room, realtimeManager.userId);
  if (!verdict.ok) return false;
  return joinPvpRoom(verdict.room, extras.invite);
}

async function enterInviteRoom() {
  return false;
  const roomId = pendingInviteRoom || readStoredInviteRoom() || readInviteRoomId(window.location.search);
  if (!roomId) return false;
  pendingInviteRoom = roomId;
  writeStoredInviteRoom(roomId);
  const rawNick = guestNickInput?.value || nickInput?.value;
  const named = guestInviteNickname(
    rawNick,
    lobbyUserList.filter((u) => (u.userId ?? u.id) !== realtimeManager.userId),
    realtimeManager.userId,
  );
  persistInviteNickname(named.nickname, realtimeManager.nicknameStorage);
  realtimeManager.setDisplayNickname(named.nickname);
  syncNickField();
  if (nickInput) nickInput.value = named.nickname;
  const started = Date.now();
  while (Date.now() - started < 12000) {
    if (realtimeManager.isConnected && joinRoom(roomId, { nickname: named.nickname, role: 'guest' })) {
      closeInviteNickModal();
      clearInviteQuery(window);
      writeStoredInviteRoom('');
      pendingInviteRoom = '';
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  enterLobbyAfterInviteMiss();
  return false;
}

function enterLobbyAfterInviteMiss() {
  const miss = inviteMissFallback(false);
  closeInviteNickModal();
  clearInviteQuery(window);
  writeStoredInviteRoom('');
  pendingInviteRoom = '';
  if (miss.hint) setTicker(miss.hint);
  showLobby();
}

async function copyInviteLink() {
  if (!hostWaitingForInvite()) return;
  openInviteShareSheet();
}

async function shareInviteToKakao() {
  if (!hostWaitingForInvite()) return;
  const result = await shareViaKakaoTalk(currentInviteUrl());
  closeInviteShareSheet();
  if (result.hint) setTicker(result.hint);
}

async function shareInviteToApps() {
  if (!hostWaitingForInvite()) return;
  const result = await shareOrCopyInvite(currentInviteUrl());
  closeInviteShareSheet();
  if (result.hint) setTicker(result.hint);
}

async function copyInviteUrlOnly() {
  if (!hostWaitingForInvite()) return;
  const result = await shareOrCopyInvite(currentInviteUrl(), { share: null });
  closeInviteShareSheet();
  if (result.hint) setTicker(result.hint);
}

function selfPresence() {
  const snap = engine.getSnapshot();
  const watching = snap.phase === PHASE.SPECTATING;
  return {
    ...presenceFromMatch({
    userId: realtimeManager.userId,
    nickname: realtimeManager.userNickname,
    character: realtimeManager.userCharacter,
    mode: snap.gameMode,
    phase: snap.phase,
    roomId: currentMatchRoomId(),
    watchRoomId: watching ? engine.spectatorData?.matchId : null,
    inRoom: inMatchRoom,
    acorns: myAcorns(),
    rearranging: Boolean(engine.placementOnly && awaitingStart),
    started: presenceStartedFlag({
      matchStarted,
      roomStarted: Boolean(matchRoom?.started),
    }),
    matchGen: roomMatchGen(matchRoom),
    boardReady: matchBoardReady,
    ended: snap.phase === PHASE.GAME_OVER,
    ...currentSentInvite(),
    pvpOpenedAt: snap.gameMode === GAME_MODE.PVP && inMatchRoom && !matchStarted
      ? currentPvpOpenedAt()
      : null,
    }),
    presenceKey: realtimeManager.presenceKey || realtimeManager.userId,
  };
}

function publishPresence() {
  const next = selfPresence();
  const tracked = realtimeManager.updatePresence(next);
  updateLobbyUserList(mergeSelfPresence(lobbyUserList, next));
  return tracked;
}

function publishIdleLobby() {
  const next = idleLobbyPresence({
    userId: realtimeManager.userId,
    nickname: realtimeManager.userNickname,
    character: realtimeManager.userCharacter,
    acorns: myAcorns(),
  });
  realtimeManager.updatePresence({
    ...next,
    status: 'lobby',
    mode: null,
    roomId: null,
    rearranging: false,
    started: false,
    inviteTargetId: null,
    inviteAt: null,
    pvpOpenedAt: null,
  });
  clearSentLobbyInvite();
  updateLobbyUserList(mergeSelfPresence(lobbyUserList, next));
}

function lobbyRooms() {
  return filterOwnIdleRooms(
    roomsFromPresence(lobbyRoomsUsers()),
    realtimeManager.userId,
    inMatchRoom,
  );
}

function updateLobbyUserList(users) {
  const humans = dedupePresenceUsers(users)
    .filter((user) => !isLobbyAiUser(user))
    .slice(0, LOBBY_CAP);
  const next = mergeLobbyAiSeat(humans);
  const key = `${presenceViewKey(next)}#${roomsFromPresence(next).map((r) => r.id).sort().join(',')}`;
  const same = key === lastLobbyViewKey && lastLobbyViewKey !== '';
  lobbyUserList = next;
  lastLobbyViewKey = key;
  syncPresenceInvites(next);
  syncInviteShare();
  if (inviteShareSheet && !inviteShareSheet.hidden) renderLobbyInviteList({ refresh: false });
  if (same) {
    beginMatchFromPeer();
    syncPvpWait();
    syncStartGate();
    if (lobbyVisible) {
      syncLobbyRoomCount();
      syncLobbyWaitGuide();
      syncPvpInvite();
    }
    return;
  }
  noteRoomMates(true);
  syncPvpWait();
  if (lobbyVisible) renderLobby();
  else syncLobbyRoomCount();
  applyLobbyDefaultMode(lobbyUserList.length);
  syncStartGate();
  if (inMatchRoom && engine.gameMode === GAME_MODE.PVP && !matchStarted) {
    const shared = currentPvpOpenedAt();
    if (shared && shared !== pvpOpenedAt) pvpOpenedAt = shared;
    armPvpWaitExpire();
  }
}

function syncLobbyRoomCount() {
  if (userCount) userCount.textContent = String(openRoomCount(lobbyRoomsUsers()));
}

function lobbyRoomsUsers() {
  return lobbyUserList.some((u) => (u.userId ?? u.id) === realtimeManager.userId)
    ? lobbyUserList
    : [selfPresence(), ...lobbyUserList];
}

function renderLobby() {
  if (!lobbyList) return;
  lobbyList.innerHTML = '';

  const rooms = lobbyRooms();
  syncLobbyRoomCount();
  syncLobbyWaitGuide(rooms);
  syncPvpInvite();
  const empty = document.createElement('div');
  empty.className = 'lobby-empty';
  empty.id = 'lobby-empty';
  empty.textContent = LOBBY_MODE_HINT;
  lobbyList.appendChild(empty);
  const hint = document.createElement('div');
  hint.className = 'lobby-pvp-hint';
  hint.id = 'lobby-pvp-hint';
  hint.textContent = LOBBY_MODE_HINT;
  lobbyList.appendChild(hint);
}

renderer.setGuideEnabled(readGuideEnabled());

engine.on('reset', () => {
  renderer.resetFx();
  hideResult();
  syncSceneMode();
  setTicker('READY: 바둑알을 뒤로 당겨 튕겨내세요!');
  publishPresence();
});

engine.on('aimStart', () => {
  noteTutorial('aimStart');
});

engine.on('aimUpdate', () => {
  noteTutorial('aimUpdate');
});

engine.on('powerStage', () => {
  noteTutorial('powerStage');
});

engine.on('pullBlocked', (payload) => {
  showPullBlockToast(payload?.message ?? PULL_BLOCK_NOTICE);
});

engine.on('launch', (payload) => {
  soundEngine.playFlick(payload?.power ?? 0.5);
  noteTutorial('launch');
  if (!tutorial.active) setTicker('발사!');
  if (payload?.remote) return;
  lastHostLaunch = payload;
  lastLaunchAt = Date.now();
  gotShooterTurnEnd = false;
  armTurnEndWatchdog();
  publishMatchSync({ force: true, event: 'launch', launch: payload });
});

engine.on('clash', (payload) => {
  const intensity = Math.min(1, payload.relativeVelocity / 16);
  renderer.spawnPop(payload.x, payload.y, intensity);
  if (payload.relativeVelocity >= 8) {
    renderer.spawnShake(Math.min(1, (payload.relativeVelocity - 8) / 12));
  }
});

engine.on('stoneFallen', (payload) => {
  if (!isOutsideInnerBoard({ x: payload.x, y: payload.y })) return;
  soundEngine.playFall();
  renderer.spawnFall(payload.id, { x: payload.x, y: payload.y });
  if (!tutorial.active) setTicker('장외 탈락!');
});

engine.on('turnEnd', (payload) => {
  matchBadge.textContent = engine.currentTurn === 'black' ? '흑 턴' : '백 턴';
  if (!tutorial.active) {
    setTicker(engine.currentTurn === 'black' ? '흑 차례입니다' : '백 차례입니다');
  }
  soundEngine.playTurn();
  if (!shouldPublishSettledTurnEnd({
    remoteShot: payload?.remote,
    inPvp: inMatchRoom && engine.gameMode === GAME_MODE.PVP,
    isHost: isMatchHost(),
  })) return;
  gotShooterTurnEnd = true;
  clearTurnEndWatchdog();
  publishMatchSync({ force: true, event: 'turnEnd' });
});

engine.on('gameOver', (payload) => {
  matchBadge.textContent = payload.winner === 'draw' ? '무승부' : `${payload.winner === 'black' ? '흑' : '백'} 승`;
  applyAcornResult(payload);
  if (payload.reason === 'surrender') soundEngine.playSurrender();
  else {
    const kind = payload.winner === 'draw'
      ? 'draw'
      : engine.gameMode === GAME_MODE.SOLO
        ? 'end'
        : (payload.winner === myStoneColor() || (engine.gameMode === GAME_MODE.AI && payload.winner === STONE_COLOR.BLACK))
          ? 'win'
          : 'lose';
    soundEngine.playResult(kind);
  }
  if (tutorial.active) noteTutorial('launch');
  if (!suppressResult && !tutorial.active) showResult(payload);
  applyLobbyDefaultMode(lobbyUserList.length);
  publishPresence();
  publishMatchSync({ force: true, event: 'gameOver' });
});

engine.on('spectatorEnter', (data) => {
  showSpectatorBadge(data.playerA, data.playerB);
  syncLobbyLeaveBtn();
  setTicker(`🔴 관람 중: ${data.playerA} vs ${data.playerB}`);
  publishPresence();
});

engine.on('spectatorExit', () => {
  hideSpectatorBadge();
  if (inMatchRoom) enterMatchRoom();
  else syncSceneMode();
  syncLobbyLeaveBtn();
  setTicker('READY: 바둑알을 뒤로 당겨 튕겨내세요!');
  publishPresence();
});

function syncHud(snapshot) {
  applyPowerFill(powerFill, aimChargeRatio(snapshot.aim));
  if (snapshot.phase === PHASE.AIMING && snapshot.aim) {
    soundEngine.setPull(aimChargeRatio(snapshot.aim));
  } else {
    soundEngine.stopPull();
  }
  const ratio = snapshot.timer?.ratio ?? 1;
  timerRing.style.strokeDashoffset = String(timerRingOffset(ratio));
  matchTimer.classList.toggle('is-urgent', Boolean(snapshot.timer?.urgent && snapshot.timer?.running));
  const secs = Math.max(0, Math.ceil((snapshot.timer?.remainingMs ?? 0) / 1000));
  if (snapshot.timer?.urgent && snapshot.timer?.running && secs !== lastTimerSec && secs <= 5) {
    soundEngine.playTimerTick();
  }
  lastTimerSec = snapshot.timer?.running ? secs : -1;
  const clock = snapshot.timer?.running ? ` ${secs}` : '';
  const thinking = snapshot.gameMode === GAME_MODE.AI
    && snapshot.currentTurn === STONE_COLOR.WHITE
    && snapshot.phase === PHASE.IDLE
    && snapshot.inputLocked;
  syncSeatNames();
  if (snapshot.phase === PHASE.SPECTATING) {
    matchBadge.textContent = '관전 중';
  } else if (snapshot.phase === PHASE.AIMING) {
    matchBadge.textContent = `조준${clock}`;
  } else if (snapshot.phase === PHASE.RESOLVING) {
    matchBadge.textContent = '진행';
  } else if (snapshot.phase === PHASE.IDLE && snapshot.winner == null) {
    if (thinking) matchBadge.textContent = `고민${clock}`;
    else matchBadge.textContent = `${snapshot.currentTurn === 'black' ? '흑 턴' : '백 턴'}${clock}`;
  }
}

let frameId = 0;
let gameExited = false;

function frame() {
  if (gameExited) return;
  try {
    tickMatchReady();
    const now = Date.now();
    if (shouldPublishHostClock({
      inPvp: inMatchRoom && engine.gameMode === GAME_MODE.PVP && engine.phase !== PHASE.SPECTATING,
      isHost: isMatchHost(),
      phase: engine.phase,
      lastAt: lastHostClockAt,
      now,
      intervalMs: HOST_CLOCK_MS,
      matchStarted,
      awaitingStart,
    })) {
      lastHostClockAt = now;
      publishMatchSync({ force: true, event: 'timer' });
    }
    publishMatchSync();
    const snapshot = engine.getSnapshot();
    renderer.draw(snapshot);
    syncHud(snapshot);
    syncBoardSpinBtn();
  } catch {
    /* 한 프레임 오류가 휴대폰 루프를 죽이지 않게 한다 */
  }
  frameId = requestAnimationFrame(frame);
}

const viewport = new ResponsiveViewport({ table, stage, renderer });
settingsModal = new SettingsModal({
  root: stage,
  engine,
  renderer,
  onApply: (payload) => {
    hideResult();
    hideSpectatorBadge();
    if (payload?.toLobby) {
      inMatchRoom = false;
      awaitingStart = false;
      matchStarted = false;
      clearMatchReady();
      activeRoomId = null;
      joiningRoomId = '';
      matchRoom = null;
      pvpOpenedAt = null;
      clearPvpWaitExpire();
      publishIdleLobby();
      showLobby();
    } else {
      const mode = intendedGameMode(payload?.mode);
      if (payload?.mode && engine.gameMode !== mode) {
        engine.setMatchConfig({ mode, difficulty: payload?.difficulty });
      }
      enterMatchRoom();
    }
    matchBadge.textContent = '흑 턴 15';
    if (!payload?.toLobby) publishPresence();
    noteRoomMates(false);
  },
  onPvpPick: () => {},
  shouldBlockApply: () => shouldBlockSettingsToLobby({
    inRoom: inMatchRoom,
    started: matchStarted,
    spectating: engine.phase === PHASE.SPECTATING,
  }),
});
const powerRatioController = new PowerRatioController({
  root: stage,
  engine,
  renderer,
});

try {
  localStorage.removeItem('dotori-alkkagi-scene-bg');
} catch {
  /* ignore */
}

turnManager.attach();
syncSceneMode();
showLobby();

document.getElementById('match-start')?.addEventListener('click', () => {
  beginMatchIfAllowed();
});
document.getElementById('ready-ask-yes')?.addEventListener('click', () => {
  answerMatchReady(true);
});
document.getElementById('ready-ask-no')?.addEventListener('click', () => {
  answerMatchReady(false);
});

guideBtn.addEventListener('click', () => {
  settingsModal.toggleGuide();
});

document.getElementById('result-again').addEventListener('click', () => {
  hideResult();
  if (restartPvpRematch()) return;
});

document.getElementById('surrender-btn')?.addEventListener('click', () => {
  if (engine.phase === PHASE.GAME_OVER || engine.phase === PHASE.SPECTATING) return;
  engine.surrender(engine.currentTurn);
});

document.getElementById('lobby-leave')?.addEventListener('click', () => {
  leaveToWaitingRoom();
});

document.getElementById('board-spin-btn')?.addEventListener('click', (event) => {
  event.preventDefault();
  event.stopPropagation();
  if (!canBoardSpinButton(boardSpinState())) return;
  renderer.nudgeViewYaw();
});

document.getElementById('board-spin-ccw')?.addEventListener('click', (event) => {
  event.preventDefault();
  event.stopPropagation();
  if (!canBoardSpinButton(boardSpinState())) return;
  renderer.nudgeViewYaw(-BOARD_SPIN_STEP);
});

document.getElementById('result-exit')?.addEventListener('click', () => {
  leaveToWaitingRoom();
});

document.getElementById('lobby-exit')?.addEventListener('click', () => {
  quitGameFromLobby();
});

lobbyToggle?.addEventListener('click', toggleLobby);
lobbyClose.addEventListener('click', () => {
  if (shouldQuitFromLobbyClose(inMatchRoom)) quitGameFromLobby();
  else hideLobby();
});
lobbyOverlay.addEventListener('click', hideLobby);
document.getElementById('lobby-book-open')?.addEventListener('click', () => openLobbyBook('guide'));
document.getElementById('lobby-book-bar-guide')?.addEventListener('click', () => openLobbyBook('guide'));
document.getElementById('lobby-book-bar-clinic')?.addEventListener('click', () => openLobbyBook('clinic'));
document.getElementById('lobby-location-guide')?.addEventListener('click', () => openLobbyBook('guide'));
document.getElementById('lobby-book-close')?.addEventListener('click', () => closeLobbyBook({ offerNotice: true }));
document.getElementById('invite-only-ok')?.addEventListener('click', closeInviteOnlyNotice);
document.getElementById('lobby-book-tab-guide')?.addEventListener('click', () => openLobbyBook('guide'));
document.getElementById('lobby-book-tab-clinic')?.addEventListener('click', () => openLobbyBook('clinic'));
document.getElementById('lobby-book-prev')?.addEventListener('click', () => {
  bookPage = (bookPage + guidePageCount() - 1) % guidePageCount();
  renderLobbyBook();
});
document.getElementById('lobby-book-next')?.addEventListener('click', () => {
  bookPage = (bookPage + 1) % guidePageCount();
  renderLobbyBook();
});
document.getElementById('lobby-book-tutorial')?.addEventListener('click', startTutorialPlay);
document.getElementById('lobby-book-play')?.addEventListener('click', () => {
  closeLobbyBook({ offerNotice: true });
  showLobby();
});
document.getElementById('lobby-book-skip')?.addEventListener('change', (event) => {
  setSkipGuideOnConnect(Boolean(event.target?.checked));
});
document.getElementById('lobby-book-body')?.addEventListener('click', (event) => {
  if (event.target?.closest?.('[data-tutorial-start]')) startTutorialPlay();
});
document.getElementById('tutorial-skip')?.addEventListener('click', () => {
  stopTutorial('skip');
  leaveToWaitingRoom();
  offerInviteOnlyNotice({ tutorialSkipped: true });
});
document.getElementById('tutorial-finish')?.addEventListener('click', () => {
  stopTutorial('finish');
  leaveToWaitingRoom();
  offerInviteOnlyNotice({ tutorialEnded: true });
});
document.getElementById('pvp-guide-on')?.addEventListener('click', () => confirmPvpGuide(true));
document.getElementById('pvp-guide-off')?.addEventListener('click', () => confirmPvpGuide(false));
document.getElementById('pvp-guide-cancel')?.addEventListener('click', closePvpGuidePick);

document.getElementById('lobby-settings')?.addEventListener('click', () => {
  settingsModal.open();
});

nickInput?.addEventListener('input', () => {
  const chars = Array.from(nickInput.value);
  if (chars.length > NICKNAME_MAX) {
    nickInput.value = chars.slice(0, NICKNAME_MAX).join('');
    if (nickHint) {
      nickHint.textContent = NICKNAME_HINT;
      nickHint.classList.add('is-warn');
    }
  }
});

document.getElementById('spectate-stop')?.addEventListener('click', () => {
  soundEngine.playDoor('leave');
  exitSpectate();
});
document.getElementById('spectate-leave')?.addEventListener('click', leaveWatchedRoom);

inviteCopyBtn?.addEventListener('click', () => {
  copyInviteLink();
});
inviteShareKakao?.addEventListener('click', () => {
  shareInviteToKakao();
});
inviteShareApps?.addEventListener('click', () => {
  shareInviteToApps();
});
inviteShareCopy?.addEventListener('click', () => {
  copyInviteUrlOnly();
});
inviteShareClose?.addEventListener('click', () => {
  closeInviteShareSheet();
});
document.getElementById('lobby-invite-accept')?.addEventListener('click', () => {
  acceptLobbyInvite();
});
document.getElementById('lobby-invite-decline')?.addEventListener('click', () => {
  const invite = pendingLobbyInvite;
  closeLobbyInviteModal();
  if (invite) {
    void realtimeManager.broadcastPvpInvite(buildInviteReply(invite, INVITE_ACTION_DECLINE));
  }
});
inviteEnterBtn?.addEventListener('click', () => {
  enterInviteRoom();
});
guestNickInput?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    enterInviteRoom();
  }
});
nickSave?.addEventListener('click', saveNickname);
nickInput?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    saveNickname();
  }
});

requestAnimationFrame(frame);

window.addEventListener('offline', () => realtimeManager.noteDisconnect());
window.addEventListener('online', () => {
  realtimeManager.noteReconnect();
  if (!realtimeManager.isConnected) bootRealtime();
});

function bootRealtime(attempt = 0) {
  if (!nightClaim?.userId) {
    nightClaim = takeNightUserId({ makeId: newNightUserId, tabToken: nightClaim?.tabToken });
  }
  realtimeManager.userId = nightClaim.userId;
  realtimeManager.presenceKey = nightClaim.userId;
  return realtimeManager.connect().then((status) => {
    if (isLobbyFullStatus(status)) {
      setTicker(`대기실이 가득 찼습니다 (${LOBBY_CAP}명)`);
      showLobby();
      return;
    }
    if (status && status !== 'SUBSCRIBED') return;
    sessionAcorns = writeNightAcorns(readNightAcorns());
    syncAcornHud();
    writeNightClaim(realtimeManager.userId, nightClaim.tabToken);
    realtimeManager.startHeartbeat();
    publishPresence();
    void publishAiWallet();
    syncNickField();
    if (isDualSearch(window.location.search)) setTicker(DUAL_HINT);
    armDualGuestSeat();
  }).catch(() => {
    if (attempt >= 1) return;
    return new Promise((resolve) => setTimeout(resolve, 1000)).then(() => bootRealtime(attempt + 1));
  });
}

bootRealtime();
bindPresenceUnload(realtimeManager, window, () => {
  if (inMatchRoom && engine.phase !== PHASE.SPECTATING) publishRoomLeave();
});

async function holdMatchWakeLock() {
  if (!inMatchRoom || typeof navigator === 'undefined' || !navigator.wakeLock?.request) return;
  try {
    matchWakeLock = await navigator.wakeLock.request('screen');
    matchWakeLock.addEventListener?.('release', () => { matchWakeLock = null; });
  } catch {
    matchWakeLock = null;
  }
}

function releaseMatchWakeLock() {
  try { matchWakeLock?.release?.(); } catch { /* ignore */ }
  matchWakeLock = null;
}

function pollGuestStart() {
  if (!shouldPollGuestStart({
    awaitingStart,
    inPvp: inMatchRoom && engine.gameMode === GAME_MODE.PVP,
    spectating: engine.phase === PHASE.SPECTATING,
    boardReady: matchBoardReady,
    isHost: isMatchHost(),
    matchStarted,
    roomStarted: Boolean(matchRoom?.started),
  })) return false;
  realtimeManager.resyncPresence({ force: true });
  if (beginMatchFromPeer()) return true;
  if (peerHasStartedMatch() || matchRoom?.started) {
    publishCampLayout();
    publishRoomState();
  }
  if (
    !matchStarted
    && !matchRoom?.started
    && realtimeManager.channelNeedsReconnect()
    && !realtimeManager._connecting
  ) {
    bootRealtime();
  }
  return false;
}

function onLobbyResume() {
  refreshLobbyPresence({
    reconnect: realtimeManager.channelNeedsReconnect(),
    publish: true,
  });
  if (!inMatchRoom || engine.phase === PHASE.SPECTATING) return;
  void holdMatchWakeLock();
  if (pollGuestStart()) return;
  if (isMatchHost() && matchStarted) replayHostStartForGuest();
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') onLobbyResume();
});
window.addEventListener('focus', onLobbyResume);
window.addEventListener('pageshow', onLobbyResume);
document.addEventListener('resume', onLobbyResume);
if (!window.__dotoriLobbyRefresh) {
  window.__dotoriLobbyRefresh = setInterval(() => {
    if (pollGuestStart()) return;
    if (lobbyVisible) refreshLobbyPresence({ reconnect: false });
    if (shouldRepublishOpenRoom({
      inRoom: inMatchRoom && engine.phase !== PHASE.SPECTATING,
      mode: engine.gameMode,
      started: presenceStartedFlag({
        matchStarted,
        roomStarted: Boolean(matchRoom?.started),
      }),
    })) {
      void realtimeManager.broadcastLobbyHint();
    } else if (replayHostStartForGuest()) {
      /* 손님이 시작을 못 따라가면 현재 판을 다시 보낸다 */
    } else if (shouldPulseMatchSync({
      inPvp: inMatchRoom && engine.gameMode === GAME_MODE.PVP && engine.phase !== PHASE.SPECTATING,
      started: matchStarted,
      spectating: engine.phase === PHASE.SPECTATING,
    })) {
      publishMatchSync({ force: true, event: 'pulse' });
    }
  }, 800);
}

function armDualGuestSeat() {
  const search = window.location.search;
  if (isLoopTestSearch(search) || !isDualSearch(search) || isDualGuestSearch(search)) return;
  setTimeout(() => {
    const peers = lobbyUserList.filter((user) => (user.userId ?? user.id) !== realtimeManager.userId).length;
    if (!shouldSpawnDualGuestFrame({
      dual: true,
      guestSeat: false,
      peerCount: peers,
    })) return;
    mountDualGuestFrame(document, dualGuestHref(window.location));
    setTicker(DUAL_HINT);
  }, 800);
}

function seedVirtualLobby() {
  const guests = seedPlayingGuests(9);
  const added = applySeededPresence(realtimeManager, guests);
  publishPresence();
  showLobby();
  return {
    ok: added === 9 && lobbyRooms().length >= 9 && lobbyUserList.length >= 10,
    guests: added,
    rooms: lobbyRooms().length,
    users: lobbyUserList.length,
  };
}

globalThis.__dotori = {
  engine,
  renderer,
  viewport,
  settingsModal,
  turnManager,
  realtimeManager,
  soundEngine,
  powerRatioController,
  seedVirtualLobby,
  openDualMatch,
  openLobbyBook,
  closeLobbyBook,
  startTutorialPlay,
  skipReadyAsk: skipReadyAskNow,
  joinRoom,
  runLobbyClinic: () => runLobbyClinic(clinicSnapshot()),
};

export { engine, renderer, viewport, settingsModal, turnManager, powerRatioController };
