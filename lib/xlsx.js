const fs = require('fs');
const ExcelJS = require('exceljs');

const DEFAULT_COLUMNS = {
  prevBalance: 'H',
  availableAmount: 'I',
  usage: 'J',
  remainingBalance: 'K',
};

function createXlsxStore(filePath, { columns = DEFAULT_COLUMNS } = {}) {
  const COL = { ...DEFAULT_COLUMNS, ...columns };

  function sheetName(yearMonth) {
    const [year, month] = yearMonth.split('-').map(Number);
    return `${year}년 ${month}월`;
  }

  function exists() {
    return fs.existsSync(filePath);
  }

  async function load() {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);
    return wb;
  }

  async function save(wb) {
    await wb.xlsx.writeFile(filePath);
  }

  function extractNumeric(cellValue) {
    if (cellValue === null || cellValue === undefined) return null;
    if (typeof cellValue === 'number') return cellValue;
    if (typeof cellValue === 'object') {
      if ('result' in cellValue && typeof cellValue.result === 'number') return cellValue.result;
      if ('value' in cellValue && typeof cellValue.value === 'number') return cellValue.value;
    }
    const n = parseInt(String(cellValue).replace(/,/g, ''), 10);
    return Number.isFinite(n) ? n : null;
  }

  // Resolve a cell to a numeric value, following cross-sheet formula references when needed.
  // Useful when a newly-cloned month sheet has H-column formulas without cached results.
  function resolveCellNumeric(wb, cell, seen) {
    seen = seen || new Set();
    const v = cell.value;
    const direct = extractNumeric(v);
    if (direct !== null) return direct;
    const formula = cell.formula || (v && typeof v === 'object' && v.formula);
    if (!formula) return null;
    // Match patterns like "'Sheet Name'!A1" or "Sheet!A1" or "A1"
    const m = String(formula).match(/^'?([^'!]+)'?!([A-Z]+\d+)$/);
    if (m) {
      const refSheetName = m[1];
      const refCellAddr = m[2];
      const key = refSheetName + '!' + refCellAddr;
      if (seen.has(key)) return null;
      seen.add(key);
      const refSheet = wb.getWorksheet(refSheetName);
      if (refSheet) return resolveCellNumeric(wb, refSheet.getCell(refCellAddr), seen);
    }
    return null;
  }

  // Read prevBalance column (default H) for a row in a given month.
  // Follows cross-sheet formula references if the cell has only formula (no cached result).
  async function readPrevBalance(sheetRow, yearMonth) {
    if (!exists()) return null;
    const wb = await load();
    const sheet = wb.getWorksheet(sheetName(yearMonth));
    if (!sheet) return null;
    return resolveCellNumeric(wb, sheet.getCell(`${COL.prevBalance}${sheetRow}`));
  }

  // Read remainingBalance column (default K) for a row in a given month
  async function readRemainingBalance(sheetRow, yearMonth) {
    if (!exists()) return null;
    const wb = await load();
    const sheet = wb.getWorksheet(sheetName(yearMonth));
    if (!sheet) return null;
    return extractNumeric(sheet.getCell(`${COL.remainingBalance}${sheetRow}`).value);
  }

  // Write usage column (default J) for a row in a given month.
  // Also updates remainingBalance cached value (= availableAmount - usage).
  async function writeUsage(sheetRow, yearMonth, amount) {
    if (!exists()) {
      console.error(`  [xlsx] File missing, skip writeUsage: ${filePath}`);
      return false;
    }
    try {
      const wb = await load();
      const sheet = wb.getWorksheet(sheetName(yearMonth));
      if (!sheet) {
        console.error(`  [xlsx] Sheet not found: ${sheetName(yearMonth)}`);
        return false;
      }
      sheet.getCell(`${COL.usage}${sheetRow}`).value = amount;

      // Update remainingBalance cached value so readers don't see stale number before Excel recalc
      const avail = extractNumeric(sheet.getCell(`${COL.availableAmount}${sheetRow}`).value);
      const remCell = sheet.getCell(`${COL.remainingBalance}${sheetRow}`);
      if (remCell.formula || (remCell.value && typeof remCell.value === 'object' && 'formula' in remCell.value)) {
        const existingFormula = remCell.formula || remCell.value.formula;
        remCell.value = { formula: existingFormula, result: (avail !== null ? avail - amount : 0) };
      }
      await save(wb);
      return true;
    } catch (e) {
      console.error(`  [xlsx] writeUsage failed: ${e.message.substring(0, 200)}`);
      return false;
    }
  }

  // Check if a month sheet exists
  async function sheetExists(yearMonth) {
    if (!exists()) return false;
    const wb = await load();
    return !!wb.getWorksheet(sheetName(yearMonth));
  }

  // Ensure a month sheet exists — creates via createMonthSheet if missing.
  async function ensureMonthSheet(yearMonth) {
    if (await sheetExists(yearMonth)) return yearMonth;
    console.error(`  [xlsx] Month sheet missing: ${sheetName(yearMonth)} — attempting to create`);
    return createMonthSheet(yearMonth);
  }

  // Create new month sheet by duplicating the previous month's sheet and updating H-column formulas.
  // Returns new sheet name on success, null if already exists or on failure.
  async function createMonthSheet(newYearMonth) {
    if (!exists()) {
      console.error(`  [xlsx] File missing, cannot create sheet: ${filePath}`);
      return null;
    }
    try {
      const wb = await load();
      const newName = sheetName(newYearMonth);
      if (wb.getWorksheet(newName)) {
        console.error(`  [xlsx] Sheet already exists: ${newName}`);
        return newName;
      }

      // Compute previous month
      const [year, month] = newYearMonth.split('-').map(Number);
      const prevDate = new Date(year, month - 2, 1);
      const prevName = `${prevDate.getFullYear()}년 ${prevDate.getMonth() + 1}월`;
      const prevSheet = wb.getWorksheet(prevName);
      if (!prevSheet) {
        console.error(`  [xlsx] Previous sheet not found: ${prevName}`);
        return null;
      }

      const newSheet = wb.addWorksheet(newName);

      // Copy default row/column sizing from source sheet
      if (prevSheet.properties && prevSheet.properties.defaultRowHeight) {
        newSheet.properties.defaultRowHeight = prevSheet.properties.defaultRowHeight;
      }
      if (prevSheet.properties && prevSheet.properties.defaultColWidth) {
        newSheet.properties.defaultColWidth = prevSheet.properties.defaultColWidth;
      }

      // Copy column widths (iterate by count to avoid sparse-array issues with .columns)
      const colCount = Math.max(prevSheet.columnCount || 0, prevSheet.actualColumnCount || 0);
      for (let i = 1; i <= colCount; i++) {
        const prevCol = prevSheet.getColumn(i);
        const newCol = newSheet.getColumn(i);
        if (prevCol.width != null) newCol.width = prevCol.width;
        if (prevCol.hidden) newCol.hidden = prevCol.hidden;
        if (prevCol.outlineLevel) newCol.outlineLevel = prevCol.outlineLevel;
        if (prevCol.style) newCol.style = JSON.parse(JSON.stringify(prevCol.style));
      }

      // Copy row heights + cells (values, formulas, styles)
      const rowCount = Math.max(prevSheet.rowCount || 0, prevSheet.actualRowCount || 0);
      for (let r = 1; r <= rowCount; r++) {
        const prevRow = prevSheet.getRow(r);
        const newRow = newSheet.getRow(r);
        if (prevRow.height != null) newRow.height = prevRow.height;
        if (prevRow.hidden) newRow.hidden = prevRow.hidden;
        if (prevRow.outlineLevel) newRow.outlineLevel = prevRow.outlineLevel;
        prevRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
          const newCell = newRow.getCell(colNum);
          if (cell.formula) {
            newCell.value = { formula: cell.formula, result: cell.result };
          } else if (cell.value && typeof cell.value === 'object' && 'formula' in cell.value) {
            newCell.value = { formula: cell.value.formula, result: cell.value.result };
          } else {
            newCell.value = cell.value;
          }
          if (cell.style) newCell.style = JSON.parse(JSON.stringify(cell.style));
          if (cell.numFmt) newCell.numFmt = cell.numFmt;
        });
      }

      // Copy merged cells
      if (prevSheet.model && prevSheet.model.merges) {
        for (const merge of prevSheet.model.merges) {
          try { newSheet.mergeCells(merge); } catch (e) { /* ignore */ }
        }
      }

      // Update prevBalance column formulas: point to the NEW previous month.
      // Also pre-compute cached result so readers don't depend on Excel recalc.
      const formulaRefRegex = new RegExp(`'![A-Z]+\\d+$`);
      newSheet.eachRow({ includeEmpty: false }, (row, rowNum) => {
        const hCell = row.getCell(COL.prevBalance);
        const formula = (hCell.formula) || (hCell.value && hCell.value.formula) || null;
        if (formula && formulaRefRegex.test(formula)) {
          // Read referenced cell's value from prev sheet (= new previous month's remaining col)
          const refCell = prevSheet.getCell(`${COL.remainingBalance}${rowNum}`);
          const cachedResult = resolveCellNumeric(wb, refCell);
          hCell.value = {
            formula: `'${prevName}'!${COL.remainingBalance}${rowNum}`,
            result: cachedResult !== null ? cachedResult : undefined,
          };
        }
      });

      // Clear usage column (새 달은 사용금액 0부터)
      newSheet.eachRow({ includeEmpty: false }, (row) => {
        const jCell = row.getCell(COL.usage);
        if (typeof jCell.value === 'number') {
          jCell.value = null;
        }
      });

      await save(wb);
      console.error(`  [xlsx] Created new month sheet: ${newName} (cloned from ${prevName})`);
      return newName;
    } catch (e) {
      console.error(`  [xlsx] createMonthSheet failed: ${e.message.substring(0, 300)}`);
      return null;
    }
  }

  return { exists, readPrevBalance, readRemainingBalance, writeUsage, createMonthSheet, ensureMonthSheet, sheetExists, sheetName };
}

module.exports = { createXlsxStore };
