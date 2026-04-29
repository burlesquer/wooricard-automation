const cron = require('node-cron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { createXlsxStore } = require('./lib/xlsx');

// File logging — appended to daemon.log (gitignored via *.log).
// console.log/error 출력을 stdout 과 동시에 file 로 tee.
const LOG_PATH = path.join(__dirname, 'daemon.log');
const logStream = fs.createWriteStream(LOG_PATH, { flags: 'a' });

function fmt(args) {
  return args.map((a) => (typeof a === 'string' ? a : require('util').inspect(a, { depth: 3 }))).join(' ');
}
const _origLog = console.log.bind(console);
const _origErr = console.error.bind(console);
console.log = (...args) => {
  _origLog(...args);
  try { logStream.write(fmt(args) + '\n'); } catch (_) {}
};
console.error = (...args) => {
  _origErr(...args);
  try { logStream.write(fmt(args) + '\n'); } catch (_) {}
};

const TZ = 'Asia/Seoul';
const MAIN_SCRIPT = path.join(__dirname, 'wooricard-main.js');
const HOURLY_SCHEDULE = process.env.DAEMON_HOURLY_SCHEDULE || '59 * * * *'; // every hour at :59
const BRIEFING_SCHEDULE = process.env.DAEMON_BRIEFING_SCHEDULE || '30 9 * * *'; // 09:30 daily (8:59 hourly 종료 후 28분 버퍼)
const SHEET_CREATE_SCHEDULE = '20 0 1 * *'; // 00:20 on 1st of every month (넉넉한 버퍼)
const BRIEFING_HOUR = 9;
const BRIEFING_MINUTE = 30;

const config = require('./config.json');
const XLSX_CONFIG = config.xlsx || { path: './복리후생비.xlsx' };
const xlsxStore = createXlsxStore(
  path.resolve(__dirname, XLSX_CONFIG.path),
  { columns: XLSX_CONFIG.columns }
);

function nowKst() {
  return new Date().toLocaleString('ko-KR', { timeZone: TZ });
}

function kstParts() {
  const now = new Date().toLocaleString('en-US', {
    timeZone: TZ, hour: '2-digit', hour12: false, day: '2-digit',
  });
  const [date, hour] = now.split(', ');
  const day = parseInt(date.split('/')[1], 10);
  return { hour: parseInt(hour, 10), day };
}

// Briefing marker — node-cron daily cron 이 missed/dropped 되어도 watchdog 또는
// process startup 시 catch-up 가능하도록 하루 1회 정상 발화 여부를 file 로 기록.
const BRIEFING_MARKER_DIR = path.join(__dirname, 'state', 'briefing');
function todayKstYmd() {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
  return `${d.getFullYear()}-${('0' + (d.getMonth() + 1)).slice(-2)}-${('0' + d.getDate()).slice(-2)}`;
}
function briefingMarkerPath(ymd) {
  return path.join(BRIEFING_MARKER_DIR, `${ymd}.done`);
}
function isBriefingDone(ymd) {
  try { return fs.existsSync(briefingMarkerPath(ymd)); } catch (_) { return false; }
}
function markBriefingDone(ymd) {
  try {
    fs.mkdirSync(BRIEFING_MARKER_DIR, { recursive: true });
    fs.writeFileSync(briefingMarkerPath(ymd), new Date().toISOString());
  } catch (e) { console.error(`[${nowKst()}] briefing marker write failed:`, e.message); }
  cleanupOldMarkers();
}

// Marker retention — 30일 초과 marker 파일 삭제. write 직후 호출되므로 daily 1회 실행.
const MARKER_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
function cleanupOldMarkers() {
  try {
    const cutoff = Date.now() - MARKER_RETENTION_MS;
    const entries = fs.readdirSync(BRIEFING_MARKER_DIR);
    let removed = 0;
    for (const name of entries) {
      if (!name.endsWith('.done')) continue;
      const full = path.join(BRIEFING_MARKER_DIR, name);
      try {
        const stat = fs.statSync(full);
        if (stat.mtimeMs < cutoff) {
          fs.unlinkSync(full);
          removed += 1;
        }
      } catch (_) {}
    }
    if (removed > 0) console.log(`[${nowKst()}] 🧹 marker cleanup: removed ${removed} file(s) older than 30d`);
  } catch (e) { console.error(`[${nowKst()}] marker cleanup failed:`, e.message); }
}

// Briefing 수행 + marker write — primary cron, watchdog, startup 셋 다 호출.
// marker 검사로 idempotent 보장 (startup 이 9:15에 발화 후 9:30 cron 중복 발화 방지).
async function runBriefing() {
  const today = todayKstYmd();
  if (isBriefingDone(today)) {
    console.log(`[${nowKst()}] ✓ briefing ${today} 이미 완료, skip`);
    return;
  }
  await withMutex(async () => {
    if (isBriefingDone(today)) return; // mutex 대기 중에 다른 entry 가 처리했을 가능성
    const { day } = kstParts();
    if (day === 1) await spawnMain({ mode: 'monthly-capture' });
    await spawnMain({ mode: 'briefing' });
    markBriefingDone(today);
  }, { queue: true });
}

let running = false;

function spawnMain({ mode }) {
  return new Promise((resolve) => {
    const args = [MAIN_SCRIPT];
    let label = '🔄 hourly check';
    if (mode === 'briefing') { args.push('--briefing'); label = '🌅 briefing'; }
    else if (mode === 'monthly-capture') { args.push('--monthly-capture'); label = '📸 monthly capture'; }
    console.log(`[${nowKst()}] ▶ ${label}`);
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

// queue:true → wait until mutex frees, then run (max 10 min wait)
// queue:false (default) → skip if mutex busy
async function withMutex(fn, { queue = false, maxWaitMs = 10 * 60 * 1000 } = {}) {
  if (running) {
    if (!queue) {
      console.log(`[${nowKst()}] ⏸ Previous run still in progress — skipping`);
      return;
    }
    console.log(`[${nowKst()}] ⏳ Previous run in progress — queued (wait up to ${maxWaitMs / 1000}s)`);
    const t0 = Date.now();
    while (running && Date.now() - t0 < maxWaitMs) {
      await new Promise((r) => setTimeout(r, 2000));
    }
    if (running) {
      console.log(`[${nowKst()}] ❌ Wait timeout — abandoning queued task`);
      return;
    }
    console.log(`[${nowKst()}] ▶ Queued task starting after ${(Date.now() - t0) / 1000}s wait`);
  }
  running = true;
  try { await fn(); } finally { running = false; }
}

console.log('========================================');
console.log('  우리카드 자동화 데몬');
console.log('========================================');
console.log(`Hourly schedule:  ${HOURLY_SCHEDULE}  (skips ${BRIEFING_HOUR}시대 + 1일 0시대)`);
console.log(`Briefing:         ${BRIEFING_SCHEDULE}  (09:30 daily, 1st also triggers monthly-capture)`);
console.log(`Briefing watchdog: 35 9 * * *  (09:35 catch-up if marker missing)`);
console.log(`Sheet create:     ${SHEET_CREATE_SCHEDULE}  (새 월 xlsx 시트)`);
console.log(`Timezone:         ${TZ}`);
console.log(`Concurrency:      mutex — overlapping ticks are skipped`);
console.log('Press Ctrl+C to stop.');
console.log('========================================\n');

// node-cron 4.x 는 second-precise 매칭이라 OS jitter 로 heartbeat 가 1초만 늦어도 tick 누락됨.
// task.on('execution:missed') 로 누락 감지 시 즉시 catch-up 실행.
function scheduleWithCatchup(pattern, taskFn, label) {
  const task = cron.schedule(pattern, taskFn, { timezone: TZ });
  task.on('execution:missed', () => {
    console.log(`[${nowKst()}] ⚠️  ${label} missed (OS jitter) — catch-up 실행`);
    taskFn().catch((e) => console.error(`[${nowKst()}] ${label} catch-up error:`, e.message));
  });
  return task;
}

// Hourly tick — skips:
//   - 9시대 (9:30 briefing 이 같은 시간 데이터를 수집하므로 9:59 hourly 는 redundant)
//   - 1일 0시대 (sheet-create cron 담당)
// 8시대 (8:59) 는 정상 진행 — briefing 09:30 까지 28분 버퍼 있어 spill 위험 없음.
scheduleWithCatchup(HOURLY_SCHEDULE, async () => {
  const { hour, day } = kstParts();
  if (hour === BRIEFING_HOUR) {
    console.log(`[${nowKst()}] ⏭️  ${BRIEFING_HOUR}시대 — briefing cron 이 담당, skip`);
    return;
  }
  if (day === 1 && hour === 0) {
    console.log(`[${nowKst()}] ⏭️  1일 0시대 — sheet-create cron 이 담당, skip`);
    return;
  }
  await withMutex(() => spawnMain({ mode: 'hourly' }));
}, 'hourly');

// Daily briefing at 09:00 — on 1st of month, also runs monthly-capture first.
// runBriefing() = mutex + monthly-capture + briefing + marker write.
scheduleWithCatchup(BRIEFING_SCHEDULE, async () => {
  await runBriefing();
}, 'briefing');

// Watchdog at 09:35 — node-cron daily cron 이 어떤 이유로든 fire 안 됐을 때 catch-up.
// runBriefing() 내부에서 marker 검사하므로 여기서는 단순 호출만.
scheduleWithCatchup('35 9 * * *', async () => {
  const today = todayKstYmd();
  if (isBriefingDone(today)) {
    console.log(`[${nowKst()}] ✓ briefing-watchdog: ${today} 이미 완료, skip`);
    return;
  }
  console.log(`[${nowKst()}] ⚠️  briefing-watchdog: ${today} 미완료 — catch-up 실행`);
  await runBriefing();
}, 'briefing-watchdog');

// Monthly xlsx sheet creation at 00:20 on 1st
// 00:20 = 23:59 hourly (~3분) 종료 후 18분 버퍼. 충돌 거의 불가능.
// queue:true 는 만일에 대비한 안전망 (정상 케이스에서는 mutex 비어있음).
scheduleWithCatchup(SHEET_CREATE_SCHEDULE, async () => {
  await withMutex(async () => {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
    const y = now.getFullYear();
    const m = ('0' + (now.getMonth() + 1)).slice(-2);
    const newYM = `${y}-${m}`;
    console.log(`\n[${nowKst()}] 📅 Monthly sheet creation triggered for ${newYM}`);
    try {
      const res = await xlsxStore.createMonthSheet(newYM);
      console.log(`[${nowKst()}] ${res ? '✅' : '❌'} createMonthSheet(${newYM}) = ${res}`);
    } catch (e) {
      console.error(`[${nowKst()}] Sheet creation error:`, e.message);
    }
  }, { queue: true });
}, 'sheet-create');

// Startup catch-up — daemon restart 시 오늘 briefing 시각(09:30) 이후이고 marker 없으면 즉시 trigger.
// 이게 있어야 4/28 22:59 missed-event 같은 사고로 daily cron 망가져도 다음 daemon 재시작에서 복구됨.
// runBriefing() 이 idempotent 하므로 9:30 cron 이 곧이어 fire 해도 중복 발화 없음.
(async function startupBriefingCheck() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
  const pastBriefingTime =
    now.getHours() > BRIEFING_HOUR ||
    (now.getHours() === BRIEFING_HOUR && now.getMinutes() >= BRIEFING_MINUTE);
  const today = todayKstYmd();
  if (pastBriefingTime && !isBriefingDone(today)) {
    console.log(`[${nowKst()}] 🚀 startup catch-up: briefing ${today} 미완료 — 즉시 실행`);
    await runBriefing();
  } else if (pastBriefingTime) {
    console.log(`[${nowKst()}] ✓ startup: briefing ${today} 이미 완료`);
  }
})();

if (process.argv.includes('--run-now')) {
  console.log('[--run-now] Triggering hourly immediately for smoke test...');
  withMutex(() => spawnMain({ mode: 'hourly' }));
}

process.on('SIGINT', () => { console.log('\nDaemon stopping (SIGINT).'); process.exit(0); });
process.on('SIGTERM', () => { console.log('\nDaemon stopping (SIGTERM).'); process.exit(0); });
