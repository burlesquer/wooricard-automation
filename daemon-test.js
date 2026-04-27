// TEST 데몬 — 박성준만, 단축 스케줄, day-check 우회.
// 실행: node daemon-test.js
// 로그: daemon-test.log (gitignored via *.log)
// 종료: Ctrl+C
const cron = require('node-cron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { createXlsxStore } = require('./lib/xlsx');

const TZ = 'Asia/Seoul';
const MAIN_SCRIPT = path.join(__dirname, 'wooricard-main.js');
const TEST_ACCOUNT = '박성준';

// TEST schedules
const HOURLY_TEST = '*/2 * * * *';            // 매 2분
const BRIEFING_TEST = '20 10 * * *';          // 10:20
const MONTHLY_CAPTURE_TEST = '23 10 * * *';   // 10:23 (별도 cron, day 체크 우회)
const SHEET_CREATE_TEST = '26 10 * * *';      // 10:26

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

const config = require('./config.json');
const XLSX_CONFIG = config.xlsx || { path: './복리후생비.xlsx' };
const xlsxStore = createXlsxStore(
  path.resolve(__dirname, XLSX_CONFIG.path),
  { columns: XLSX_CONFIG.columns }
);

function nowKst() {
  return new Date().toLocaleString('ko-KR', { timeZone: TZ });
}

let running = false;

function spawnMain({ mode }) {
  return new Promise((resolve) => {
    const args = [MAIN_SCRIPT, '--account', TEST_ACCOUNT];
    let label = '🔄 hourly check';
    if (mode === 'briefing') { args.push('--briefing'); label = '🌅 briefing'; }
    else if (mode === 'monthly-capture') { args.push('--monthly-capture'); label = '📸 monthly capture'; }
    console.log(`[${nowKst()}] ▶ TEST ${label} (account=${TEST_ACCOUNT})`);
    const child = spawn('node', args, { stdio: ['inherit', 'pipe', 'pipe'] });
    child.stdout.on('data', (chunk) => { process.stdout.write(chunk); try { logStream.write(chunk); } catch (_) {} });
    child.stderr.on('data', (chunk) => { process.stderr.write(chunk); try { logStream.write(chunk); } catch (_) {} });
    child.on('exit', (code) => {
      console.log(`[${nowKst()}] ◀ TEST ${label} exit: ${code === 0 ? 'OK' : `FAIL (${code})`}\n`);
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
      console.log(`[${nowKst()}] ⏸ TEST mutex busy — skip`);
      return;
    }
    console.log(`[${nowKst()}] ⏳ TEST mutex busy — queued`);
    const t0 = Date.now();
    while (running && Date.now() - t0 < maxWaitMs) {
      await new Promise((r) => setTimeout(r, 2000));
    }
    if (running) { console.log(`[${nowKst()}] ❌ wait timeout`); return; }
  }
  running = true;
  try { await fn(); } finally { running = false; }
}

function scheduleWithCatchup(pattern, taskFn, label) {
  const task = cron.schedule(pattern, taskFn, { timezone: TZ });
  task.on('execution:missed', () => {
    console.log(`[${nowKst()}] ⚠️  TEST ${label} missed (OS jitter) — catch-up`);
    taskFn().catch((e) => console.error(`[${nowKst()}] TEST ${label} catch-up error:`, e.message));
  });
  return task;
}

console.log('========================================');
console.log('  TEST 데몬 — 박성준만, 단축 스케줄');
console.log('========================================');
console.log(`Hourly:           ${HOURLY_TEST}`);
console.log(`Briefing:         ${BRIEFING_TEST}`);
console.log(`Monthly capture:  ${MONTHLY_CAPTURE_TEST}`);
console.log(`Sheet create:     ${SHEET_CREATE_TEST}`);
console.log(`Account filter:   ${TEST_ACCOUNT}`);
console.log(`Log file:         ${LOG_PATH}`);
console.log(`Started at:       ${nowKst()}`);
console.log('========================================\n');

scheduleWithCatchup(HOURLY_TEST, async () => {
  await withMutex(() => spawnMain({ mode: 'hourly' }));
}, 'hourly');

scheduleWithCatchup(BRIEFING_TEST, async () => {
  await withMutex(() => spawnMain({ mode: 'briefing' }), { queue: true });
}, 'briefing');

scheduleWithCatchup(MONTHLY_CAPTURE_TEST, async () => {
  await withMutex(() => spawnMain({ mode: 'monthly-capture' }), { queue: true });
}, 'monthly-capture');

scheduleWithCatchup(SHEET_CREATE_TEST, async () => {
  await withMutex(async () => {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
    const y = now.getFullYear();
    const nextMonth = now.getMonth() + 2; // current month idx (0-based) + 1 = 다음달, +1 더해서 1-based 보정
    const m = ('0' + nextMonth).slice(-2);
    const newYM = `${y}-${m}`;
    console.log(`[${nowKst()}] 📅 TEST sheet creation: ${newYM} (수동 삭제 필요)`);
    try {
      const res = await xlsxStore.createMonthSheet(newYM);
      console.log(`[${nowKst()}] ${res ? '✅' : '❌'} createMonthSheet(${newYM}) = ${res}`);
    } catch (e) {
      console.error(`[${nowKst()}] Sheet creation error:`, e.message);
    }
  }, { queue: true });
}, 'sheet-create');

process.on('SIGINT', () => { console.log('\nTEST daemon stopping (SIGINT).'); process.exit(0); });
process.on('SIGTERM', () => { console.log('\nTEST daemon stopping (SIGTERM).'); process.exit(0); });
