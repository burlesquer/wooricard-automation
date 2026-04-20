const fs = require('fs');
const path = require('path');

// Per-user per-month history archive.
// Layout: {baseDir}/{name}/{YYYY-MM}.json
// Retention: keeps the N most recent months per user (default 3).
function createStateStore(baseDir, { retentionMonths = 3 } = {}) {
  fs.mkdirSync(baseDir, { recursive: true });

  function userDir(name) {
    return path.join(baseDir, name);
  }

  function filePath(name, yearMonth) {
    return path.join(userDir(name), `${yearMonth}.json`);
  }

  function ensureUserDir(name) {
    fs.mkdirSync(userDir(name), { recursive: true });
  }

  function load(name, yearMonth) {
    try {
      const f = filePath(name, yearMonth);
      if (fs.existsSync(f)) {
        const data = JSON.parse(fs.readFileSync(f, 'utf8'));
        return {
          amount: data.totalAmount || 0,
          items: data.items || [],
          prevBalance: data.prevBalance,
          availableAmount: data.availableAmount,
          remainingBalance: data.remainingBalance,
          monthlyCredit: data.monthlyCredit,
          seed: data.seed || false,
          exists: true,
        };
      }
    } catch (e) {
      // fall through to default
    }
    return { amount: 0, items: [], exists: false };
  }

  function save(name, yearMonth, state) {
    ensureUserDir(name);
    const payload = {
      name,
      month: yearMonth,
      ...(state.prevBalance !== undefined && { prevBalance: state.prevBalance }),
      ...(state.monthlyCredit !== undefined && { monthlyCredit: state.monthlyCredit }),
      ...(state.availableAmount !== undefined && { availableAmount: state.availableAmount }),
      totalAmount: state.totalAmount ?? state.amount ?? 0,
      ...(state.remainingBalance !== undefined && { remainingBalance: state.remainingBalance }),
      updatedAt: new Date().toISOString(),
      ...(state.seed && { seed: true }),
      items: state.items || [],
    };
    fs.writeFileSync(filePath(name, yearMonth), JSON.stringify(payload, null, 2));
    cleanup(name);
  }

  // Delete monthly files older than retentionMonths (keep latest N).
  function cleanup(name) {
    try {
      const dir = userDir(name);
      if (!fs.existsSync(dir)) return;
      const files = fs.readdirSync(dir)
        .filter(f => /^\d{4}-\d{2}\.json$/.test(f))
        .sort()       // lexicographic = chronological for YYYY-MM
        .reverse();   // newest first
      const toDelete = files.slice(retentionMonths);
      for (const f of toDelete) {
        try { fs.unlinkSync(path.join(dir, f)); } catch (e) { /* ignore */ }
      }
    } catch (e) { /* ignore */ }
  }

  // List all archived months for a given user (YYYY-MM strings, newest first).
  function listMonths(name) {
    try {
      const dir = userDir(name);
      if (!fs.existsSync(dir)) return [];
      return fs.readdirSync(dir)
        .filter(f => /^\d{4}-\d{2}\.json$/.test(f))
        .map(f => f.replace(/\.json$/, ''))
        .sort().reverse();
    } catch (e) { return []; }
  }

  return { load, save, cleanup, listMonths, filePath };
}

module.exports = { createStateStore };
