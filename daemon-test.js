// daemon-test.js — node-cron silent-miss 재현 + watcher 해결책 검증.
//
// 3 모드 (env TEST_MODE 로 전환):
//
//   TEST_MODE=reproduce (default)
//     안 되는 상황 재현. briefing/capture cron 은 등록 직후 task.stop() 으로 정지.
//     → cron entry 는 존재하지만 fire 안 함 (production 의 silent miss 와 동등).
//     watcher 없음. startup catch-up 없음.
//     기대 결과: brief/capture 발화 절대 안 함. 박성준에게 DM 안 옴.
//     이게 확인되면 "현재 문제" 재현 성공.
//
//   TEST_MODE=solution
//     reproduce + watcher 추가. cron 은 여전히 stop 된 상태.
//     기대 결과: cron 은 fire 안 해도 watcher 가 marker 검사로 catch-up.
//     박성준에게 DM 옴. → watcher 가 해결책으로 작동함을 검증.
//
//   TEST_MODE=full
//     모든 cron 정상 + watcher + startup catch-up.
//     기대 결과: 첫 발화 후 모든 후속 trigger 는 marker idempotent 로 skip.
//     중복 발화 없음 확인.
//
// 공통 안전장치:
//   - --account 박성준 + --no-xlsx 강제 주입
//   - marker 디렉터리 격리 → state-test/{briefing,capture}/
//   - log 파일 격리 → daemon-test.log

const cron = require('node-cron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// File logging
const LOG_PATH = path.join(__dirname, 'daemon-test.log');
const logStream = fs.createWriteStream(LOG_PATH, { flags: 'a' });
function fmt(args) {
  return args.map((a) => (typeof a === 'string' ? a : require('util').inspect(a, { depth: 3 }))).join(' ');
}
const _origLog = console.log.bind(console);
const _origErr = console.error.bind(console);
console.log = (...args) => { _origLog(...args); try { logStream.write(fmt(args) + '\n'); } catch (_) {} };
console.error = (...args) => { _origErr(...args); try { logStream.write(fmt(args) + '\n'); } catch (_) {} };

const TZ = 'Asia/Seoul';
const MAIN_SCRIPT = path.join(__dirname, 'wooricard-main.js');
const TEST_ACCOUNT = process.env.DAEMON_TEST_ACCOUNT || '박성준';

const TEST_MODE = process.env.TEST_MODE || 'reproduce';
const VALID_MODES = ['reproduce', 'solution', 'full'];
if (!VALID_MODES.includes(TEST_MODE)) {
  console.error(`Invalid TEST_MODE: ${TEST_MODE}. Use one of: ${VALID_MODES.join(', ')}`);
  process.exit(1);
}

const HOURLY_SCHEDULE = process.env.DAEMON_TEST_HOURLY_SCHEDULE || '*/20 * * * *';
const BRIEFING_SCHEDULE = process.env.DAEMON_TEST_BRIEFING_SCHEDULE || '*/4 * * * *';
const CAPTURE_SCHEDULE = process.env.DAEMON_TEST_CAPTURE_SCHEDULE || '*/5 * * * *';
const WATCHER_SCHEDULE = process.env.DAEMON_TEST_WATCHER_SCHEDULE || '*/2 * * * *';

// Test marker — state-test/ 디렉터리 격리
const STATE_TEST_DIR = path.join(__dirname, 'state-test');
const BRIEFING_MARKER_DIR = path.join(STATE_TEST_DIR, 'briefing');
const CAPTURE_MARKER_DIR = path.join(STATE_TEST_DIR, 'capture');
fs.mkdirSync(BRIEFING_MARKER_DIR, { recursive: true });
fs.mkdirSync(CAPTURE_MARKER_DIR, { recursive: true });

function nowKst() { return new Date().toLocaleString('ko-KR', { timeZone: TZ }); }
function todayKstYmd() {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
  return `${d.getFullYear()}-${('0' + (d.getMonth() + 1)).slice(-2)}-${('0' + d.getDate()).slice(-2)}`;
}
function todayKstYm() {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
  return `${d.getFullYear()}-${('0' + (d.getMonth() + 1)).slice(-2)}`;
}
function briefingMarkerPath(ymd) { return path.join(BRIEFING_MARKER_DIR, `${ymd}.done`); }
function captureMarkerPath(ym) { return path.join(CAPTURE_MARKER_DIR, `${ym}.done`); }
function isBriefingDone(ymd) { try { return fs.existsSync(briefingMarkerPath(ymd)); } catch (_) { return false; } }
function isCaptureDone(ym) { try { return fs.existsSync(captureMarkerPath(ym)); } catch (_) { return false; } }
function markBriefingDone(ymd) {
  try { fs.writeFileSync(briefingMarkerPath(ymd), new Date().toISOString()); }
  catch (e) { console.error(`[${nowKst()}] briefing marker write failed:`, e.message); }
}
function markCaptureDone(ym) {
  try { fs.writeFileSync(captureMarkerPath(ym), new Date().toISOString()); }
  catch (e) { console.error(`[${nowKst()}] capture marker write failed:`, e.message); }
}

async function runBriefing(trigger) {
  const today = todayKstYmd();
  if (isBriefingDone(today)) {
    console.log(`[${nowKst()}] ✓ briefing ${today} 이미 완료, skip (trigger=${trigger})`);
    return;
  }
  await withMutex(async () => {
    if (isBriefingDone(today)) return;
    console.log(`[${nowKst()}] ▶▶ briefing 실행 (trigger=${trigger})`);
    await spawnMain({ mode: 'briefing' });
    markBriefingDone(today);
    console.log(`[${nowKst()}] ✓ briefing marker write: ${briefingMarkerPath(today)}`);
  }, { queue: true });
}
async function runMonthlyCapture(trigger) {
  const ym = todayKstYm();
  if (isCaptureDone(ym)) {
    console.log(`[${nowKst()}] ✓ monthly-capture ${ym} 이미 완료, skip (trigger=${trigger})`);
    return;
  }
  await withMutex(async () => {
    if (isCaptureDone(ym)) return;
    console.log(`[${nowKst()}] ▶▶ monthly-capture 실행 (trigger=${trigger})`);
    await spawnMain({ mode: 'monthly-capture' });
    markCaptureDone(ym);
    console.log(`[${nowKst()}] ✓ capture marker write: ${captureMarkerPath(ym)}`);
  }, { queue: true });
}

let running = false;
function spawnMain({ mode }) {
  return new Promise((resolve) => {
    const args = [MAIN_SCRIPT, '--account', TEST_ACCOUNT, '--no-xlsx'];
    let label = '🔄 hourly check';
    if (mode === 'briefing') { args.push('--briefing'); label = '🌅 briefing'; }
    else if (mode === 'monthly-capture') { args.push('--monthly-capture'); label = '📸 monthly capture'; }
    console.log(`[${nowKst()}] ▶ ${label}  args=[${args.slice(1).join(' ')}]`);
    const child = spawn('node', args, { stdio: ['inherit', 'pipe', 'pipe'] });
    child.stdout.on('data', (chunk) => { process.stdout.write(chunk); try { logStream.write(chunk); } catch (_) {} });
    child.stderr.on('data', (chunk) => { process.stderr.write(chunk); try { logStream.write(chunk); } catch (_) {} });
    child.on('exit', (code) => {
      console.log(`[${nowKst()}] ◀ ${label} exit: ${code === 0 ? 'OK' : `FAIL (${code})`}\n`);
      resolve();
    });
    child.on('error', (err) => {
      console.error(`[${nowKst()}] Spawn error:`, err.message);
      resolve();
    });
  });
}

async function withMutex(fn, { queue = false, maxWaitMs = 10 * 60 * 1000 } = {}) {
  if (running) {
    if (!queue) {
      console.log(`[${nowKst()}] ⏸ Previous run in progress — skipping`);
      return;
    }
    console.log(`[${nowKst()}] ⏳ Previous run in progress — queued (wait up to ${maxWaitMs / 1000}s)`);
    const t0 = Date.now();
    while (running && Date.now() - t0 < maxWaitMs) await new Promise((r) => setTimeout(r, 2000));
    if (running) { console.log(`[${nowKst()}] ❌ Wait timeout — abandoning`); return; }
    console.log(`[${nowKst()}] ▶ Queued task starting after ${(Date.now() - t0) / 1000}s wait`);
  }
  running = true;
  try { await fn(); } finally { running = false; }
}

function scheduleWithCatchup(pattern, taskFn, label) {
  const task = cron.schedule(pattern, taskFn, { timezone: TZ });
  task.on('execution:missed', () => {
    console.log(`[${nowKst()}] ⚠️  ${label} missed — catch-up 실행`);
    taskFn().catch((e) => console.error(`[${nowKst()}] ${label} catch-up error:`, e.message));
  });
  return task;
}

// 모드별 동작 정의
const RUN_BRIEFING_CRON = (TEST_MODE === 'full');         // reproduce/solution: cron stop
const RUN_CAPTURE_CRON = (TEST_MODE === 'full');          // reproduce/solution: cron stop
const RUN_WATCHER = (TEST_MODE === 'solution' || TEST_MODE === 'full');
const RUN_STARTUP_CATCHUP = (TEST_MODE === 'full');

console.log('=================================================');
console.log(`  우리카드 데몬 [TEST MODE = ${TEST_MODE}]`);
console.log('=================================================');
console.log(`Account:       ${TEST_ACCOUNT} (실제 wooricard 접속, --no-xlsx)`);
console.log(`Timezone:      ${TZ}`);
console.log(`Started at:    ${nowKst()}`);
console.log('');
if (TEST_MODE === 'reproduce') {
  console.log('🎯 [REPRODUCE MODE] 안 되는 상황 재현');
  console.log('   - briefing/capture cron: 등록 직후 task.stop() → fire 안 함');
  console.log('   - watcher: 없음');
  console.log('   - startup catch-up: 없음');
  console.log('   - hourly cron: 정상 동작 (production 의 5-12 패턴 재현)');
  console.log('   기대: brief/capture 영원히 발화 안 함. 박성준에게 DM 안 옴.');
} else if (TEST_MODE === 'solution') {
  console.log('🎯 [SOLUTION MODE] watcher 해결책 검증');
  console.log('   - briefing/capture cron: stop (production 의 silent miss 와 동일)');
  console.log(`   - watcher: ${WATCHER_SCHEDULE} 활성`);
  console.log('   - startup catch-up: 없음');
  console.log('   기대: cron 은 fire 안 해도 watcher 가 catch-up → 박성준에게 DM 옴.');
} else {
  console.log('🎯 [FULL MODE] 모든 cron + watcher + startup catch-up');
  console.log(`   - briefing cron: ${BRIEFING_SCHEDULE}`);
  console.log(`   - capture cron:  ${CAPTURE_SCHEDULE}`);
  console.log(`   - watcher:       ${WATCHER_SCHEDULE}`);
  console.log('   - startup catch-up: 활성');
  console.log('   기대: 첫 발화 후 후속 trigger 는 marker idempotent 로 skip. 중복 없음.');
}
console.log('');
console.log(`Hourly cron:   ${HOURLY_SCHEDULE} (모든 mode 에서 활성)`);
console.log(`Marker dir:    ${STATE_TEST_DIR}`);
console.log(`Log file:      ${LOG_PATH}`);
console.log('');
console.log('마커 삭제 (PowerShell):');
console.log(`  Remove-Item "${path.join(BRIEFING_MARKER_DIR, todayKstYmd() + '.done')}"`);
console.log(`  Remove-Item "${path.join(CAPTURE_MARKER_DIR, todayKstYm() + '.done')}"`);
console.log('Ctrl+C 로 종료.');
console.log('=================================================\n');

// Hourly — 모든 mode 에서 정상 동작 (production 5-12 의 hourly 가 도는 패턴 재현)
scheduleWithCatchup(HOURLY_SCHEDULE, async () => {
  console.log(`[${nowKst()}] [cron:hourly] tick`);
  await withMutex(() => spawnMain({ mode: 'hourly' }));
}, 'hourly');

// Briefing cron — 등록은 항상 하지만 reproduce/solution mode 에서 즉시 stop
const briefingTask = scheduleWithCatchup(BRIEFING_SCHEDULE, async () => {
  console.log(`[${nowKst()}] [cron:briefing] tick`);
  await runBriefing('cron:briefing');
}, 'briefing');
if (!RUN_BRIEFING_CRON) {
  briefingTask.stop();
  console.log(`[${nowKst()}] 🚫 briefing cron stopped (mode=${TEST_MODE} — silent miss 시뮬레이션)`);
}

// Capture cron — 동일
const captureTask = scheduleWithCatchup(CAPTURE_SCHEDULE, async () => {
  console.log(`[${nowKst()}] [cron:capture] tick`);
  await runMonthlyCapture('cron:capture');
}, 'monthly-capture');
if (!RUN_CAPTURE_CRON) {
  captureTask.stop();
  console.log(`[${nowKst()}] 🚫 capture cron stopped (mode=${TEST_MODE} — silent miss 시뮬레이션)`);
}

// Watcher — solution/full mode 에서만 활성
if (RUN_WATCHER) {
  scheduleWithCatchup(WATCHER_SCHEDULE, async () => {
    const ymd = todayKstYmd();
    const ym = todayKstYm();
    const briefingPending = !isBriefingDone(ymd);
    const capturePending = !isCaptureDone(ym);
    console.log(`[${nowKst()}] [watcher] tick — briefing:${briefingPending ? 'PENDING' : 'done'} capture:${capturePending ? 'PENDING' : 'done'}`);
    if (briefingPending) await runBriefing('watcher');
    if (capturePending) await runMonthlyCapture('watcher');
  }, 'watcher');
  console.log(`[${nowKst()}] ✅ watcher 활성 (${WATCHER_SCHEDULE})`);
} else {
  console.log(`[${nowKst()}] 🚫 watcher 비활성 (mode=${TEST_MODE})`);
}

// Startup catch-up — full mode 에서만
if (RUN_STARTUP_CATCHUP) {
  (async function startupCheck() {
    const ymd = todayKstYmd();
    const ym = todayKstYm();
    if (!isBriefingDone(ymd)) {
      console.log(`[${nowKst()}] 🚀 startup: briefing ${ymd} marker 없음 → 즉시 실행`);
      await runBriefing('startup');
    } else {
      console.log(`[${nowKst()}] ✓ startup: briefing ${ymd} 이미 완료`);
    }
    if (!isCaptureDone(ym)) {
      console.log(`[${nowKst()}] 🚀 startup: capture ${ym} marker 없음 → 즉시 실행`);
      await runMonthlyCapture('startup');
    } else {
      console.log(`[${nowKst()}] ✓ startup: capture ${ym} 이미 완료`);
    }
  })();
} else {
  console.log(`[${nowKst()}] 🚫 startup catch-up 비활성 (mode=${TEST_MODE})`);
}

process.on('SIGINT', () => { console.log('\nTEST daemon stopping (SIGINT).'); process.exit(0); });
process.on('SIGTERM', () => { console.log('\nTEST daemon stopping (SIGTERM).'); process.exit(0); });
