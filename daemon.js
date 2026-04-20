const cron = require('node-cron');
const { spawn } = require('child_process');
const path = require('path');
const { createXlsxStore } = require('./lib/xlsx');

const TZ = 'Asia/Seoul';
const MAIN_SCRIPT = path.join(__dirname, 'wooricard-main.js');
const HOURLY_SCHEDULE = process.env.DAEMON_HOURLY_SCHEDULE || '59 * * * *'; // every hour at :59
const BRIEFING_SCHEDULE = process.env.DAEMON_BRIEFING_SCHEDULE || '0 9 * * *'; // 09:00 daily
const SHEET_CREATE_SCHEDULE = '1 0 1 * *'; // 00:01 on 1st of every month
const BRIEFING_HOUR = 9;

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

let running = false;

function spawnMain({ mode }) {
  return new Promise((resolve) => {
    const args = [MAIN_SCRIPT];
    let label = '🔄 hourly check';
    if (mode === 'briefing') { args.push('--briefing'); label = '🌅 briefing'; }
    else if (mode === 'monthly-capture') { args.push('--monthly-capture'); label = '📸 monthly capture'; }
    console.log(`[${nowKst()}] ▶ ${label}`);
    const child = spawn('node', args, { stdio: 'inherit' });
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

async function withMutex(fn) {
  if (running) {
    console.log(`[${nowKst()}] ⏸ Previous run still in progress — skipping`);
    return;
  }
  running = true;
  try { await fn(); } finally { running = false; }
}

console.log('========================================');
console.log('  우리카드 자동화 데몬');
console.log('========================================');
console.log(`Hourly schedule:  ${HOURLY_SCHEDULE}  (skips ${BRIEFING_HOUR}시대)`);
console.log(`Briefing:         ${BRIEFING_SCHEDULE}  (→ daily, 1st also triggers monthly-capture)`);
console.log(`Sheet create:     ${SHEET_CREATE_SCHEDULE}  (새 월 xlsx 시트)`);
console.log(`Timezone:         ${TZ}`);
console.log(`Concurrency:      mutex — overlapping ticks are skipped`);
console.log('Press Ctrl+C to stop.');
console.log('========================================\n');

// Hourly tick — skips 9시대 (briefing cron 담당) + 1일 0시대 (sheet-create cron 담당)
cron.schedule(HOURLY_SCHEDULE, async () => {
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
}, { timezone: TZ });

// Daily briefing at 09:00 — on 1st of month, also runs monthly-capture first
cron.schedule(BRIEFING_SCHEDULE, async () => {
  await withMutex(async () => {
    const { day } = kstParts();
    if (day === 1) {
      await spawnMain({ mode: 'monthly-capture' });
    }
    await spawnMain({ mode: 'briefing' });
  });
}, { timezone: TZ });

// Monthly xlsx sheet creation at 00:01 on 1st
cron.schedule(SHEET_CREATE_SCHEDULE, async () => {
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
}, { timezone: TZ });

if (process.argv.includes('--run-now')) {
  console.log('[--run-now] Triggering hourly immediately for smoke test...');
  withMutex(() => spawnMain({ mode: 'hourly' }));
}

process.on('SIGINT', () => { console.log('\nDaemon stopping (SIGINT).'); process.exit(0); });
process.on('SIGTERM', () => { console.log('\nDaemon stopping (SIGTERM).'); process.exit(0); });
