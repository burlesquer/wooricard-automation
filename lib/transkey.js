// TransKey actual aria-labels (from 우리카드 keyboard diagnostic 2026-03-17)
const CHAR_LABEL_MAP = {
  '!': ['느낌표', '!'],
  '@': ['골뱅이', '@'],
  '#': ['우물정', '샵', '#'],
  '$': ['달러기호', '달러', '$'],
  '%': ['퍼센트', '%'],
  '^': ['꺽쇠', '^', '꺽쇠위'],
  '&': ['엠퍼샌드', '앤퍼샌드', '&'],
  '*': ['별표', '*', '애스터리스크'],
  '(': ['왼쪽괄호', '여는소괄호', '('],
  ')': ['오른쪽괄호', '닫는소괄호', ')'],
  '-': ['빼기', '-', '하이픈', '마이너스'],
  '_': ['밑줄', '언더스코어', '_'],
  '=': ['등호', '='],
  '+': ['더하기', '+'],
  '[': ['왼쪽대괄호', '[', '여는대괄호'],
  ']': ['오른쪽대괄호', ']', '닫는대괄호'],
  '{': ['왼쪽중괄호', '{', '여는중괄호'],
  '}': ['오른쪽중괄호', '}', '닫는중괄호'],
  '|': ['수직막대', '|', '파이프'],
  ';': ['세미콜론', ';'],
  ':': ['콜론', ':'],
  "'": ['작은따옴표', "'", '어포스트로피'],
  '"': ['따옴표', '"', '쌍따옴표'],
  ',': ['쉼표', ',', '콤마'],
  '.': ['마침표', '.', '점'],
  '<': ['왼쪽꺽쇠괄호', '<', '꺽쇠왼쪽', '작은따옴표여는'],
  '>': ['오른쪽꺽쇠괄호', '>', '꺽쇠오른쪽'],
  '?': ['물음표', '?'],
  '/': ['슬래시', '/', '빗금'],
  '\\': ['역슬래시', '\\'],
  '~': ['물결표시', '물결표', '~', '틸드'],
  '`': ['어금기호', '`', '백틱'],
  ' ': ['스페이스바', '띄어쓰기', 'space', '스페이스'],
};

function getAriaLabels(char) {
  if (/[a-z]/.test(char)) return [char.toLowerCase()];
  // shift 후 키패드 라벨이 '대문자d' 형태로 바뀌는 케이스 대응
  if (/[A-Z]/.test(char)) {
    const lower = char.toLowerCase();
    return [lower, '대문자' + lower, '대문자' + char, char];
  }
  if (/[0-9]/.test(char)) return [char];
  return CHAR_LABEL_MAP[char] || [char];
}

function createTransKey(session) {
  const { evaluate, clickXY, clickSelector, sleep } = session;

  async function readLayout() {
    const json = await evaluate(`
      (function() {
        var mainDiv = transkey && transkey.userPwd && transkey.userPwd.mainDiv;
        if (!mainDiv) return null;
        var rect = mainDiv.getBoundingClientRect();
        if (rect.width < 100) return null;
        var keys = Array.from(mainDiv.querySelectorAll('[role="button"]')).map(function(el) {
          var r = el.getBoundingClientRect();
          var oc = el.getAttribute('onclick') || '';
          var m = oc.match(/tk[.]start[(]event,(\\d+)[)]/);
          return {
            index: m ? parseInt(m[1]) : -1,
            label: el.getAttribute('aria-label') || el.textContent.trim() || '',
            x: Math.round(r.x + r.width / 2),
            y: Math.round(r.y + r.height / 2),
            w: r.width,
            h: r.height
          };
        }).filter(function(k) { return k.index >= 0 || k.label; });
        return JSON.stringify(keys);
      })()
    `);
    return json ? JSON.parse(json) : null;
  }

  function applyLayout(keys, labelMap, newKeys) {
    if (!newKeys) return;
    Object.keys(labelMap).forEach(k => delete labelMap[k]);
    for (const key of newKeys) {
      if (key.label && key.label !== '빈칸') {
        labelMap[key.label.toLowerCase()] = key;
      }
    }
    keys.length = 0;
    newKeys.forEach(k => keys.push(k));
  }

  async function clickByIndex(index) {
    if (index < 0) return 'no-index';
    return evaluate(`
      (function() {
        try {
          if (!transkey || !transkey.userPwd) return 'no-transkey';
          var mainDiv = transkey.userPwd.mainDiv;
          if (!mainDiv) return 'no-mainDiv';
          var btns = Array.from(mainDiv.querySelectorAll('[role="button"]'));
          for (var i = 0; i < btns.length; i++) {
            var oc = btns[i].getAttribute('onclick') || '';
            if (oc.indexOf('tk.start(event,' + ${index} + ')') !== -1) {
              btns[i].click();
              return 'ok:clicked-btn-' + ${index};
            }
          }
          return 'not-found-' + ${index};
        } catch(e) { return 'error:' + e.message; }
      })()
    `);
  }

  async function clickByLabel(label) {
    const escaped = label.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return evaluate(`
      (function() {
        try {
          if (!transkey || !transkey.userPwd) return 'no-transkey';
          var mainDiv = transkey.userPwd.mainDiv;
          if (!mainDiv) return 'no-mainDiv';
          var labelLower = '${escaped}'.toLowerCase();
          var btns = Array.from(mainDiv.querySelectorAll('[role="button"]'));
          for (var i = 0; i < btns.length; i++) {
            var lbl = (btns[i].getAttribute('aria-label') || btns[i].textContent.trim() || '').toLowerCase();
            if (lbl === labelLower) {
              btns[i].click();
              return 'ok:' + lbl;
            }
          }
          return 'not-found:' + '${escaped}';
        } catch(e) { return 'error:' + e.message; }
      })()
    `);
  }

  async function typePassword(inputId, password) {
    console.error(`  Typing password via TransKey (${password.length} chars)...`);

    await evaluate(`
      (function() {
        try {
          if (window.transkey && transkey.userPwd && transkey.userPwd.allocate) {
            transkey.userPwd.allocate = false;
            var md = transkey.userPwd.mainDiv;
            if (md) md.style.display = 'none';
          }
        } catch(e) {}
      })()
    `).catch(() => {});
    await sleep(400);

    const kbBtnClicked = await evaluate(`
      (function() {
        var btns = document.querySelectorAll('button');
        var kbBtn = Array.from(btns).find(b => b.textContent.trim() === '보안키패드');
        if (kbBtn) { kbBtn.click(); return true; }
        return false;
      })()
    `);
    if (!kbBtnClicked) await clickSelector(`#${inputId}`);
    await sleep(2000);

    let allocated = false;
    for (let i = 0; i < 20; i++) {
      const status = await evaluate(`
        (function() {
          var tkObj = transkey.userPwd;
          var mainDiv = tkObj.mainDiv;
          var rect = mainDiv ? mainDiv.getBoundingClientRect() : null;
          return {allocated: tkObj.allocate, width: rect ? rect.width : 0, height: rect ? rect.height : 0};
        })()
      `);
      if (status && status.allocated && status.width > 100) {
        allocated = true;
        console.error(`  Keyboard allocated! Size: ${status.width}x${status.height}`);
        break;
      }
      await sleep(500);
    }
    if (!allocated) throw new Error('TransKey keyboard failed to allocate');

    const keys = (await readLayout()) || [];
    console.error(`  Found ${keys.length} keyboard keys`);

    const labelMap = {};
    for (const key of keys) {
      if (key.label && key.label !== '빈칸') labelMap[key.label.toLowerCase()] = key;
    }
    console.error('  Available labels:', Object.keys(labelMap).slice(0, 30).join(', '));

    const shiftNumMap = {
      '!': '1', '@': '2', '#': '3', '$': '4', '%': '5',
      '^': '6', '&': '7', '*': '8', '(': '9', ')': '0',
    };

    async function clickShiftChar(baseChar, currentKeys, currentLabelMap, targetChar = null) {
      console.error(`    tk.cap() shift then '${baseChar}'${targetChar ? ` (target: '${targetChar}')` : ''}`);
      let capResult = 'not_tried';
      for (let capTry = 0; capTry < 3; capTry++) {
        capResult = await evaluate(`
          (function() {
            try {
              if (!tk.now && transkey.userPwd) tk.now = transkey.userPwd;
              if (!tk.now) return 'err:tk.now still null';
              var kt = tk.now.keyType;
              if (kt !== 'upper') tk.cap();
              return tk.now.keyType;
            } catch(e) { return 'err:' + e.message; }
          })()
        `);
        console.error(`    tk.cap() attempt ${capTry + 1}: keyType=${capResult}`);
        if (capResult === 'upper') break;
        await sleep(500);
      }
      if (capResult !== 'upper') throw new Error('tk.cap() failed to activate shift: ' + capResult);
      await sleep(300);

      const shiftedKeys = (await readLayout()) || [];
      for (const key of shiftedKeys) {
        if (key.label && key.label !== '빈칸') currentLabelMap[key.label.toLowerCase()] = key;
      }

      let baseKey = null;
      if (targetChar) {
        const targetLabels = getAriaLabels(targetChar);
        for (const lbl of targetLabels) {
          baseKey = currentLabelMap[lbl.toLowerCase()];
          if (baseKey) { console.error(`    Found target '${targetChar}' by exact label '${lbl}'`); break; }
          baseKey = shiftedKeys.find(k => k.label && k.label.toLowerCase().includes(lbl.toLowerCase()));
          if (baseKey) { console.error(`    Found target '${targetChar}' by partial label '${lbl}' in '${baseKey.label}'`); break; }
        }
        if (!baseKey) baseKey = shiftedKeys.find(k => k.label === targetChar);
      }
      if (!baseKey) {
        baseKey = currentLabelMap[baseChar.toLowerCase()]
               || shiftedKeys.find(k => k.label === baseChar)
               || shiftedKeys.find(k => k.label && k.label.includes(baseChar));
      }
      if (!baseKey) {
        const domResult = await evaluate(`
          (function() {
            var mainDiv = transkey.userPwd.mainDiv;
            if (!mainDiv) return null;
            var btns = Array.from(mainDiv.querySelectorAll('[role="button"]'));
            var target = ${JSON.stringify(targetChar || '')};
            var base = ${JSON.stringify(baseChar)};
            var btn = btns.find(b => b.innerText.trim() === target || b.innerText.trim() === base);
            if (!btn) btn = btns.find(b => {
              var lbl = b.getAttribute('aria-label') || '';
              return (target && lbl.includes(target)) || lbl.includes(base);
            });
            if (!btn) return null;
            var r = btn.getBoundingClientRect();
            if (r.width < 1) return null;
            return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2), label: btn.getAttribute('aria-label') || btn.innerText.trim() };
          })()
        `).catch(() => null);
        if (domResult && domResult.x) {
          baseKey = domResult;
          console.error(`    Found '${targetChar || baseChar}' via DOM innerText/aria-label scan (label: ${domResult.label})`);
        }
      }
      if (!baseKey) {
        console.error(`    Available shifted keys: ${shiftedKeys.map(k => k.label).slice(0, 30).join(', ')}`);
        throw new Error(`Cannot find base key '${baseChar}'${targetChar ? ` / '${targetChar}'` : ''} after shift`);
      }
      let shiftClickRes;
      if (baseKey.index >= 0) shiftClickRes = await clickByIndex(baseKey.index);
      else shiftClickRes = await clickByLabel(baseKey.label || baseChar);
      console.error(`    Shift key click: ${shiftClickRes}`);
      if (!shiftClickRes || !shiftClickRes.startsWith('ok')) await clickXY(baseKey.x, baseKey.y);
      await sleep(200);
    }

    function findShiftKey(keyList) {
      // 우선순위 1: 명시적 shift 라벨 ('왼쪽 쉬프트' / '오른쪽 쉬프트' / 'shift')
      // upper 모드에서도 shift 키 자체는 그대로 보임. 먼저 이걸로 매칭.
      let key = keyList.find(k => k.label && (
        k.label.includes('쉬프트') || k.label.toLowerCase().includes('shift')
      ));
      if (key) return key;
      // 우선순위 2: caps lock 류. 단, '대문자Q' 같은 단일 letter label 은 제외.
      return keyList.find(k => k.label && (
        (k.label.includes('대문자') && !/^대문자.$/.test(k.label)) ||
        k.label.toLowerCase().includes('caps')
      ));
    }

    // shift 키를 live DOM scan 으로 찾아 클릭. cached keys 는 절대 신뢰하지 않음.
    // (upper 모드 캐시에는 '대문자Q' 같은 letter 라벨이 있어 헷갈릴 수 있음)
    async function clickShiftLive() {
      const result = await evaluate(`
        (function() {
          var mainDiv = transkey && transkey.userPwd && transkey.userPwd.mainDiv;
          if (!mainDiv) return { found: false };
          var btns = Array.from(mainDiv.querySelectorAll('[role="button"]'));
          var shiftBtn = btns.find(function(b) {
            var lbl = (b.getAttribute('aria-label') || '').trim();
            return lbl === '왼쪽 쉬프트' || lbl === '오른쪽 쉬프트' || lbl.toLowerCase().includes('shift');
          });
          if (!shiftBtn) return { found: false };
          shiftBtn.click();
          return {
            found: true,
            label: shiftBtn.getAttribute('aria-label') || '',
            keyTypeAfter: (transkey.userPwd && transkey.userPwd.keyType) || null
          };
        })()
      `).catch(() => ({ found: false }));
      return result;
    }

    async function getCurrentKeyType() {
      return evaluate(`(transkey && transkey.userPwd && transkey.userPwd.keyType) || 'lower'`).catch(() => 'lower');
    }

    // upper 모드 진입 — 이미 upper 면 no-op. 아니면 shift 클릭 + layout refresh.
    async function ensureUpperMode() {
      const current = await getCurrentKeyType();
      if (current === 'upper') return false;
      const r = await clickShiftLive();
      if (!r.found) {
        console.error(`    [ensureUpperMode] shift key not found in live DOM`);
        return false;
      }
      await sleep(400);
      const refreshed = (await readLayout()) || [];
      applyLayout(keys, labelMap, refreshed);
      return true;
    }

    // lower 모드 복귀 — 이미 lower 면 no-op. 아니면 shift 클릭 + layout refresh.
    // tk.cap() 은 keyType 만 바꾸고 DOM 안 바꿈 (probe 검증), 따라서 사용 안 함.
    async function ensureLowerMode() {
      const current = await getCurrentKeyType();
      if (current !== 'upper') return false;
      const r = await clickShiftLive();
      if (!r.found) {
        console.error(`    [ensureLowerMode] shift key not found in live DOM`);
        return false;
      }
      await sleep(400);
      const refreshed = (await readLayout()) || [];
      applyLayout(keys, labelMap, refreshed);
      return true;
    }

    let inSpecialTab = false;

    for (const char of password) {
      const isUpper = /[A-Z]/.test(char);
      const isLower = /[a-z]/.test(char);
      const isDigit = /[0-9]/.test(char);

      // Mode-aware shift toggling.
      // - uppercase 필요한데 lower 면 shift on
      // - lowercase/digit 필요한데 upper 면 shift off (직전 uppercase 입력 후 sticky upper 해제)
      // - 연속 uppercase (이미 upper) → no-op, '대문자X' 라벨 바로 클릭 가능
      // - special 글자 (!, @, etc.) 는 아래 shift+num path 가 별도 처리 (keyType 만 upper 로 토글)
      if (isUpper) {
        const switched = await ensureUpperMode();
        if (switched) console.error(`    Shift toggled ON for uppercase '${char}'`);
      } else if (isLower || isDigit) {
        const switched = await ensureLowerMode();
        if (switched) console.error(`    Shift toggled OFF (sticky upper reset) for '${char}'`);
      }

      const possibleLabels = getAriaLabels(char);
      let foundKey = null;

      for (const label of possibleLabels) {
        if (labelMap[label.toLowerCase()]) { foundKey = labelMap[label.toLowerCase()]; break; }
      }
      if (!foundKey) foundKey = keys.find(k => k.label === char || k.label.toLowerCase() === char.toLowerCase());

      if (!foundKey) {
        console.error(`  WARNING: Key not found for char: '${char}' (${char.charCodeAt(0)}). Labels tried: ${possibleLabels.join(', ')}`);

        async function refreshKeyboard() {
          const ks = await readLayout();
          if (!ks) return;
          applyLayout(keys, labelMap, ks);
          console.error(`  [refreshKeyboard] ${ks.length} keys, labels: ${Object.keys(labelMap).slice(0, 20).join(', ')}`);
        }

        const textSearchResult = await evaluate(`
          (function() {
            var mainDiv = transkey.userPwd.mainDiv;
            if (!mainDiv) return null;
            var btns = Array.from(mainDiv.querySelectorAll('[role="button"]'));
            var target = ${JSON.stringify(char)};
            var btn = btns.find(b => b.textContent.trim() === target);
            if (!btn) return null;
            var r = btn.getBoundingClientRect();
            return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2), label: target };
          })()
        `);
        if (textSearchResult && textSearchResult.x) {
          foundKey = textSearchResult;
          console.error(`  Found '${char}' via textContent search`);
        }

        if (!foundKey && shiftNumMap[char]) {
          console.error(`  Trying Shift+${shiftNumMap[char]} for '${char}'`);
          let shiftOk = false;
          try {
            await clickShiftChar(shiftNumMap[char], keys, labelMap, char);
            shiftOk = true;
          } catch (shiftErr) {
            console.error(`  Shift+num failed for '${char}': ${shiftErr.message}`);
            await evaluate(`
              (function() {
                try {
                  if (!tk.now && transkey.userPwd) tk.now = transkey.userPwd;
                  if (tk.now && tk.now.keyType === 'upper') tk.cap();
                } catch(e) {}
              })()
            `).catch(() => {});
            await sleep(400);
            await refreshKeyboard();
          }

          if (shiftOk) {
            await sleep(300);
            for (let resetTry = 0; resetTry < 3; resetTry++) {
              const keyTypeAfter = await evaluate('transkey.userPwd.keyType').catch(() => null);
              if (keyTypeAfter !== 'upper') break;
              console.error(`  Keyboard still in upper mode (try ${resetTry + 1}) — tk.cap() to reset`);
              await evaluate(`
                (function() {
                  try {
                    if (!tk.now && transkey.userPwd) tk.now = transkey.userPwd;
                    if (tk.now && tk.now.keyType === 'upper') tk.cap();
                  } catch(e) {}
                })()
              `).catch(() => {});
              await sleep(400);
            }
            await evaluate(`
              (function() {
                try { if (window.transkey && transkey.userPwd) transkey.userPwd.keyType = 'lower'; } catch(e) {}
              })()
            `).catch(() => {});
            await refreshKeyboard();
            continue;
          }

          console.error(`  Trying special chars tab for '${char}'...`);
          const tabSwitched = await evaluate(`
            (function() {
              var mainDiv = transkey.userPwd.mainDiv;
              if (!mainDiv) return null;
              var btns = Array.from(mainDiv.querySelectorAll('[role="button"], button, a, span'));
              var tabBtn = btns.find(function(b) {
                var lbl = (b.getAttribute('aria-label') || b.textContent.trim() || '').toLowerCase();
                if (lbl === '어금기호' || lbl === '기호' || lbl === '백틱') return false;
                return (lbl.includes('특수') && !lbl.includes('어금')) ||
                       lbl === '!@#' || lbl === '#!1' || lbl === '!#1' ||
                       lbl === 'symbol' || lbl === 'special';
              });
              if (!tabBtn) {
                tabBtn = btns.find(function(b) {
                  var oc = (b.getAttribute('onclick') || '');
                  return oc.length > 0 && !oc.includes('tk.start') &&
                         (oc.includes('special') || oc.includes('symbol') || oc.includes('num'));
                });
              }
              if (!tabBtn) return null;
              tabBtn.click();
              return tabBtn.getAttribute('aria-label') || tabBtn.textContent.trim();
            })()
          `).catch(() => null);

          if (tabSwitched) {
            console.error(`  Special chars tab clicked: "${tabSwitched}"`);
            await sleep(600);
            await refreshKeyboard();
            console.error(`  Special tab keys: ${Object.keys(labelMap).slice(0, 25).join(', ')}`);
            const possLbls2 = getAriaLabels(char);
            for (const lbl of possLbls2) {
              foundKey = labelMap[lbl.toLowerCase()];
              if (foundKey) { console.error(`  Found '${char}' in special tab by label '${lbl}'`); break; }
              foundKey = keys.find(k => k.label && k.label.toLowerCase().includes(lbl.toLowerCase()));
              if (foundKey) { console.error(`  Found '${char}' in special tab (partial) '${lbl}'`); break; }
            }
            if (!foundKey) foundKey = keys.find(k => k.label === char);
            if (foundKey) inSpecialTab = true;
            else console.error(`  '${char}' not found in special tab either. Available: ${Object.keys(labelMap).slice(0, 30).join(', ')}`);
          } else {
            console.error(`  No special chars tab button found`);
          }
        }

        if (!foundKey) {
          console.error(`  Key not found, retrying keyboard re-read for '${char}'...`);
          for (let retry = 0; retry < 3 && !foundKey; retry++) {
            await sleep(600);
            await refreshKeyboard();
            for (const label of possibleLabels) {
              if (labelMap[label.toLowerCase()]) { foundKey = labelMap[label.toLowerCase()]; break; }
            }
            if (!foundKey) foundKey = keys.find(k => k.label && (k.label === char || k.label.toLowerCase() === char.toLowerCase()));
            if (foundKey) console.error(`  Found '${char}' on retry ${retry + 1}`);
          }
        }

        if (!foundKey) {
          console.error(`  Available keys:`, Object.keys(labelMap).join(', '));
          throw new Error(`Cannot find key for character: '${char}'`);
        }
      }

      console.error(`    Clicking '${char}' [label: ${foundKey.label}, index: ${foundKey.index}]`);
      let tkRes;
      if (foundKey.index >= 0) tkRes = await clickByIndex(foundKey.index);
      else tkRes = await clickByLabel(foundKey.label || char);
      console.error(`    tk click: ${tkRes}`);
      if (!tkRes || !tkRes.startsWith('ok')) {
        console.error(`    DOM click failed, fallback to clickXY`);
        await clickXY(foundKey.x, foundKey.y);
      }
      await sleep(250);

      if (inSpecialTab) {
        const backToNormal = await evaluate(`
          (function() {
            var mainDiv = transkey.userPwd.mainDiv;
            var btns = Array.from(mainDiv.querySelectorAll('[role="button"]'));
            var alphaBtn = btns.find(b => {
              var lbl = (b.getAttribute('aria-label') || '').toLowerCase();
              return lbl === 'abc' || lbl.includes('영문') || lbl.includes('알파벳') || lbl === '가나다';
            });
            if (alphaBtn) { alphaBtn.click(); return alphaBtn.getAttribute('aria-label'); }
            return null;
          })()
        `);
        await sleep(400);
        inSpecialTab = false;
        console.error(`  Returned to normal keyboard: ${backToNormal}`);
      }

      if (password.indexOf(char) < password.length - 1) {
        const newKeys = await readLayout();
        if (newKeys) applyLayout(keys, labelMap, newKeys);
      }
    }

    console.error(`  Password typing complete`);

    const confirmResult = await evaluate(`
      (function() {
        var mainDiv = transkey.userPwd.mainDiv;
        var btns = Array.from(mainDiv.querySelectorAll('[role="button"]'));
        var confirmBtn = btns.find(b => ['완료', '확인', 'done', 'ok'].includes(b.getAttribute('aria-label').toLowerCase()));
        if (confirmBtn) { confirmBtn.click(); return 'clicked confirm: ' + confirmBtn.getAttribute('aria-label'); }
        return 'no confirm button found';
      })()
    `);
    console.error('  Confirm result:', confirmResult);
    await sleep(500);
  }

  return { typePassword, readLayout, applyLayout, clickByIndex, clickByLabel };
}

module.exports = { createTransKey, CHAR_LABEL_MAP, getAriaLabels };
