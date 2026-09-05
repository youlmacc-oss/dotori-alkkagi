/**
 * 프로토콜 헤드셋 2단 알림음.
 * 1단 880Hz/120ms → 80ms 무음 → 2단 1320Hz/180ms
 * --remind: 1차 재생 후 5초 뒤 동일 패턴 2차 리마인드.
 */
import { spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const remind = process.argv.includes('--remind');

function playOnce() {
  if (process.platform === 'win32') {
    const ps = [
      '[Console]::Beep(880,120);',
      'Start-Sleep -Milliseconds 80;',
      '[Console]::Beep(1320,180)',
    ].join(' ');
    const r = spawnSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', ps],
      { stdio: 'ignore', windowsHide: true },
    );
    if (r.error || r.status !== 0) {
      process.stderr.write('headset-beep: console beep failed\n');
      return false;
    }
    return true;
  }

  // POSIX fallback: speaker-beep via printf BEL if available is weak; try paplay/afplay tone via sox if present.
  const bel = spawnSync('printf', ['\\a'], { shell: true, stdio: 'ignore' });
  return bel.status === 0;
}

async function main() {
  const ok = playOnce();
  process.stdout.write(ok ? '🎧 [BEEP!] stage-1\n' : '🎧 [BEEP!] stage-1 (silent fallback)\n');
  if (!remind) return;
  await sleep(5000);
  playOnce();
  process.stdout.write('🎧 [BEEP!] stage-2 remind\n');
}

await main();
