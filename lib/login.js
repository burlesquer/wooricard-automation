function createLoginFlow(session, transkey, { loginUrl }) {
  const {
    evaluate, navigateTo, typeTextInField, clickSelector,
    waitForNavigation, screenshot, sleep,
  } = session;

  async function dismissPopups() {
    const result = await evaluate(`
      (function() {
        var dismissed = [];
        var selectors = [
          '.ui-dialog:visible .ui-dialog-titlebar-close',
          '.ui-dialog .ui-dialog-titlebar-close',
          '.btn_close',
          '.btn-close',
          '[aria-label="닫기"]',
          '[title="닫기"]',
          '.layer_close',
          '#closeBtn',
          '.close_btn',
          'button.close',
          '.popup_close',
          '.modal_close',
          '.ui-dialog-buttonset button',
          '.wrap_popup .btn_close',
          '.pop_close',
          '.ly_close',
          '#layerClose',
          '.layerClose',
          '[class*="pop"][class*="close"]',
          '[class*="layer"][class*="close"]',
          '[id*="layerClose"]',
        ];
        for (var sel of selectors) {
          try {
            var btns = document.querySelectorAll(sel);
            btns.forEach(function(btn) {
              var rect = btn.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0 && btn.offsetParent !== null) {
                btn.click();
                dismissed.push(sel);
              }
            });
          } catch(e) {}
        }
        try {
          if (typeof $ !== 'undefined') {
            $('.ui-dialog:visible').each(function() {
              var closeBtn = $(this).find('.ui-dialog-titlebar-close:visible');
              if (closeBtn.length) { closeBtn[0].click(); dismissed.push('jquery-ui-dialog'); }
            });
          }
        } catch(e) {}
        try {
          document.querySelectorAll('dialog[open]').forEach(function(dlg) {
            var btns = dlg.querySelectorAll('button');
            var btn = Array.from(btns).find(function(b) {
              return ['확인', '닫기', 'ok', 'close'].includes(b.textContent.trim().toLowerCase());
            });
            if (!btn && btns.length > 0) btn = btns[0];
            if (btn) { btn.click(); dismissed.push('native-dialog'); }
            else { dlg.close && dlg.close(); dismissed.push('native-dialog-close'); }
          });
        } catch(e) {}
        return dismissed.length > 0 ? dismissed.join(', ') : 'none';
      })()
    `).catch(() => 'eval-error');
    if (result !== 'none') {
      console.error('  [dismissPopups] Dismissed:', result);
      await sleep(600);
    }
    return result;
  }

  async function injectPopupKiller() {
    await evaluate(`
      (function() {
        if (window.__popupKillerActive) return;
        window.__popupKillerActive = true;
        var CLOSE_SELECTORS = [
          '.ui-dialog .ui-dialog-titlebar-close',
          '.btn_close', '.btn-close', '.pop_close', '.ly_close',
          '.wrap_popup .btn_close', '.popup_close', '.modal_close',
          '[class*="pop"][class*="close"]', '[class*="layer"][class*="close"]',
          '[aria-label="닫기"]', '[title="닫기"]', '.layer_close',
          '#closeBtn', '.close_btn', 'button.close', '#layerClose', '.layerClose',
          '[id*="layerClose"]'
        ];
        function tryClose() {
          var closed = false;
          CLOSE_SELECTORS.forEach(function(sel) {
            try {
              var els = document.querySelectorAll(sel);
              els.forEach(function(el) {
                var r = el.getBoundingClientRect();
                if (r.width > 0 && r.height > 0) { el.click(); closed = true; }
              });
            } catch(e) {}
          });
          try {
            var dialogs = document.querySelectorAll('.ui-dialog:not([style*="display: none"])');
            dialogs.forEach(function(d) {
              var btns = d.querySelectorAll('.ui-dialog-buttonset button, .btn_confirm, button');
              if (btns.length > 0) { btns[0].click(); closed = true; }
            });
          } catch(e) {}
          return closed;
        }
        var observer = new MutationObserver(function() {
          setTimeout(tryClose, 300);
        });
        observer.observe(document.body, { childList: true, subtree: true });
        tryClose();
      })()
    `).catch(() => null);
  }

  async function login(account) {
    console.error(`Login: ${account.name} (${account.id})`);

    await navigateTo(loginUrl);
    await sleep(1500);

    let formReady = false;
    for (let i = 0; i < 20; i++) {
      const found = await evaluate(`!!document.querySelector('#userId')`).catch(() => false);
      if (found) { formReady = true; break; }
      await sleep(500);
    }
    if (!formReady) console.error('  WARNING: #userId not found after 10s, continuing anyway...');

    await injectPopupKiller();

    for (let popupTry = 0; popupTry < 5; popupTry++) {
      const dismissed = await dismissPopups();
      await sleep(700);
      if (dismissed === 'none' && popupTry >= 1) break;
    }
    await sleep(500);

    const currentUrl = await evaluate('window.location.href');
    if (!currentUrl.includes('H2BMM201S01')) {
      console.error('  Already on a different page, navigating to login...');
    }

    await typeTextInField('#userId', account.id);
    await sleep(300);

    await transkey.typePassword('userPwd', account.pw);

    for (let attempt = 0; attempt < 3; attempt++) {
      const currentUserId = await evaluate(
        `document.querySelector('#userId') ? document.querySelector('#userId').value : ''`
      );
      if (currentUserId && currentUserId.trim() === account.id) {
        console.error(`  userId confirmed: ${currentUserId}`);
        break;
      }
      console.error(`  userId mismatch (attempt ${attempt + 1}, got: "${currentUserId}", expected: "${account.id}"), re-filling...`);
      await evaluate(`
        (function() {
          var el = document.querySelector('#userId');
          if (!el) return;
          el.focus();
          var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          nativeSetter.call(el, '${account.id}');
          el.dispatchEvent(new Event('input', {bubbles: true}));
          el.dispatchEvent(new Event('change', {bubbles: true}));
          el.blur();
        })()
      `);
      await sleep(300);
    }

    await dismissPopups();
    await screenshot(`login_${account.name}_before.png`);

    await clickSelector('#doLogin');
    await waitForNavigation(20000);
    await sleep(2000);

    await dismissPopups();
    await sleep(500);

    const loginUrlAfter = await evaluate('window.location.href');
    const loginTitle = await evaluate('document.title');
    console.error(`  After login: ${loginTitle} | ${loginUrlAfter.substring(0, 80)}`);
    await screenshot(`login_${account.name}_after.png`);

    const errorMsg = await evaluate(`
      (function() {
        var alerts = document.querySelectorAll('.alert, .error, .msg_error, [class*="error"], [class*="alert"]');
        var msgs = Array.from(alerts).map(el => el.textContent.trim()).filter(t => t.length > 0);
        return msgs.join(' | ');
      })()
    `);
    if (errorMsg) console.error('  Page messages:', errorMsg.substring(0, 200));

    const isLoginPage = loginUrlAfter.includes('H2BMM201S01')
      || loginUrlAfter.includes('login')
      || loginTitle.includes('로그인');
    if (isLoginPage) {
      throw new Error(`Login failed for ${account.name}. Still on login page.`);
    }

    console.error(`  Login successful!`);
    return true;
  }

  async function logout() {
    try {
      await evaluate(`
        (function() {
          var logoutBtns = Array.from(document.querySelectorAll('a, button')).filter(el => el.textContent.includes('로그아웃'));
          if (logoutBtns.length > 0) { logoutBtns[0].click(); return true; }
          return false;
        })()
      `);
      await sleep(2000);
    } catch (e) {
      console.error('  Logout error:', e.message);
    }
  }

  return { login, logout, dismissPopups, injectPopupKiller };
}

module.exports = { createLoginFlow };
