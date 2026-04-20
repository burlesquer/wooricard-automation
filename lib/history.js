function createHistoryFetcher(session, login, { historyUrl, cliMonth = null } = {}) {
  const { evaluate, navigateTo, screenshot, sleep } = session;
  const { dismissPopups, injectPopupKiller } = login;

  function resolveDates() {
    const todayKst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    const currentMonth = ('0' + (todayKst.getMonth() + 1)).slice(-2);
    const currentYear = todayKst.getFullYear();
    const targetMonth = typeof cliMonth === 'string' ? cliMonth : currentMonth;
    const lastDay = targetMonth === '02' ? '28' : (['04', '06', '09', '11'].includes(targetMonth) ? '30' : '31');
    const dateStart = `${currentYear}.${targetMonth}.01`;
    const dateEndFixed = `${currentYear}.${targetMonth}.${lastDay}`;
    const dateEndToday = `${currentYear}.${currentMonth}.${('0' + todayKst.getDate()).slice(-2)}`;
    const dateEnd = targetMonth === currentMonth ? dateEndToday : dateEndFixed;
    const monthLabel = `${currentYear}년${targetMonth}월`;
    const yearMonth = `${currentYear}-${targetMonth}`;
    return { currentYear, currentMonth, targetMonth, dateStart, dateEnd, monthLabel, yearMonth };
  }

  async function getCardHistory(account) {
    console.error(`  Getting history for card ***${account.cardSuffix}`);

    await navigateTo(historyUrl);
    await sleep(2000);
    await injectPopupKiller();
    await sleep(500);

    const historyUrlNow = await evaluate('window.location.href');
    if (historyUrlNow.includes('login') || historyUrlNow.includes('H2BMM201S01')) {
      throw new Error('Redirected to login - session expired');
    }

    await screenshot(`history_${account.name}_loaded.png`);

    const pageInfo = await evaluate(`
      (function() {
        return JSON.stringify({
          url: window.location.href,
          title: document.title
        });
      })()
    `);
    const pi = JSON.parse(pageInfo);
    console.error('  History page:', pi.title);

    const cardSelected = await evaluate(`
      (function() {
        var selects = document.querySelectorAll('select');
        for (var s of selects) {
          var opt = Array.from(s.options).find(o => o.text.includes('${account.cardSuffix}') || o.value.includes('${account.cardSuffix}'));
          if (opt) {
            s.value = opt.value;
            s.dispatchEvent(new Event('change', {bubbles: true}));
            return JSON.stringify({found: true, selector: 'select', value: opt.value, text: opt.text});
          }
        }
        var links = Array.from(document.querySelectorAll('a, button, li, td')).filter(el => el.textContent.includes('${account.cardSuffix}'));
        if (links.length > 0) {
          return JSON.stringify({found: false, links: links.map(l => ({tag: l.tagName, text: l.textContent.trim().substring(0,50)}))});
        }
        return JSON.stringify({found: false, msg: 'no card selector found'});
      })()
    `);
    console.error('  Card selection:', cardSelected);
    await sleep(1000);

    const cardClicked = await evaluate(`
      (function() {
        var cardLink = Array.from(document.querySelectorAll('a')).find(a => a.textContent.includes('${account.cardSuffix}'));
        if (cardLink) {
          cardLink.click();
          return 'clicked card link: ' + cardLink.textContent.trim().substring(0, 50);
        }
        return 'no card link found';
      })()
    `);
    console.error('  Card link click:', cardClicked);
    await sleep(2000);

    const { dateStart, dateEnd, monthLabel } = resolveDates();

    const dateSet = await evaluate(`
      (function() {
        var startFmt = '${dateStart}';
        var endFmt = '${dateEnd}';
        var result = [];

        function setVal(el, val) {
          var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(el, val);
          el.dispatchEvent(new Event('input', {bubbles:true}));
          el.dispatchEvent(new Event('change', {bubbles:true}));
        }

        var startEl = document.getElementById('inqStaDy8');
        var endEl   = document.getElementById('inqEndDy8');

        if (startEl && startEl.value !== startFmt) { setVal(startEl, startFmt); result.push('start → ' + startFmt); }
        if (endEl && endEl.value !== endFmt) { setVal(endEl, endFmt); result.push('end → ' + endFmt); }

        if (result.length > 0) return 'set: ' + result.join(', ');
        if (startEl && endEl) return 'already: ' + startEl.value + ' ~ ' + endEl.value;

        var allEls = Array.from(document.querySelectorAll('a, button, li, option, span'));
        var mEl = allEls.find(el => el.textContent.trim() === '${monthLabel}');
        if (mEl) { mEl.click(); return 'fallback: clicked ${monthLabel}'; }
        return 'not found';
      })()
    `);
    console.error('  Date range:', dateSet);
    await sleep(500);

    const searchClicked = await evaluate(`
      (function() {
        var allBtns = Array.from(document.querySelectorAll('button, a.btn_inquiry, a[class*="inquiry"], a[class*="search"]'));
        var historyBtn = document.querySelector('#btnInquiry, #btnSearch, #searchBtn, #schBtn, button[id*="inq"], button[id*="sch"]');
        if (historyBtn) { historyBtn.click(); return 'by id: ' + historyBtn.id; }
        var matchBtns = allBtns.filter(b => (b.textContent || b.value || '').trim() === '조회');
        if (matchBtns.length === 1) { matchBtns[0].click(); return 'only one 조회 btn: ' + matchBtns[0].className.substring(0,30); }
        if (matchBtns.length > 1) {
          var dateLabel = Array.from(document.querySelectorAll('*')).find(el => el.textContent.trim() === '이용기간');
          if (dateLabel) {
            var labelRect = dateLabel.getBoundingClientRect();
            var best = null, bestDist = Infinity;
            for (var btn of matchBtns) {
              var rect = btn.getBoundingClientRect();
              var dist = Math.abs(rect.top - labelRect.top) + Math.abs(rect.left - labelRect.left);
              if (rect.top >= labelRect.top - 50 && dist < bestDist) { bestDist = dist; best = btn; }
            }
            if (best) { best.click(); return 'near 이용기간: dist=' + bestDist; }
          }
          var last = matchBtns[matchBtns.length - 1];
          last.click();
          return 'last 조회 btn (' + matchBtns.length + ' found)';
        }
        return 'no 조회 button found';
      })()
    `);
    console.error('  Search button:', searchClicked);

    await sleep(5000);
    await screenshot(`history_${account.name}_results.png`);

    const dateFixed = await evaluate(`
      (function() {
        var startDot = '${dateStart}';
        var startRaw = startDot.replace(/\\./g, '');
        var todayDot = '${dateEnd}';
        var todayRaw = todayDot.replace(/\\./g, '');
        var changed = [];

        var nativeSet = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;

        function trySet(el, dotVal, rawVal) {
          var cur = el.value;
          var newVal = cur.match(/^\\d{4}\\.\\d{2}\\.\\d{2}$/) ? dotVal : rawVal;
          if (cur === newVal) return false;
          nativeSet.call(el, newVal);
          el.dispatchEvent(new Event('input', {bubbles:true}));
          el.dispatchEvent(new Event('change', {bubbles:true}));
          return true;
        }

        var allInputs = Array.from(document.querySelectorAll('input'));
        var dateInputs = allInputs.filter(el => {
          var v = el.value || '';
          return v.match(/^\\d{4}\\.\\d{2}\\.\\d{2}$/) || v.match(/^\\d{8}$/);
        });

        if (dateInputs.length >= 2) {
          dateInputs.sort((a,b) => a.value < b.value ? -1 : 1);
          if (trySet(dateInputs[0], startDot, startRaw)) changed.push('start → ' + startDot);
          if (trySet(dateInputs[dateInputs.length-1], todayDot, todayRaw)) changed.push('end → ' + todayDot);
          return changed.length > 0 ? 'fixed: ' + changed.join(', ') : 'already correct';
        }

        var label = Array.from(document.querySelectorAll('*')).find(el => el.textContent.trim() === '이용기간');
        if (label) {
          var parent = label;
          for (var i = 0; i < 6; i++) {
            parent = parent.parentElement;
            if (!parent) break;
            var inputs = Array.from(parent.querySelectorAll('input[type=text], input:not([type])'))
              .filter(el => !el.readOnly && el.id !== '_cmnSearchKeyword');
            if (inputs.length >= 2) {
              if (trySet(inputs[0], startDot, startRaw)) changed.push('start → ' + startDot);
              if (trySet(inputs[1], todayDot, todayRaw)) changed.push('end → ' + todayDot);
              return changed.length > 0 ? 'near-label fixed: ' + changed.join(', ') : 'near-label already correct';
            }
          }
        }

        return 'not found';
      })()`).catch(e => 'error: ' + e.message);
    console.error('  Date fix:', dateFixed);

    if (dateFixed && (dateFixed.startsWith('fixed:') || dateFixed.startsWith('near-label fixed:'))) {
      await sleep(500);
      await evaluate(`(function(){var b=document.querySelector('#btnSearch');if(b)b.click();})()`);
      await sleep(5000);
      await screenshot(`history_${account.name}_results2.png`);
    }

    for (let i = 0; i < 3; i++) {
      const d = await dismissPopups();
      await sleep(500);
      if (d === 'none') break;
    }

    let historyData = await extractHistoryData(account);
    for (let retry = 0; retry < 3 && historyData.items.length === 0 && !historyData.totalText; retry++) {
      console.error(`  Empty result (retry ${retry + 1}), dismissing popups and waiting...`);
      await dismissPopups();
      await sleep(3000);
      historyData = await extractHistoryData(account);
    }
    return historyData;
  }

  async function extractHistoryData(account) {
    const data = await evaluate(`
      (function() {
        var tables = document.querySelectorAll('table');
        var items = [];

        for (var table of tables) {
          var rows = Array.from(table.querySelectorAll('tr'));
          if (rows.length < 2) continue;

          var headers = Array.from(rows[0].querySelectorAll('th, td')).map(td => td.textContent.trim());
          var hasDate = headers.some(h => h.includes('날짜') || h.includes('일자') || h.includes('거래') || h.includes('이용'));
          var hasAmount = headers.some(h => h.includes('금액') || h.includes('이용금액') || h.includes('승인금액'));

          if (hasDate || hasAmount || rows.length > 3) {
            for (var i = 1; i < rows.length; i++) {
              var cells = Array.from(rows[i].querySelectorAll('td')).map(td => td.textContent.trim().replace(/\\n/g, ' ').replace(/\\s+/g, ' '));
              if (cells.length >= 3) items.push(cells);
            }
            if (items.length > 0) break;
          }
        }

        if (items.length === 0) {
          var listItems = document.querySelectorAll('.list_item, .item_wrap, .item_list, li.item, .card_item');
          Array.from(listItems).forEach(item => {
            var text = item.textContent.trim().replace(/\\s+/g, ' ');
            items.push([text]);
          });
        }

        var totalEls = document.querySelectorAll('.total_amount, .sum_amount, .total, #totalAmt, [class*="total"]');
        var totalText = '';
        Array.from(totalEls).forEach(el => {
          var t = el.textContent.trim();
          if (t.match(/[\\d,]+\\s*원/)) totalText = t;
        });

        var bodyText = document.body.innerText.substring(0, 15000);

        return JSON.stringify({
          items: items.slice(0, 30),
          totalText,
          bodyTextSnippet: bodyText
        });
      })()
    `);

    const result = JSON.parse(data);
    console.error(`  Found ${result.items.length} raw items`);
    console.error(`  Total text: ${result.totalText}`);
    return result;
  }

  function parseHistoryData(rawData, account) {
    const { bodyTextSnippet } = rawData;
    const { currentYear, targetMonth } = resolveDates();
    const parsedItems = [];

    const yearPrefix = String(currentYear);
    const dateRegex = new RegExp(`\\t(${yearPrefix}\\.\\d{2}\\.\\d{2})\\t(\\d{7,10})\\t(\\d{4})\\t([^\\t]+)\\t([^\\t]+)\\t\\t([\\d,]+)\\t`);

    for (const line of bodyTextSnippet.split('\n')) {
      const m = line.match(dateRegex);
      if (m) {
        const dateStr = m[1].substring(5); // MM.DD
        const approvalNo = m[2];
        const merchant = m[4].trim();
        const amount = parseInt(m[6].replace(/,/g, ''));
        if (amount > 0) parsedItems.push({ date: dateStr, approvalNo, merchant, amount });
      }
    }

    const filterMonth = targetMonth + '.';
    const monthItems = parsedItems.filter(item => item.date.startsWith(filterMonth));
    const totalAmount = monthItems.reduce((sum, item) => sum + item.amount, 0);

    console.error(`  Parsed ${parsedItems.length} total transactions, ${monthItems.length} in ${currentYear}.${targetMonth}`);
    return { totalAmount, items: monthItems };
  }

  // Enrich items with merchant details (사업자번호, 업종, 주소, 전화번호)
  // Only fetches via modal for items not present in cache (Map<approvalNo, details>).
  // Requires: already logged in + on card history page (results loaded).
  async function enrichMerchant(items, cache) {
    if (!items || items.length === 0) return items;
    cache = cache || new Map();

    const todo = items.filter((it) => it.approvalNo && !cache.has(it.approvalNo));
    if (todo.length === 0) {
      console.error('  [enrichMerchant] all items already cached — no modal clicks');
    } else {
      console.error(`  [enrichMerchant] fetching details for ${todo.length}/${items.length} items`);

      for (const item of todo) {
        const details = await fetchMerchantDetail(item.approvalNo);
        if (details) {
          cache.set(item.approvalNo, details);
        } else {
          console.error(`    [enrichMerchant] failed for approvalNo=${item.approvalNo}`);
        }
      }
    }

    return items.map((it) => {
      const d = cache.get(it.approvalNo);
      return d ? { ...it, ...d } : it;
    });
  }

  async function fetchMerchantDetail(approvalNo) {
    // 1. Find row index
    const idx = await evaluate(`
      (function() {
        const tables = document.querySelectorAll('table');
        let t = null;
        for (const tb of tables) {
          const rs = tb.querySelectorAll('tbody tr');
          if (rs.length && /\\d{4}\\.\\d{2}\\.\\d{2}/.test(rs[0].textContent || '')) { t = tb; break; }
        }
        if (!t) return -1;
        const rows = t.querySelectorAll('tbody tr');
        for (let i = 0; i < rows.length; i++) {
          const cells = rows[i].querySelectorAll('td');
          if (cells[2] && cells[2].textContent.trim() === '${approvalNo}') return i;
        }
        return -1;
      })()
    `);
    if (idx < 0) return null;

    // 2. Scroll into view + get coords
    const coords = await evaluate(`
      (function() {
        const tables = document.querySelectorAll('table');
        let t = null;
        for (const tb of tables) {
          const rs = tb.querySelectorAll('tbody tr');
          if (rs.length && /\\d{4}\\.\\d{2}\\.\\d{2}/.test(rs[0].textContent || '')) { t = tb; break; }
        }
        const row = t.querySelectorAll('tbody tr')[${idx}];
        const cell = row.querySelectorAll('td')[4];
        if (!cell) return null;
        cell.scrollIntoView({ block: 'center' });
        const span = cell.querySelector('span') || cell;
        const rect = span.getBoundingClientRect();
        return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
      })()
    `);
    if (!coords) return null;
    await sleep(200);

    // 3. Click merchant cell
    await session.clickXY(coords.x, coords.y);
    await sleep(1000); // wait for modal AJAX

    // 4. Read modal fields
    const details = await evaluate(`
      (function() {
        const bizNoEl  = document.getElementById('bizNo');
        const bzctgEl  = document.getElementById('bzctg');
        const addrEl   = document.getElementById('addr');
        const telNoEl  = document.getElementById('telNo');
        const mchNmEl  = document.getElementById('mchNm');
        const noMchEl  = document.getElementById('noMchInfo');
        let unregistered = false;
        if (noMchEl) {
          const s = getComputedStyle(noMchEl);
          unregistered = s.display !== 'none' && s.visibility !== 'hidden';
        }
        if (unregistered) return { unregistered: true };
        return {
          bizNo:    bizNoEl ? bizNoEl.textContent.trim() : null,
          category: bzctgEl ? bzctgEl.textContent.trim() : null,
          addr:     addrEl  ? addrEl.textContent.trim()  : null,
          tel:      telNoEl ? telNoEl.textContent.trim() : null,
          detailName: mchNmEl ? mchNmEl.textContent.trim() : null,
        };
      })()
    `);

    // 5. Close modal
    await evaluate(`
      (function() {
        const btns = document.querySelectorAll('#closeBtn, .btnIco_close');
        for (const b of btns) {
          const r = b.getBoundingClientRect();
          if (r.width > 0) { b.click(); return; }
        }
      })()
    `);
    await sleep(400);

    return details;
  }

  return { getCardHistory, extractHistoryData, parseHistoryData, resolveDates, enrichMerchant };
}

module.exports = { createHistoryFetcher };
