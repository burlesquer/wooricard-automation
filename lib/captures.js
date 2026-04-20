const fs = require('fs');
const path = require('path');

// Per-user monthly screenshot archive.
// Layout: {baseDir}/{name}/{YYYY-MM}.png
// Retention: keeps the N most recent months per user (default 3).
function createCaptureStore(baseDir, { retentionMonths = 3 } = {}) {
  fs.mkdirSync(baseDir, { recursive: true });

  function userDir(name) {
    return path.join(baseDir, name);
  }

  function filePath(name, yearMonth) {
    return path.join(userDir(name), `${yearMonth}.png`);
  }

  function ensureUserDir(name) {
    fs.mkdirSync(userDir(name), { recursive: true });
  }

  function save(name, yearMonth, sourcePathOrBuffer) {
    ensureUserDir(name);
    const outPath = filePath(name, yearMonth);
    if (Buffer.isBuffer(sourcePathOrBuffer)) {
      fs.writeFileSync(outPath, sourcePathOrBuffer);
    } else {
      fs.copyFileSync(sourcePathOrBuffer, outPath);
    }
    cleanup(name);
    return outPath;
  }

  function cleanup(name) {
    try {
      const dir = userDir(name);
      if (!fs.existsSync(dir)) return;
      const files = fs.readdirSync(dir)
        .filter(f => /^\d{4}-\d{2}\.png$/.test(f))
        .sort()
        .reverse();
      const toDelete = files.slice(retentionMonths);
      for (const f of toDelete) {
        try { fs.unlinkSync(path.join(dir, f)); } catch (e) { /* ignore */ }
      }
    } catch (e) { /* ignore */ }
  }

  function listMonths(name) {
    try {
      const dir = userDir(name);
      if (!fs.existsSync(dir)) return [];
      return fs.readdirSync(dir)
        .filter(f => /^\d{4}-\d{2}\.png$/.test(f))
        .map(f => f.replace(/\.png$/, ''))
        .sort().reverse();
    } catch (e) { return []; }
  }

  return { save, cleanup, listMonths, filePath, userDir };
}

module.exports = { createCaptureStore };
