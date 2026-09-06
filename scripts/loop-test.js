import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outFile = path.join(root, 'public', 'test-result.png');

mkdirSync(path.join(root, 'public'), { recursive: true });

const devices = [
  { name: 'iPhone 14 Pro', width: 393, height: 852 },
  { name: 'Galaxy S23', width: 360, height: 780 },
  { name: 'Z Flip', width: 412, height: 1014 },
  { name: 'wide pillarbox', width: 1280, height: 720 },
];

const server = await createServer({
  root,
  optimizeDeps: { force: true },
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(''),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(''),
  },
  server: {
    port: 4179,
    strictPort: true,
    host: '127.0.0.1',
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    },
  },
});
await server.listen();

const browser = await chromium.launch({ headless: true });

async function measure(page) {
  await page.goto('http://127.0.0.1:4179/?loop=1', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForSelector('#board', { state: 'attached', timeout: 30000 });
  await page.waitForFunction(() => Boolean(globalThis.__dotori?.settingsModal), null, { timeout: 30000 });
  await page.waitForTimeout(1400);
    return page.evaluate(() => {
      const api = globalThis.__dotori;
      if (!api?.renderer) return { ok: false, reason: 'renderer missing' };
      api.viewport.sync();
      const bounds = api.renderer.getBoardNdcBounds();
      const canvas = document.getElementById('board').getBoundingClientRect();
      const table = document.getElementById('table').getBoundingClientRect();
      const epsilon = 1;
      const inView =
        canvas.left >= table.left - epsilon
        && canvas.right <= table.right + epsilon
        && canvas.top >= table.top - epsilon
        && canvas.bottom <= table.bottom + epsilon;
      const spanX = bounds.maxX - bounds.minX;
      const spanY = bounds.maxY - bounds.minY;
      return {
        ok: bounds.contained && inView && spanX >= 1.55 && spanY >= 0.40,
        bounds,
        canvas,
        table,
        inView,
        spanX,
        spanY,
      };
    });
}

try {
  for (const device of devices) {
    const page = await browser.newPage({
      viewport: { width: device.width, height: device.height },
      deviceScaleFactor: 2,
    });
    const result = await measure(page);
    if (!result.ok) {
      throw new Error(`${device.name} board clipped: ${JSON.stringify(result)}`);
    }
    const firstVisit = await page.evaluate(() => {
      const guide = document.getElementById('lobby-location-guide');
      const rooms = document.querySelectorAll('.lobby-room-name').length;
      const empty = document.querySelector('.lobby-empty');
      const hint = document.getElementById('lobby-pvp-hint');
      const balloon = document.getElementById('lobby-pvp-balloon');
      return {
        ok: Boolean(
          guide
          && rooms === 0
          && !guide.classList.contains('is-wait-blink')
          && guide.textContent.includes('1인')
          && guide.textContent.includes('AI')
          && guide.textContent.includes('1:1')
          && empty?.textContent.includes('개설된 대국')
          && hint?.textContent.includes('대국방')
          && hint?.textContent.includes('시작')
          && !balloon
        ),
        text: guide?.textContent,
        rooms,
        empty: empty?.textContent,
        hint: hint?.textContent,
      };
    });
    if (!firstVisit.ok) {
      throw new Error(`${device.name} lobby mode hint missing: ${JSON.stringify(firstVisit)}`);
    }
    await page.evaluate(() => document.getElementById('lobby-location-guide')?.click());
    const bookOpen = await page.evaluate(() => {
      const book = document.getElementById('lobby-book');
      const heading = document.querySelector('#lobby-book .book-heading')?.textContent;
      const start = document.getElementById('lobby-book-tutorial');
      const play = document.getElementById('lobby-book-play');
      const skip = document.getElementById('lobby-book-skip');
      const pageStart = document.querySelector('#lobby-book [data-tutorial-start]');
      return {
        ok: Boolean(
          book && !book.hidden && heading && heading.includes('도토리')
          && start && start.textContent.includes('튜토리얼')
          && play && play.textContent.includes('바로시작')
          && skip
          && pageStart && pageStart.textContent.includes('튜토리얼')
        ),
        heading,
      };
    });
    if (!bookOpen.ok) {
      throw new Error(`${device.name} guidebook missing: ${JSON.stringify(bookOpen)}`);
    }
    await page.evaluate(() => document.getElementById('lobby-book-tab-clinic')?.click());
    const clinic = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('#lobby-book .clinic-row')];
      const text = rows.map((row) => row.textContent).join(' ');
      return {
        ok: rows.length >= 24
          && text.includes('액션캠')
          && text.includes('재배치')
          && text.includes('당김')
          && text.includes('바로시작')
          && text.includes('대기방')
          && text.includes('내닉네임'),
        n: rows.length,
      };
    });
    if (!clinic.ok) {
      throw new Error(`${device.name} lobby clinic missing: ${JSON.stringify(clinic)}`);
    }
    await page.evaluate(() => document.getElementById('lobby-book-close')?.click());
    const inviteOnly = await page.evaluate(() => {
      const root = document.getElementById('invite-only-notice');
      const text = document.getElementById('invite-only-text');
      const ok = document.getElementById('invite-only-ok');
      return {
        ok: Boolean(
          root && !root.hidden
          && text?.textContent.includes('초대에 의해서만')
          && text?.textContent.includes('대전방 개설후')
          && ok && ok.textContent.includes('확인')
        ),
        text: text?.textContent,
      };
    });
    if (!inviteOnly.ok) {
      throw new Error(`${device.name} invite-only notice missing: ${JSON.stringify(inviteOnly)}`);
    }
    await page.evaluate(() => document.getElementById('invite-only-ok')?.click());
    await page.waitForFunction(() => document.getElementById('invite-only-notice')?.hidden === true, null, { timeout: 3000 });
    const pvpInvite = await page.evaluate(() => {
      const btn = document.getElementById('lobby-mode-pvp');
      const empty = document.querySelector('.lobby-empty');
      const hint = document.getElementById('lobby-pvp-hint');
      const balloon = document.getElementById('lobby-pvp-balloon');
      const anim = btn ? getComputedStyle(btn).animationName : '';
      return {
        ok: Boolean(
          btn?.classList.contains('is-invite-blink')
          && anim.includes('blink')
          && empty?.textContent.includes('개설된 대국')
          && hint?.textContent.includes('대국방')
          && hint?.textContent.includes('시작')
          && !balloon
        ),
        text: hint?.textContent,
        anim,
      };
    });
    if (!pvpInvite.ok) {
      throw new Error(`${device.name} pvp invite line missing: ${JSON.stringify(pvpInvite)}`);
    }
    if (device.name === 'iPhone 14 Pro') {
      await page.screenshot({ path: outFile, timeout: 60000 });
    }
    const entered = await page.evaluate(() => {
      document.getElementById('lobby-mode-ai')?.click();
      const visible = () => {
        const box = document.getElementById('ready-ask-box');
        return Boolean(box && !box.hidden);
      };
      if (!visible()) {
        globalThis.__dotori?.settingsModal?.setGameMode('ai', { startMatch: true });
      }
      return {
        ok: visible(),
        lobbyHidden: document.getElementById('lobby-users')?.hidden,
        gateHidden: document.getElementById('match-start-gate')?.hidden,
        askHidden: document.getElementById('ready-ask-box')?.hidden,
        mode: globalThis.__dotori?.engine?.gameMode,
        phase: globalThis.__dotori?.engine?.phase,
      };
    });
    if (!entered.ok) {
      throw new Error(`${device.name} ready-ask missing: ${JSON.stringify(entered)}`);
    }
    const readyAsk = await page.evaluate(() => {
      const box = document.getElementById('ready-ask-box');
      const ask = document.getElementById('ready-ask');
      const start = document.getElementById('match-start');
      const hint = document.getElementById('pvp-start-hint');
      const oneLine = (el) => Boolean(
        el
        && getComputedStyle(el).whiteSpace.includes('nowrap')
        && el.scrollWidth <= el.clientWidth + 2,
      );
      const hide = hint?.hidden;
      const prev = hint?.textContent;
      if (hint) {
        hint.hidden = false;
        hint.textContent = '도토리가 적은 사람이 시작 버튼을 누르고 선공합니다.';
      }
      const hintOk = oneLine(hint);
      if (hint) {
        hint.hidden = hide;
        hint.textContent = prev;
      }
      return {
        ok: Boolean(box && !box.hidden && ask?.textContent.includes('재배치') && start?.hidden
          && oneLine(ask) && hintOk),
        askW: ask ? [ask.scrollWidth, ask.clientWidth] : null,
        hintOk,
      };
    });
    if (!readyAsk.ok) {
      throw new Error(`${device.name} ready ask missing: ${JSON.stringify(readyAsk)}`);
    }
    await page.evaluate(() => globalThis.__dotori?.skipReadyAsk?.());
    await page.waitForTimeout(80);
    const startGate = await page.evaluate(() => {
      const gate = document.getElementById('match-start-gate');
      const start = document.getElementById('match-start');
      const hudMode = document.getElementById('hud-mode');
      const stage = document.getElementById('stage');
      const startBox = start?.getBoundingClientRect();
      const boardCx = parseFloat(getComputedStyle(stage).getPropertyValue('--board-cx'));
      const startMid = startBox ? (startBox.left + startBox.right) / 2 - stage.getBoundingClientRect().left : NaN;
      const onBoard = !Number.isFinite(boardCx) || Math.abs(startMid - boardCx) <= 14;
      return {
        ok: Boolean(gate && !gate.hidden && start && !start.disabled
          && getComputedStyle(hudMode).visibility === 'hidden'
          && onBoard),
        startMid,
        boardCx,
      };
    });
    if (!startGate.ok) {
      throw new Error(`${device.name} start gate missing: ${JSON.stringify(startGate)}`);
    }
    await page.evaluate(() => document.getElementById('match-start')?.click());
    await page.waitForTimeout(350);
    const hud = await page.evaluate(() => {
      const stage = document.getElementById('stage')?.getBoundingClientRect();
      const slot = document.querySelector('#stage .power-slot')?.getBoundingClientRect();
      const track = document.querySelector('#stage .power-track')?.getBoundingClientRect();
      const guideEl = document.getElementById('guide-btn');
      const guide = guideEl?.getBoundingClientRect();
      const guideText = guideEl?.textContent || '';
      const guideHint = guideEl?.getAttribute('aria-label') || '';
      const timer = document.getElementById('match-timer')?.getBoundingClientRect();
      const acorn = document.getElementById('acorn-wallet')?.getBoundingClientRect();
      const settingsBtn = document.getElementById('settings-btn');
      const lobbyGone = !document.getElementById('lobby-toggle');
      const surrender = document.getElementById('surrender-btn')?.getBoundingClientRect();
      const leave = document.getElementById('lobby-leave')?.getBoundingClientRect();
      const nearEl = document.getElementById('seat-name-black');
      const farEl = document.getElementById('seat-name-white');
      const near = nearEl?.getBoundingClientRect();
      const far = farEl?.getBoundingClientRect();
      const fab = document.querySelector('#stage .floating-buttons')?.getBoundingClientRect();
      const stageEl = document.getElementById('stage');
      const boardCx = parseFloat(getComputedStyle(stageEl).getPropertyValue('--board-cx'));
      const boardBottom = parseFloat(getComputedStyle(stageEl).getPropertyValue('--board-bottom'));
      const boardLeft = parseFloat(getComputedStyle(stageEl).getPropertyValue('--board-left'));
      const boardTop = parseFloat(getComputedStyle(stageEl).getPropertyValue('--board-top'));
      const boardWidth = parseFloat(getComputedStyle(stageEl).getPropertyValue('--board-width'));
      if (!stage || !slot || !track || !guide || !timer || !acorn || !surrender || !leave || !near || !far || !fab) {
        return { ok: false, reason: 'hud missing' };
      }
      const mid = (stage.left + stage.right) / 2;
      const slotMid = (slot.left + slot.right) / 2;
      const farMid = (far.left + far.right) / 2 - stage.left;
      const radius = getComputedStyle(document.getElementById('match-timer')).borderRadius;
      const rowY = Math.abs(surrender.top - guide.top) <= 3
        && Math.abs(leave.top - guide.top) <= 3
        && guide.bottom <= slot.top + 6;
      const sameSize = Math.abs(surrender.width - guide.width) <= 2
        && Math.abs(leave.width - guide.width) <= 2
        && slot.height === guide.height;
      const guideOnOff = /ON|OFF/.test(guideText)
        && (guideHint.includes('사용중') || guideHint.includes('미사용'));
      const settingsHidden = !settingsBtn || getComputedStyle(settingsBtn).display === 'none';
      const chromeRow = Math.abs(acorn.top - timer.top) <= 4
        && Math.abs(far.top - acorn.top) <= 14
        && timer.left > acorn.right + 8
        && (!Number.isFinite(boardTop) || acorn.bottom <= stage.top + boardTop + 8)
        && (!Number.isFinite(boardLeft) || Math.abs((acorn.left - stage.left) - boardLeft) <= 10)
        && (!Number.isFinite(boardLeft) || !Number.isFinite(boardWidth)
          || Math.abs((timer.right - stage.left) - (boardLeft + boardWidth)) <= 18);
      const roomBelow = Number.isFinite(boardBottom) && (stage.top + boardBottom + 28 <= fab.top);
      const nameUnderBoard = !roomBelow || near.top >= stage.top + boardBottom - 4;
      const nameOnBoard = !Number.isFinite(boardCx) || Math.abs(farMid - boardCx) <= 24;
      const clearDock = (r) => !r || r.width === 0 || r.bottom <= fab.top - 2;
      return {
        ok: rowY
          && sameSize
          && guideOnOff
          && lobbyGone
          && settingsHidden
          && chromeRow
          && nameUnderBoard
          && nameOnBoard
          && Math.abs(slotMid - mid) <= 10
          && track.width >= 80
          && Math.abs(timer.height - acorn.height) <= 2
          && parseFloat(radius) >= timer.height / 2 - 2
          && clearDock(near)
          && near.width <= Math.max(80, (nearEl.textContent?.length ?? 1) * 20 + 32)
          && far.width <= Math.max(80, (farEl.textContent?.length ?? 1) * 20 + 32),
        mid,
        slotMid,
        boardCx,
        rowY,
        sameSize,
        guideOnOff,
        guideText,
        lobbyGone,
        settingsHidden,
        chromeRow,
        nameUnderBoard,
        nameOnBoard,
        guideW: guide.width,
        trackW: track.width,
        surrenderW: surrender.width,
        leaveW: leave.width,
        timerH: timer.height,
        acornH: acorn.height,
        radius: parseFloat(radius),
        clearNear: clearDock(near),
        nearW: near.width,
        farW: far.width,
        nearText: nearEl.textContent,
        farText: farEl.textContent,
      };
    });
    if (!hud.ok) {
      throw new Error(`${device.name} power hud off-center: ${JSON.stringify(hud)}`);
    }
    await page.evaluate(() => document.getElementById('lobby-leave')?.click());
    await page.waitForSelector('#lobby-users:not([hidden])', { timeout: 8000 });
    await page.evaluate(() => globalThis.__dotori.seedVirtualLobby());
    await page.waitForTimeout(400);
    const lobbyPanel = await page.evaluate(() => {
      const panel = document.getElementById('lobby-users');
      const rooms = [...document.querySelectorAll('.lobby-room-name')].map((el) => el.textContent.trim());
      const nick = document.getElementById('lobby-nick-input');
      const hint = document.getElementById('lobby-nick-hint');
      const save = document.getElementById('lobby-nick-save');
      const locGuide = document.getElementById('lobby-location-guide');
      const loc = document.querySelector('.lobby-user-loc')?.textContent;
      const near = document.getElementById('seat-name-black')?.textContent;
      const far = document.getElementById('seat-name-white')?.textContent;
      const quit = document.getElementById('lobby-exit');
      const fabEl = document.querySelector('#stage .floating-buttons');
      const sheet = document.getElementById('lobby-panel')?.getBoundingClientRect();
      const stageBox = document.getElementById('stage')?.getBoundingClientRect();
      const lobbyZ = Number(getComputedStyle(panel).zIndex);
      const fabZ = Number(getComputedStyle(fabEl).zIndex);
      const hudZ = Number(getComputedStyle(document.querySelector('#stage .hud-bottom-zone')).zIndex);
      const fabHidden = getComputedStyle(fabEl).visibility === 'hidden';
      const sheetMid = sheet ? (sheet.left + sheet.right) / 2 : 0;
      const stageMid = stageBox ? (stageBox.left + stageBox.right) / 2 : 0;
      const paused = Boolean(globalThis.__dotori?.engine?.isPaused?.());
      const roomCount = document.getElementById('user-count')?.textContent;
      return {
        ok: Boolean(
          panel && !panel.hidden && rooms.length >= 1
          && roomCount === String(rooms.length)
          && nick && nick.value.length <= 5 && /^도토리\d+$/.test(nick.value)
          && hint && hint.textContent.includes('5글자')
          && nick && !nick.disabled && save && !save.disabled
          && save && save.textContent.includes('저장')
          && locGuide && (locGuide.textContent.includes('위치는 항상 공개') || locGuide.textContent.includes('기다리') || locGuide.textContent.includes('초대'))
          && loc && loc.includes('위치')
          && near && far
          && quit && quit.textContent.includes('게임종료')
          && document.getElementById('lobby-mode-solo')?.textContent.includes('1인')
          && document.getElementById('lobby-mode-ai')?.textContent.includes('AI')
          && document.getElementById('lobby-mode-pvp')?.textContent.includes('1:1')
          && document.getElementById('lobby-book-bar-guide')?.textContent.includes('가이드북')
          && document.getElementById('lobby-book-bar-clinic')?.textContent.includes('점검')
          && lobbyZ > fabZ && lobbyZ > hudZ
          && fabHidden
          && paused
          && Math.abs(sheetMid - stageMid) <= 16
        ),
        rooms,
        nick: nick?.value,
        hint: hint?.textContent,
        near,
        far,
      };
    });
    if (!lobbyPanel.ok) {
      throw new Error(`${device.name} lobby rooms missing: ${JSON.stringify(lobbyPanel)}`);
    }
    const spectateClick = await page.evaluate(() => {
      const row = [...document.querySelectorAll('.lobby-room')].find((el) => {
        const name = el.querySelector('.lobby-room-name')?.textContent || '';
        const btn = el.querySelector('.spectate-btn');
        return Boolean(btn?.textContent.includes('관람하기') && name.includes('1:1'));
      });
      row?.querySelector('.spectate-btn')?.click();
      return Boolean(row);
    });
    if (!spectateClick) {
      throw new Error(`${device.name} pvp spectate button missing`);
    }
    await page.waitForTimeout(300);
    const spectateHud = await page.evaluate(() => {
      const bar = document.getElementById('spectate-bar');
      const stop = document.getElementById('spectate-stop');
      const leave = document.getElementById('spectate-leave');
      const watchers = document.getElementById('seat-watchers');
      const badge = document.getElementById('spectator-badge');
      const fab = document.querySelector('#stage .floating-buttons')?.getBoundingClientRect();
      const clearFab = (el) => {
        if (!el || el.hidden) return true;
        const r = el.getBoundingClientRect();
        if (r.width === 0) return true;
        return r.bottom <= fab.top - 2 || r.top >= fab.bottom + 2;
      };
      return {
        ok: Boolean(bar && !bar.hidden && stop && leave
          && stop.textContent.includes('관람 종료')
          && leave.textContent.includes('게임방 나가기')
          && watchers && !watchers.hidden && watchers.textContent.includes('관람')
          && fab && clearFab(bar) && clearFab(watchers) && clearFab(badge)
          && clearFab(document.getElementById('seat-name-black'))
          && clearFab(document.getElementById('seat-name-white'))),
        watchers: watchers?.textContent,
      };
    });
    if (!spectateHud.ok) {
      throw new Error(`${device.name} spectate controls missing: ${JSON.stringify(spectateHud)}`);
    }
    await page.locator('#spectate-leave').click({ force: true });
    await page.waitForSelector('#lobby-users:not([hidden])', { timeout: 8000 });
    const pvpWaitGuide = await page.evaluate(() => {
      const guide = document.getElementById('lobby-location-guide');
      const blinking = [...document.querySelectorAll('.lobby-room-status.is-wait-blink')];
      const anim = guide ? getComputedStyle(guide).animationName : '';
      return {
        ok: Boolean(
          guide?.classList.contains('is-wait-blink')
          && guide.textContent.includes('초대 대전')
          && anim.includes('blink')
          && blinking.length >= 1
          && blinking.every((el) => el.textContent.includes('초대 대전')),
        ),
        text: guide?.textContent,
        blinks: blinking.length,
        anim,
      };
    });
    if (!pvpWaitGuide.ok) {
      throw new Error(`${device.name} pvp wait blink missing: ${JSON.stringify(pvpWaitGuide)}`);
    }
    const stillInviting = await page.evaluate(() => {
      const btn = document.getElementById('lobby-mode-pvp');
      const hint = document.getElementById('lobby-pvp-hint');
      const balloon = document.getElementById('lobby-pvp-balloon');
      return Boolean(
        btn?.classList.contains('is-invite-blink')
        && hint?.textContent.includes('대국방')
        && !balloon
      );
    });
    if (!stillInviting) {
      throw new Error(`${device.name} pvp invite lost after seed`);
    }
    await page.evaluate(() => document.getElementById('lobby-mode-pvp')?.click());
    await page.waitForTimeout(200);
    const guidePick = await page.evaluate(() => {
      const pick = document.getElementById('pvp-guide-pick');
      const ask = document.getElementById('pvp-guide-ask');
      const on = document.getElementById('pvp-guide-on');
      const off = document.getElementById('pvp-guide-off');
      return {
        ok: Boolean(
          pick && !pick.hidden
          && ask?.textContent.includes('가이드선')
          && on?.textContent.includes('사용')
          && off?.textContent.includes('미사용')
        ),
        ask: ask?.textContent,
      };
    });
    if (!guidePick.ok) {
      throw new Error(`${device.name} pvp guide pick missing: ${JSON.stringify(guidePick)}`);
    }
    await page.evaluate(() => document.getElementById('pvp-guide-on')?.click());
    await page.waitForTimeout(350);
    const guideApplied = await page.evaluate(() => globalThis.__dotori?.renderer?.guideEnabled === true);
    if (!guideApplied) {
      throw new Error(`${device.name} pvp guide on not applied`);
    }
    await page.evaluate(() => globalThis.__dotori?.skipReadyAsk?.());
    await page.waitForTimeout(80);
    const pvpHint = await page.evaluate(() => {
      const hint = document.getElementById('pvp-start-hint');
      const start = document.getElementById('match-start');
      const anim = hint ? getComputedStyle(hint).animationName : '';
      return {
        ok: Boolean(hint && !hint.hidden
          && hint.textContent.includes('상대')
          && hint.textContent.includes('대기')
          && anim.includes('blink')
          && getComputedStyle(hint).whiteSpace.includes('nowrap')
          && hint.scrollWidth <= hint.clientWidth + 2
          && start && !start.hidden && start.disabled),
        anim,
      };
    });
    if (!pvpHint.ok) {
      throw new Error(`${device.name} pvp start hint missing: ${JSON.stringify(pvpHint)}`);
    }
    const waitFabs = await page.evaluate(() => {
      const sur = document.getElementById('surrender-btn');
      const leave = document.getElementById('lobby-leave');
      const hit = (el) => {
        const r = el?.getBoundingClientRect();
        if (!r || r.width < 8) return null;
        return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      };
      const sHit = hit(sur);
      const lHit = hit(leave);
      return {
        ok: Boolean(
          sur && leave && !leave.hidden && !sur.disabled && !leave.disabled
          && (sHit === sur || sur.contains(sHit))
          && (lHit === leave || leave.contains(lHit)),
        ),
        sHit: sHit?.id || sHit?.className,
        lHit: lHit?.id || lHit?.className,
        leaveHidden: leave?.hidden,
      };
    });
    if (!waitFabs.ok) {
      throw new Error(`${device.name} pvp-wait fabs blocked: ${JSON.stringify(waitFabs)}`);
    }
    await page.evaluate(() => document.getElementById('lobby-leave')?.click());
    await page.waitForSelector('#lobby-users:not([hidden])', { timeout: 8000 });
    await page.evaluate(() => {
      document.getElementById('lobby-settings')?.click();
    });
    await page.waitForFunction(() => {
      const modal = document.getElementById('settings-modal');
      return Boolean(modal && !modal.hidden && modal.getBoundingClientRect().width > 80);
    }, { timeout: 8000 });
    await page.waitForTimeout(400);
    const settings = await page.evaluate(() => {
      const stage = document.getElementById('stage')?.getBoundingClientRect();
      const close = document.getElementById('settings-close')?.getBoundingClientRect();
      const save = document.getElementById('settings-apply')?.getBoundingClientRect();
      const tone = document.getElementById('board-tone-panel');
      const toneBox = tone?.getBoundingClientRect();
      const dock = document.querySelector('.settings-dock')?.getBoundingClientRect();
      const modal = document.getElementById('settings-modal');
      const pad = 2;
      const inStage = (r) => r && stage && r.width > 0
        && r.top >= stage.top - pad
        && r.left >= stage.left - pad
        && r.bottom <= stage.bottom + pad
        && r.right <= stage.right + pad;
      const boardGap = toneBox && dock ? (dock.top - toneBox.bottom) : 0;
      const preview = document.getElementById('formation-preview')?.getBoundingClientRect();
      const settingsPower = document.getElementById('settings-power-ratio')?.getBoundingClientRect();
      const playToggles = document.getElementById('settings-play-toggles')?.getBoundingClientRect();
      const actionCam = document.getElementById('settings-action-cam');
      const rearrangeAsk = document.getElementById('settings-rearrange-ask');
      const volume = document.getElementById('settings-volume')?.getBoundingClientRect();
      const mute = document.getElementById('settings-mute');
      const caption = document.querySelector('.settings-lab-caption')?.getBoundingClientRect();
      const status = document.getElementById('formation-status')?.getBoundingClientRect();
      const labStage = document.querySelector('.settings-lab-stage')?.getBoundingClientRect();
      const expect = labStage ? Math.min(labStage.width, labStage.height) : 0;
      const filled = preview && expect > 0 && preview.width >= expect * 0.88
        && Math.abs(preview.width - preview.height) <= 3;
      const textsParked = caption && status && preview
        && caption.bottom <= preview.top + 8
        && status.top >= preview.bottom - 8
        && inStage(caption) && inStage(status);
      const dockBtns = [...document.querySelectorAll('.settings-dock button')]
        .filter((b) => b.offsetParent && !b.closest('[hidden]'))
        .map((b) => ({ t: b.textContent.trim(), box: b.getBoundingClientRect() }));
      const allDockIn = dockBtns.every((b) => inStage(b.box) && b.box.height >= 20);
      const bgGone = !document.getElementById('bg-match-file')
        && !document.getElementById('bg-lobby-file')
        && !localStorage.getItem('dotori-alkkagi-scene-bg');
      const lobbyGhost = document.getElementById('lobby-users');
      const boardGhost = document.getElementById('board');
      const noGhost = getComputedStyle(lobbyGhost).visibility === 'hidden'
        && getComputedStyle(boardGhost).visibility === 'hidden';
      return {
        ok: Boolean(
          modal && !modal.hidden
          && inStage(close) && inStage(save)
          && preview && preview.width >= 220 && preview.height >= 220 && inStage(preview)
          && filled
          && textsParked
          && settingsPower && settingsPower.width > 80 && inStage(settingsPower)
          && playToggles && playToggles.width > 80 && inStage(playToggles)
          && actionCam?.checked && rearrangeAsk?.checked
          && volume && volume.width > 24 && inStage(volume)
          && mute && (mute.textContent.includes('소리') || mute.textContent.includes('음소거'))
          && allDockIn
          && bgGone
          && noGhost
        ),
        filled,
        textsParked,
        expect,
        close,
        save,
        preview,
        settingsPower,
        tone: toneBox,
        dock,
        boardGap,
        dockCount: dockBtns.length,
        clipped: dockBtns.filter((b) => !inStage(b.box)).map((b) => b.t),
        stage,
      };
    });
    if (!settings.ok) {
      throw new Error(`${device.name} settings chrome clipped: ${JSON.stringify(settings)}`);
    }
    if (device.name === 'iPhone 14 Pro') {
      await page.locator('#settings-close').click({ force: true });
      await page.waitForTimeout(250);
      await page.evaluate(() => {
        const modal = document.getElementById('result-modal');
        if (!modal) return;
        modal.hidden = false;
        modal.removeAttribute('hidden');
      });
      await page.waitForTimeout(200);
      const resultActions = await page.evaluate(() => {
        const stage = document.getElementById('stage')?.getBoundingClientRect();
        const again = document.getElementById('result-again')?.getBoundingClientRect();
        const exitBtn = document.getElementById('result-exit');
        const exitBox = exitBtn?.getBoundingClientRect();
        const pad = 8;
        const inStage = (box) => box
          && box.width >= 80
          && box.height >= 40
          && box.left >= stage.left - pad
          && box.right <= stage.right + pad
          && box.top >= stage.top - pad
          && box.bottom <= stage.bottom + pad;
        return {
          ok: Boolean(again && exitBox && inStage(again) && inStage(exitBox)
            && exitBtn.textContent.includes('대기실')),
          againH: again?.height,
          exitH: exitBtn?.height,
          againW: again?.width,
          exitW: exitBtn?.width,
        };
      });
      if (!resultActions.ok) {
        throw new Error(`result actions missing: ${JSON.stringify(resultActions)}`);
      }
    }
    await page.close();
    console.log(`ok ${device.name}`, result.bounds);
  }
} finally {
  await browser.close();
  await server.close();
}

console.log(`wrote ${outFile}`);

// 프로토콜 Step 4: 헤드셋 2단 알림음 (1차 즉시, 5초 후 리마인드)
spawn(process.execPath, [path.join(root, 'scripts', 'headset-beep.js'), '--remind'], {
  detached: true,
  stdio: 'ignore',
  windowsHide: true,
}).unref();
