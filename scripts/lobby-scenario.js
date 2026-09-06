/**
 * 브라우저에서 대기실 현황 → 관람 10초 → 대기실 복귀를 보여 준다.
 */
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outFile = path.join(root, 'public', 'test-result.png');

const server = await createServer({
  root,
  optimizeDeps: { force: true },
  server: {
    port: 4182,
    strictPort: true,
    host: '127.0.0.1',
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  },
});
await server.listen();

const browser = await chromium.launch({
  headless: false,
  slowMo: 280,
});
const page = await browser.newPage({
  viewport: { width: 420, height: 860 },
  deviceScaleFactor: 2,
});

try {
  await page.goto('http://127.0.0.1:4182/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => Boolean(globalThis.__dotori?.realtimeManager), { timeout: 30000 });
  await page.waitForTimeout(800);

  const seeded = await page.evaluate(() => globalThis.__dotori.seedVirtualLobby());
  if (!seeded?.ok || seeded.rooms < 9 || seeded.users < 10) {
    throw new Error(`seed failed: ${JSON.stringify(seeded)}`);
  }

  await page.waitForTimeout(2500);
  const lobby = await page.evaluate(() => {
    const rooms = [...document.querySelectorAll('.lobby-room-name')].map((el) => el.textContent.trim());
    const count = document.getElementById('user-count')?.textContent;
    const waiting = [...document.querySelectorAll('.lobby-user-status')]
      .some((el) => el.textContent.includes('대기중'));
    return { rooms, count, waiting, roomN: rooms.length };
  });
  if (lobby.roomN < 9 || lobby.count !== '9' || !lobby.waiting) {
    throw new Error(`lobby monitor failed: ${JSON.stringify(lobby)}`);
  }

  await page.evaluate(() => {
    const row = [...document.querySelectorAll('.lobby-room')].find((el) => {
      const name = el.querySelector('.lobby-room-name')?.textContent || '';
      const btn = el.querySelector('.spectate-btn');
      return Boolean(btn?.textContent.includes('관람하기') && name.includes('1:1'));
    });
    row?.querySelector('.spectate-btn')?.click();
  });
  await page.waitForTimeout(600);
  const watching = await page.evaluate(() => {
    const bar = document.getElementById('spectate-bar');
    return Boolean(bar && !bar.hidden);
  });
  if (!watching) throw new Error('spectate enter failed');

  await page.waitForTimeout(10000);

  await page.evaluate(() => document.getElementById('spectate-leave')?.click());
  await page.waitForTimeout(800);
  const back = await page.evaluate(() => {
    const panel = document.getElementById('lobby-users');
    const rooms = document.querySelectorAll('.lobby-room-name').length;
    const count = document.getElementById('user-count')?.textContent;
    return { open: panel && !panel.hidden, rooms, count };
  });
  if (!back.open || back.rooms < 9 || back.count !== '9') {
    throw new Error(`return lobby failed: ${JSON.stringify(back)}`);
  }

  await page.screenshot({ path: outFile, timeout: 60000 });
  await page.waitForTimeout(4000);
} finally {
  await browser.close();
  await server.close();
}

console.log(`wrote ${outFile}`);
spawn(process.execPath, [path.join(root, 'scripts', 'headset-beep.js'), '--remind'], {
  detached: true,
  stdio: 'ignore',
  windowsHide: true,
});
