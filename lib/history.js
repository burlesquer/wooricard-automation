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
    for (let retry = 0; retry < 3 && historyData.sbgridRows.length === 0; retry++) {
      console.error(`  Empty SBGrid (retry ${retry + 1})`);
      await dismissPopups();
      await sleep(3000);
      historyData = await extractHistoryData(account);
    }

    // 거래 50+ 시 우리카드는 default maxCount=50 으로 응답 → 51번째 이후 누락.
    // select#maxCount 가장 큰 옵션 (100/150/200) 선택 + #btnCntView 확인 클릭 → 재extract.
    if (await expandMaxCountIfNeeded()) {
      historyData = await extractHistoryData(account);
    }

    return historyData;
  }

  async function expandMaxCountIfNeeded() {
    const result = await evaluate(`
      JSON.stringify((function() {
        var sel = document.getElementById('maxCount');
        if (!sel) return { needed: false, reason: 'no maxCount select' };
        var opts = Array.from(sel.options).map(function(o){ return parseInt(o.value, 10) || 0; });
        var max = opts.length ? Math.max.apply(null, opts) : 0;
        var cur = parseInt(sel.value, 10) || 0;
        if (max <= cur) return { needed: false, reason: 'already at max ' + cur, opts: opts };
        var setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
        setter.call(sel, String(max));
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        var btn = document.getElementById('btnCntView');
        if (!btn) return { needed: true, applied: false, reason: 'no #btnCntView' };
        btn.click();
        return { needed: true, applied: true, from: cur, to: max };
      })());
    `);
    const r = JSON.parse(result);
    if (r.needed && r.applied) {
      console.error(`  maxCount ${r.from} → ${r.to} (확인 클릭, 재조회 대기)`);
      await sleep(5000);
      return true;
    }
    if (r.needed && !r.applied) {
      console.error(`  maxCount 확장 실패: ${r.reason}`);
    }
    return false;
  }

  async function extractHistoryData(account) {
    // Pull all rows directly from SBGrid's internal data model (bypasses virtual-scroll DOM limit).
    const data = await evaluate(`
      JSON.stringify((function() {
        try {
          var g = window._SBGrid && window._SBGrid.getGrid && window._SBGrid.getGrid('mainGridId');
          var rows = g ? (g._getGridDataAll() || []) : [];
          var apvAm = document.querySelector('#apvAm');
          var totalText = apvAm ? apvAm.textContent.trim() : '';
          return { sbgridRows: rows, totalText: totalText };
        } catch (e) { return { sbgridRows: [], totalText: '', err: e.message }; }
      })());
    `);
    const result = JSON.parse(data);
    const sbgridSum = (result.sbgridRows || []).reduce((s, r) =>
      s + (parseInt(r.APV_AM_10 || '0', 10) - parseInt(r.CAN_AM_10 || '0', 10)), 0);
    const screenAmt = parseInt(String(result.totalText || '').replace(/[^\d]/g, ''), 10) || 0;
    console.error(`  SBGrid rows: ${result.sbgridRows.length}, sum=${sbgridSum.toLocaleString()}원, screen=${result.totalText}`);
    if (screenAmt > 0 && sbgridSum !== screenAmt) {
      console.error(`  WARN: SBGrid sum ≠ #apvAm (${(screenAmt - sbgridSum).toLocaleString()}원 누락 가능)`);
    }
    return result;
  }

  function parseHistoryData(rawData, account) {
    const { sbgridRows = [] } = rawData;
    const { currentYear, targetMonth } = resolveDates();
    const monthPrefix = `${currentYear}${targetMonth}`;

    const items = sbgridRows
      .filter((r) => String(r.APV_DY_8 || '').startsWith(monthPrefix))
      .map((r) => {
        const dy = String(r.APV_DY_8 || '');
        const date = dy.length === 8 ? `${dy.slice(4, 6)}.${dy.slice(6, 8)}` : '';
        const amount = parseInt(r.APV_AM_10 || '0', 10) - parseInt(r.CAN_AM_10 || '0', 10);
        return {
          date,
          approvalNo: r.APV_NO_8 || '',
          merchant: (r.APV_MCH_NM_40 || '').trim(),
          amount,
        };
      })
      .filter((it) => it.amount > 0);

    const totalAmount = items.reduce((sum, it) => sum + it.amount, 0);
    console.error(`  Parsed ${items.length} items in ${currentYear}.${targetMonth} = ${totalAmount.toLocaleString()}원`);
    return { totalAmount, items };
  }

  // Enrich items with merchant details (사업자번호, 업종, 주소, 전화번호) via in-page fetch
  // to /searchMchInfo.pwkjson. SBGrid keeps all rows in memory (virtual scroll only limits DOM
  // render), so this works for the full result set — no row clicks, no DOM coords, no modal.
  // Cache: Map<approvalNo, details>. Requires: already on card history page with results.
  // PRN_NO_13 = APV_MCH_NO_9 augmentation is required — modal click handler does the same copy
  // before the AJAX, and the server validates request shape.
  async function enrichMerchant(items, cache) {
    if (!items || items.length === 0) return items;
    cache = cache || new Map();

    const todo = items.filter((it) => it.approvalNo && !cache.has(it.approvalNo));
    if (todo.length === 0) {
      console.error('  [enrichMerchant] all items already cached');
    } else {
      console.error(`  [enrichMerchant] fetching ${todo.length}/${items.length} via in-page fetch`);

      const rowMap = JSON.parse(await evaluate(`
        JSON.stringify((function() {
          var g = window._SBGrid && window._SBGrid.getGrid && window._SBGrid.getGrid('mainGridId');
          var rows = g ? (g._getGridDataAll() || []) : [];
          var m = {};
          for (var i = 0; i < rows.length; i++) m[rows[i].APV_NO_8] = rows[i];
          return m;
        })());
      `));

      const apvNos = todo.map((it) => it.approvalNo).filter((a) => rowMap[a]);
      const missingFromGrid = todo.length - apvNos.length;
      if (missingFromGrid > 0) console.error(`  [enrichMerchant] ${missingFromGrid} items not in SBGrid — skipping`);

      if (apvNos.length > 0) {
        const fetched = JSON.parse(await evaluate(`
          (async function() {
            var rowMap = ${JSON.stringify(rowMap)};
            var apvNos = ${JSON.stringify(apvNos)};
            var out = {};
            for (var i = 0; i < apvNos.length; i++) {
              var apv = apvNos[i];
              var row = rowMap[apv];
              if (!row) continue;
              if (row.APV_MCH_NO_9 && !row.PRN_NO_13) row.PRN_NO_13 = row.APV_MCH_NO_9;
              var body = JSON.stringify({ eaiSendVo: { eaiReqMap: JSON.stringify(row) } });
              try {
                var resp = await fetch('/dcpc/yh2/bcv/bcv04/apvhisinq/searchMchInfo.pwkjson', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'Accept': 'application/json, text/javascript, */*; q=0.01',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Proworks-Body': 'Y',
                    'Proworks-Lang': 'ko'
                  },
                  body: body,
                  credentials: 'include'
                });
                var json = await resp.json();
                var m = json && json.eaiResMap;
                if (m && m.RSP_CD_2 === '00') {
                  var tel = (m.TEL_NO_DDD_4 && m.BZPLC_TEL_NO_8) ? (m.TEL_NO_DDD_4 + '-' + m.BZPLC_TEL_NO_8) : null;
                  var category = (m.BZCTG_NO_4 && m.BZCTG_NM) ? (m.BZCTG_NO_4 + '/' + m.BZCTG_NM) : (m.BZCTG_NM || null);
                  out[apv] = {
                    bizNo: m.BIZ_NO_10 || null,
                    category: category,
                    addr: m.BZPLC_AD_70 || null,
                    tel: tel,
                    detailName: m.CO_NM_20 || null,
                  };
                } else {
                  out[apv] = { unregistered: true };
                }
              } catch (e) {
                out[apv] = { err: e.message };
              }
            }
            return JSON.stringify(out);
          })()
        `));

        let okCount = 0;
        for (const apv of Object.keys(fetched)) {
          const d = fetched[apv];
          if (d && (d.bizNo || d.category || d.unregistered)) {
            cache.set(apv, d);
            okCount++;
          } else if (d && d.err) {
            console.error(`    [enrichMerchant] apv=${apv} err=${d.err}`);
          }
        }
        console.error(`  [enrichMerchant] enriched ${okCount}/${todo.length}`);
      }
    }

    return items.map((it) => {
      const d = cache.get(it.approvalNo);
      return d ? { ...it, ...d } : it;
    });
  }

  return { getCardHistory, extractHistoryData, parseHistoryData, resolveDates, enrichMerchant };
}

module.exports = { createHistoryFetcher };
