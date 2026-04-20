const fs = require('fs');
const path = require('path');

const { createSlackClient, buildPersonalDM, buildBriefingDM } = require('./lib/slack');
const { createGmailClient, buildTransactionEmail } = require('./lib/gmail');
const { createStateStore } = require('./lib/state');
const { createCaptureStore } = require('./lib/captures');
const { createXlsxStore } = require('./lib/xlsx');
const { createCDPSession } = require('./lib/cdp');
const { createTransKey } = require('./lib/transkey');
const { createLoginFlow } = require('./lib/login');
const { createHistoryFetcher } = require('./lib/history');

// ============================================================
// Config — from config.json + .env (secrets)
// ============================================================
const config = require('./config.json');
const LOGIN_URL = config.urls.login;
const HISTORY_URL = config.urls.history;
const XLSX_CONFIG = config.xlsx || { path: './복리후생비.xlsx' };
const XLSX_PATH = path.resolve(__dirname, XLSX_CONFIG.path);
const STATE_DIR = path.join(__dirname, 'state');
const CAPTURES_DIR = path.join(__dirname, 'captures');

// Validate per-account password (must be set in config.json)
const allAccounts = config.accounts.map((a) => {
  if (!a.pw) {
    console.error(`ERROR: Missing 'pw' for ${a.id || a.name} in config.json`);
    process.exit(1);
  }
  return a;
});

// ============================================================
// CLI
// ============================================================
const cliArgs = process.argv.slice(2);
const CLI_MONTH = (() => { const i = cliArgs.indexOf('--month'); return i >= 0 ? cliArgs[i + 1] : null; })();
const CLI_ACCOUNT = (() => { const i = cliArgs.indexOf('--account'); return i >= 0 ? cliArgs[i + 1] : null; })();
const CLI_DRY_RUN = cliArgs.includes('--dry-run') || cliArgs.includes('--no-sheet'); // --no-sheet retained as alias
const CLI_NO_SLACK = cliArgs.includes('--no-slack');
const CLI_NO_GMAIL = cliArgs.includes('--no-gmail');
const CLI_HEADFUL = cliArgs.includes('--headful');
const CLI_BRIEFING = cliArgs.includes('--briefing');
const CLI_MONTHLY_CAPTURE = cliArgs.includes('--monthly-capture');
const CLI_CAPTURE_MONTH = (() => { const i = cliArgs.indexOf('--capture-month'); return i >= 0 ? cliArgs[i + 1] : null; })();

const accounts = CLI_ACCOUNT
  ? allAccounts.filter(a => a.id === CLI_ACCOUNT || a.name === CLI_ACCOUNT)
  : allAccounts;


// ============================================================
// Clients
// ============================================================
let slackClient;
try {
  slackClient = createSlackClient({
    token: config.slackBotToken || process.env.SLACK_BOT_TOKEN,
    disabled: CLI_NO_SLACK,
  });
} catch (e) {
  console.error('ERROR:', e.message);
  process.exit(1);
}

const stateStore = createStateStore(STATE_DIR);
const xlsxStore = createXlsxStore(XLSX_PATH, { columns: XLSX_CONFIG.columns });
const gmailClient = createGmailClient({
  user: (config.gmail && config.gmail.user) || null,
  password: (config.gmail && config.gmail.password) || null,
  disabled: CLI_NO_GMAIL,
});

// ============================================================
// Main
// ============================================================
function computePrevYearMonth() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const y = d.getFullYear();
  const m = ('0' + (d.getMonth() + 1)).slice(-2);
  return { yearMonth: `${y}-${m}`, year: y, month: m };
}

async function monthlyCaptureMode() {
  // Target = --capture-month override (YYYY-MM) or previous KST month
  let prevYM, prevYear, prevMonth;
  if (CLI_CAPTURE_MONTH) {
    const [y, m] = CLI_CAPTURE_MONTH.split('-');
    prevYM = CLI_CAPTURE_MONTH;
    prevYear = parseInt(y, 10);
    prevMonth = m;
  } else {
    ({ yearMonth: prevYM, year: prevYear, month: prevMonth } = computePrevYearMonth());
  }
  console.error(`===== Monthly Capture Mode: ${prevYM} =====`);

  const session = await createCDPSession({
    headless: !CLI_HEADFUL,
    screenshotDir: null,
    disablePopupKiller: true,
  });
  const transkey = createTransKey(session);
  const login = createLoginFlow(session, transkey, { loginUrl: LOGIN_URL });
  const history = createHistoryFetcher(session, login, {
    historyUrl: HISTORY_URL,
    cliMonth: prevMonth, // override to previous month
  });
  const captureStore = createCaptureStore(CAPTURES_DIR);

  for (const account of accounts) {
    console.error(`\n------- Capture: ${account.name} (${prevYM}) -------`);
    try {
      await login.login(account);
      await history.getCardHistory(account);
      // Page now shows prev-month results. Capture to Buffer, then save to captures/
      const buf = await session.fullPageScreenshot();
      if (!buf) throw new Error('fullPageScreenshot returned null');
      const savedPath = captureStore.save(account.name, prevYM, buf);
      console.error(`  Saved: ${savedPath}`);

      if (!CLI_NO_SLACK && account.slackId) {
        const comment = `📸 ${prevYear}년 ${parseInt(prevMonth, 10)}월 법인카드 이용내역 최종 캡처`;
        const res = await slackClient.uploadFile(account.slackId, savedPath, {
          title: `${prevYM} 이용내역`,
          initialComment: comment,
        });
        console.error(`  Slack upload: ${res ? 'OK' : 'FAIL'}`);
      }
    } catch (e) {
      console.error(`  Capture failed for ${account.name}: ${e.message}`);
    }

    try { await login.logout(); } catch (e) { /* ignore */ }
    await session.sleep(2000);
  }

  await session.close();
  console.error(`\n===== Monthly Capture Complete =====`);
}

async function main() {
  // Monthly-capture mode runs standalone and exits.
  if (CLI_MONTHLY_CAPTURE) {
    return monthlyCaptureMode();
  }

  const session = await createCDPSession({
    headless: !CLI_HEADFUL,
    screenshotDir: null,
    disablePopupKiller: true,
  });

  const transkey = createTransKey(session);
  const login = createLoginFlow(session, transkey, { loginUrl: LOGIN_URL });
  const history = createHistoryFetcher(session, login, {
    historyUrl: HISTORY_URL,
    cliMonth: CLI_MONTH,
  });

  const results = [];
  const { yearMonth } = history.resolveDates();

  // Safety net: ensure current month sheet exists in xlsx (creates from prev month if missing)
  if (xlsxStore.exists()) {
    await xlsxStore.ensureMonthSheet(yearMonth);
  } else {
    console.error(`  [xlsx] File not found at ${XLSX_PATH} — xlsx features disabled`);
  }

  const prevYearMonth = (() => {
    const [y, m] = yearMonth.split('-').map(Number);
    const d = new Date(y, m - 2, 1); // m-1 is current (0-indexed), so m-2 is prev month
    return `${d.getFullYear()}-${('0' + (d.getMonth() + 1)).slice(-2)}`;
  })();

  // Load this-month's existing archive (for diff against new scrape)
  const prevState = {};
  for (const account of accounts) {
    prevState[account.name] = stateStore.load(account.name, yearMonth);
    console.error(`Loaded state for ${account.name} (${yearMonth}): ${prevState[account.name].amount.toLocaleString()}원`);
  }

  // Bootstrap: if no previous-month archive exists, seed from xlsx H-column (전월잔액) of current month sheet
  for (const account of accounts) {
    const prevArchive = stateStore.load(account.name, prevYearMonth);
    if (!prevArchive.exists) {
      // xlsx H{row} of CURRENT month sheet = previous month's K (= prev month's remainingBalance)
      const fromXlsx = await xlsxStore.readPrevBalance(account.sheetRow, yearMonth);
      if (fromXlsx === null || fromXlsx === undefined) {
        throw new Error(`No archive for ${account.name} ${prevYearMonth} and no xlsx data (row=${account.sheetRow}, month=${yearMonth}) — cannot compute rolling balance`);
      }
      stateStore.save(account.name, prevYearMonth, {
        totalAmount: 0,
        remainingBalance: fromXlsx,
        seed: true,
        items: [],
      });
      console.error(`Seeded ${account.name} ${prevYearMonth} from xlsx H${account.sheetRow}=${fromXlsx.toLocaleString()}원`);
    }
  }

  // Process each account
  for (const account of accounts) {
    console.error(`\n======= Processing ${account.name} =======`);

    try {
      await login.login(account);
      const rawData = await history.getCardHistory(account);
      const parsed = history.parseHistoryData(rawData, account);
      console.error(`  Total: ${parsed.totalAmount.toLocaleString()}원, Items: ${parsed.items.length}`);

      // Enrich items with merchant details (사업자번호/업종/주소/전화번호).
      // Cache from prev archive items so only NEW approvalNos trigger a modal click.
      const prev = prevState[account.name];
      const enrichCache = new Map();
      for (const it of (prev.items || [])) {
        if (it.approvalNo && (it.bizNo || it.category || it.addr || it.tel)) {
          enrichCache.set(it.approvalNo, {
            bizNo: it.bizNo, category: it.category, addr: it.addr, tel: it.tel,
          });
        }
      }
      parsed.items = await history.enrichMerchant(parsed.items, enrichCache);

      const prevApprovalNos = new Set((prev.items || []).map(i => i.approvalNo).filter(Boolean));
      const newItems = parsed.items.filter(i => i.approvalNo && !prevApprovalNos.has(i.approvalNo));
      const amountChanged = parsed.totalAmount !== prev.amount;

      console.error(`  Previous: ${prev.amount.toLocaleString()}원, New: ${parsed.totalAmount.toLocaleString()}원`);
      console.error(`  New items: ${newItems.length}`);

      results.push({
        account,
        totalAmount: parsed.totalAmount,
        prevAmount: prev.amount,
        items: parsed.items,
        newItems,
        amountChanged,
        error: null,
      });

      // Compute rolling balance from local DB (no sheet reads)
      const prevArchive = stateStore.load(account.name, prevYearMonth);
      const prevBalance = prevArchive.remainingBalance ?? 0;
      const monthlyCredit = config.monthlyCredit;
      const availableAmount = prevBalance + monthlyCredit;
      const remainingBalance = availableAmount - parsed.totalAmount;

      console.error(`  Balance: prev=${prevBalance.toLocaleString()} + credit=${monthlyCredit.toLocaleString()} = avail=${availableAmount.toLocaleString()}, used=${parsed.totalAmount.toLocaleString()}, remaining=${remainingBalance.toLocaleString()}`);

      // Attach balance info to result (for Slack DM)
      results[results.length - 1].availableAmount = availableAmount;
      results[results.length - 1].remainingBalance = remainingBalance;
      results[results.length - 1].prevBalance = prevBalance;

      // Archive to monthly JSON history + write to xlsx J column (skip on --dry-run)
      if (!CLI_DRY_RUN) {
        stateStore.save(account.name, yearMonth, {
          prevBalance,
          monthlyCredit,
          availableAmount,
          totalAmount: parsed.totalAmount,
          remainingBalance,
          items: parsed.items.map(it => ({
            date: it.date,
            approvalNo: it.approvalNo,
            merchant: it.merchant,
            amount: it.amount,
            ...(it.bizNo != null    ? { bizNo: it.bizNo }       : {}),
            ...(it.category != null ? { category: String(it.category).replace(/^\d+\s*\/\s*/, '').replace(/\s+/g, '') } : {}),
            ...(it.addr != null     ? { addr: it.addr }         : {}),
            ...(it.tel != null      ? { tel: it.tel }           : {}),
          })),
        });

        // Write usage (J column) to xlsx
        if (account.sheetRow) {
          const ok = await xlsxStore.writeUsage(account.sheetRow, yearMonth, parsed.totalAmount);
          console.error(`  xlsx J${account.sheetRow} ← ${parsed.totalAmount.toLocaleString()}원 (${ok ? 'OK' : 'FAIL'})`);
        } else {
          console.error(`  (xlsx write skipped — no 'row' configured for ${account.name})`);
        }
      } else {
        console.error(`  (archive save + xlsx write skipped — --dry-run)`);
      }
    } catch (e) {
      console.error(`  ERROR for ${account.name}:`, e.message);
      results.push({
        account,
        totalAmount: prevState[account.name].amount,
        prevAmount: prevState[account.name].amount,
        items: [],
        newItems: [],
        amountChanged: false,
        error: e.message,
      });
    }

    await login.logout();
    await session.sleep(2000);
  }

  await session.close();

  // Per-account Slack DMs only — no admin summary
  if (!CLI_NO_SLACK) {

    const { dateStart, dateEnd } = history.resolveDates();
    const dateRange = `${dateStart} ~ ${dateEnd}`;
    for (const r of results) {
      if (!r.account.slackId || r.error) continue;

      if (CLI_BRIEFING) {
        // Daily morning briefing — send regardless of amountChanged
        if (r.availableAmount !== undefined) {
          const dm = buildBriefingDM(r, dateRange);
          await slackClient.send(dm, r.account.slackId);
          console.error(`Briefing DM sent to ${r.account.name}`);
        }
      } else if (r.amountChanged && r.totalAmount > 0) {
        // Change-triggered DM (manual / on-demand runs)
        const dm = buildPersonalDM(r, dateRange, r.remainingBalance ?? null);
        await slackClient.send(dm, r.account.slackId);
        console.error(`Personal DM sent to ${r.account.name} (remaining: ${r.remainingBalance?.toLocaleString() ?? 'N/A'}원)`);
      }
    }
  } else {
    console.error('(--no-slack: skip Slack)');
  }

  // Per-transaction Gmail — one email per new item for accounts with email configured
  if (gmailClient.enabled) {
    const year = history.resolveDates().currentYear;
    for (const r of results) {
      if (r.error || !r.account.email || !r.newItems || r.newItems.length === 0) continue;
      console.error(`  [gmail] sending ${r.newItems.length} transaction email(s) to ${r.account.email}`);
      for (const item of r.newItems) {
        const { subject, text } = buildTransactionEmail(r.account, item, {
          year,
          availableAmount: r.availableAmount,
          totalAmount: r.totalAmount,
          remainingBalance: r.remainingBalance,
        });
        const ok = await gmailClient.send({ to: r.account.email, subject, text });
        console.error(`    ${ok ? '✓' : '✗'} ${subject}`);
      }
    }
  }

  // Output results
  if (CLI_MONTH || CLI_DRY_RUN) {
    const month = CLI_MONTH || history.resolveDates().targetMonth;
    console.log(`\n========== ${month}월 이용내역 ==========`);
    for (const r of results) {
      console.log(`\n[${r.account.name}] 총 ${r.items.length}건, 합계: ${r.totalAmount.toLocaleString()}원`);
      for (const it of r.items) {
        console.log(`  ${it.date}  ${(it.merchant || '').substring(0, 20).padEnd(20)}  ${it.amount.toLocaleString()}원`);
      }
    }
    console.log(`==========================================`);
  } else {
    console.log(JSON.stringify(results));
  }
}

main().catch(async (e) => {
  const msg = `❌ 우리카드 자동화 실패\n오류: ${e.message.substring(0, 100)}`;
  console.error('Fatal:', e.message);
  // Fatal error: log only (no admin recipient concept anymore)
  process.exit(1);
});
