const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function createCDPSession({ headless = true, screenshotDir = null, disablePopupKiller = false } = {}) {
  const browser = await puppeteer.launch({
    headless: headless ? 'new' : false,
    args: [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1920,1080',
      '--lang=ko-KR',
    ],
    defaultViewport: { width: 1920, height: 1080 },
    ignoreHTTPSErrors: true,
  });

  const page = await browser.newPage();
  const cdp = await page.target().createCDPSession();
  console.error(`CDP: puppeteer launched (${headless ? 'headless' : 'HEADFUL'})`);

  if (disablePopupKiller) {
    // Pre-set idempotency flag so injectPopupKiller() skips. Explicit dismissPopups()
    // calls still work — this only disables the continuous MutationObserver.
    await page.evaluateOnNewDocument(() => {
      window.__popupKillerActive = true;
    });
    console.error('CDP: popup killer observer disabled (merchant modal enrichment requires this)');
  }

  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36'
  );
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'ko-KR,ko;q=0.9' });

  // Document navigation intercept — block bank security-page redirect
  await cdp.send('Fetch.enable', { patterns: [{ resourceType: 'Document' }] });
  cdp.on('Fetch.requestPaused', async (req) => {
    try {
      if (req.request && req.request.url && req.request.url.includes('H1MMB205')) {
        console.error('[Security bypass] Blocked redirect:', req.request.url.split('?')[0].split('/').pop());
        await cdp.send('Fetch.failRequest', { requestId: req.requestId, errorReason: 'Aborted' });
      } else {
        await cdp.send('Fetch.continueRequest', { requestId: req.requestId });
      }
    } catch (e) {
      // request may already be closed
    }
  });

  // Veraport / IPinside mock injection
  await page.evaluateOnNewDocument(`
    window.vp_checkVp20Install = function() { return true; };
    window.vp_isUse = function() { return true; };
    try {
      var _origCookieDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
      if (_origCookieDesc && _origCookieDesc.get) {
        Object.defineProperty(document, 'cookie', {
          get() {
            var c = _origCookieDesc.get.call(document);
            if (!c.includes('IPinside6.isInstalled=YES')) {
              c = 'com.interezen.IPinside6.isInstalled=YES; ' + c;
            }
            return c;
          },
          set(v) { _origCookieDesc.set.call(document, v); },
          configurable: true
        });
      }
    } catch(e) {}
  `);

  async function sendSession(method, params = {}) {
    return cdp.send(method, params);
  }

  async function evaluate(expr) {
    const result = await sendSession('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) {
      const err = result.exceptionDetails;
      throw new Error(err.text || err.exception?.description || JSON.stringify(err));
    }
    return result.result ? result.result.value : undefined;
  }

  async function evaluateRaw(expr) {
    return sendSession('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    });
  }

  async function screenshot(name) {
    if (!screenshotDir) return;
    try {
      const result = await sendSession('Page.captureScreenshot', { format: 'png', quality: 70 });
      const outPath = path.join(screenshotDir, name);
      fs.writeFileSync(outPath, Buffer.from(result.data, 'base64'));
      console.error(`Screenshot: ${name}`);
    } catch (e) {
      console.error(`Screenshot failed (non-fatal): ${name} — ${e.message}`);
    }
  }

  // Full-page screenshot — writes to outPath if provided, else returns Buffer.
  async function fullPageScreenshot(outPath) {
    try {
      if (outPath) {
        await page.screenshot({ path: outPath, fullPage: true, type: 'png' });
        console.error(`Full-page screenshot: ${outPath}`);
        return outPath;
      }
      return await page.screenshot({ fullPage: true, type: 'png' });
    } catch (e) {
      console.error(`Full-page screenshot failed: ${e.message}`);
      return null;
    }
  }

  async function waitForNavigation(timeout = 20000) {
    const startTime = Date.now();
    const startUrl = await evaluate('window.location.href').catch(() => '');
    await sleep(3000);
    while (Date.now() - startTime < timeout) {
      const curUrl = await evaluate('window.location.href').catch(() => '');
      const readyState = await evaluate('document.readyState').catch(() => 'complete');
      if (readyState === 'complete' && (curUrl !== startUrl || Date.now() - startTime > 5000)) {
        await sleep(1500);
        return;
      }
      await sleep(500);
    }
  }

  async function navigateTo(url) {
    await sendSession('Page.navigate', { url });
    await waitForNavigation();
    await sleep(1500);
  }

  async function clickXY(x, y) {
    await sendSession('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await sleep(30);
    await sendSession('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    await sleep(100);
  }

  async function clickSelector(selector) {
    const box = await evaluate(`
      (function() {
        var el = document.querySelector('${selector}');
        if (!el) return null;
        var rect = el.getBoundingClientRect();
        return {x: Math.round(rect.left + rect.width/2), y: Math.round(rect.top + rect.height/2)};
      })()
    `);
    if (!box) throw new Error('Not found: ' + selector);
    await clickXY(box.x, box.y);
    await sleep(200);
  }

  async function typeTextInField(selector, text) {
    const setOk = await evaluate(`
      (function() {
        var el = document.querySelector('${selector}');
        if (!el) return false;
        el.focus();
        var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(el, '${text.replace(/'/g, "\\'")}');
        el.dispatchEvent(new Event('input', {bubbles: true}));
        el.dispatchEvent(new Event('change', {bubbles: true}));
        return el.value;
      })()
    `);

    if (setOk !== text) {
      await evaluate(`
        (function() {
          var el = document.querySelector('${selector}');
          if (el) { el.focus(); el.value = ''; }
        })()
      `);
      await sleep(100);
      for (const ch of text) {
        await sendSession('Input.dispatchKeyEvent', { type: 'char', text: ch });
        await sleep(50);
      }
    }
    await sleep(100);
  }

  async function close() {
    try { await browser.close(); } catch (e) { /* ignore */ }
  }

  return {
    browser, page, cdp,
    sendSession, evaluate, evaluateRaw,
    screenshot, fullPageScreenshot, waitForNavigation, navigateTo,
    clickXY, clickSelector, typeTextInField,
    sleep, close,
  };
}

module.exports = { createCDPSession, sleep };
