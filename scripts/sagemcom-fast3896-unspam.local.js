// ==UserScript==
// @name         Cogeco HomeBox (Sagemcom FAST3896) — Unlock Admin UI
// @namespace    local.homebox.unlock
// @version      8.0
// @description  Removes Cogeco UI locks across all config pages: OpenSync/app-managed flags, the full *ReadOnly family, guiIsLocked, the QR app-intercept, edit-mode flags, hardcoded disables, and injects a Save button where the native one was stripped (LAN IPv6). Leaves legit device-state locks and mode logic intact. Hides only physically-absent hardware.
// @match        https://192.168.40.1/2.0/gui/*
// @run-at       document-idle
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/brettwhitty/tampermonkey/refs/heads/main/scripts/sagemcom-fast3896-unspam.local.js
// @updateURL    https://raw.githubusercontent.com/brettwhitty/tampermonkey/refs/heads/main/scripts/sagemcom-fast3896-unspam.local.js
// ==/UserScript==
(function () {
  'use strict';

  var ABSENT_RE = /(^|\.)dect|dectHandset|dectSchedule|gpon|wifi6g|wifiGuest6|6GHz/i;
  var ABSENT_LABEL_RE = /\bDECT\b|\bGPON\b|\b6\s?GHz\b/i;

  // FORCE FALSE — vendor / app-management read-only locks (verified by source audit).
  var READONLY_FLAGS = [
    'allReadOnly','wifiReadOnly','globalReadOnly','hostnameReadOnly','ipv6SimpleReadOnly',
    'preferredModeReadOnly','portForwardingUpnpReadOnly','isFieldReadOnly','macFilterReadOnly',
    'advancedReadOnly','bandSteeringReadOnly','bandSteeringReadOnlyByUser','countryReadOnly',
    'connectionTypeReadOnly','addressingTypeReadOnly','wifiBasicReadOnlyFields','meshSettingsReadOnly',
    'connectedDevicesReadOnly','dnsIPv6ReadOnly','connectionRequestUrlReadOnly','isReadOnly',
    'readOnly','readonly'
  ];
  var LOCK_FLAGS = [
    'guiLocked','GUILocked','guiIsLocked','isLocked','guiCanBeLocked','guiCanbeLocked',
    '_guiCanbeLocked','hideBtnLocked','wanTypeMappingLockedGUI'
  ];
  var SYNC_FLAGS = [
    'wifiAdvancedOpenSync','bandSteeringOpenSync','wpsOpenSync','plumeOpenSync','hasOpenSync',
    'oneOpenSyncPage','openSyncQrCode','openSyncQrCodeActive','openSyncQrCodePartial'
  ];
  var ALL_FLAGS = READONLY_FLAGS.concat(LOCK_FLAGS).concat(SYNC_FLAGS);

  // NEVER touch these — legitimate device state / mode logic, not vendor locks.
  var SAFE_SKIP = /sim.*Lock|simCardStatus|vpnLocked|FolderPermission|disableConnectionType|disableWifiMode|ipv6EnableButton/i;

  // Sections whose native Save button was stripped but whose controller still saves.
  var STRIPPED_SAVE_SECTIONS = [
    { stateRe: /lanIpv6$/i, anchorText: /LAN IPv6 Link-Local Address/i, label: 'Apply IPv6', saveFns: ['beforeSave','save'] }
  ];

  function inj() { try { return angular.element(document.body).injector(); } catch (e) { return null; } }
  function rootScope() { try { return angular.element(document.body).scope().$root; } catch (e) { return null; } }
  function digest() { var r = rootScope(); if (r && !r.$$phase && !r.$root.$$phase) { try { r.$digest(); } catch (e) {} } }

  function collectScopes() {
    var scopes = {};
    document.querySelectorAll('[ng-show],[ng-hide],[ng-if],[ng-disabled],[ng-readonly],input,select,textarea').forEach(function (n) {
      var sc; try { sc = angular.element(n).scope(); } catch (e) { return; }
      while (sc) { scopes[sc.$id] = sc; sc = sc.$parent; }
    });
    return scopes;
  }

  function patchGuard() {
    var i = inj(); if (!i) return false;
    var CF; try { CF = i.get('CheckFeature'); } catch (e) { return false; }
    if (!CF || !CF.go || CF.__unlocked) return !!(CF && CF.__unlocked);
    var orig = CF.go.bind(CF);
    CF.go = function () {
      var r; try { r = orig.apply(null, arguments); } catch (e) {}
      try { var k = arguments && arguments[0]; if (typeof k === 'string' && ABSENT_RE.test(k)) return r; } catch (e) {}
      return true;
    };
    CF.__unlocked = true;
    return true;
  }

  function patchHideTable() {
    try { if (window.$ && $.config && $.config.hideTable) $.config.hideTable.enabled = false; } catch (e) {}
  }

  function unlockAll() {
    if (!window.angular) return;
    var scopes = collectScopes();
    var editFlags = {};
    document.querySelectorAll('[ng-disabled]').forEach(function (el) {
      (((el.getAttribute('ng-disabled') || '').match(/\bedit[A-Za-z0-9]+/g)) || []).forEach(function (f) { editFlags[f] = true; });
    });
    var editNames = Object.keys(editFlags);

    Object.keys(scopes).forEach(function (id) {
      var sc = scopes[id];
      ALL_FLAGS.forEach(function (f) {
        if (f in sc && typeof sc[f] === 'boolean' && sc[f] === true && !SAFE_SKIP.test(f)) sc[f] = false;
      });
      // catch any per-controller *OpenSync / *ShowOnSyncQrCode booleans
      for (var k in sc) {
        if ((/OpenSync$/.test(k) || /ShowOnSyncQrCode$/.test(k)) &&
            typeof sc[k] === 'boolean' && sc[k] === true && !SAFE_SKIP.test(k)) sc[k] = false;
      }
      editNames.forEach(function (f) { sc[f] = true; });
    });

    digest();

    document.querySelectorAll('input[disabled],select[disabled],textarea[disabled]').forEach(function (el) {
      if (!el.getAttribute('ng-disabled') && el.offsetParent !== null) { el.disabled = false; el.removeAttribute('disabled'); }
    });
  }

  function killAppModal() {
    document.querySelectorAll('.modal,.popup,.overlay').forEach(function (m) {
      var t = (m.textContent || '').toLowerCase();
      if (/(install the app|scan the qr|use the[^.]*app|mobile app)/.test(t) && !/share|print/.test(t)) {
        m.style.display = 'none';
        var bd = document.querySelector('.modal-backdrop'); if (bd) bd.style.display = 'none';
      }
    });
  }

  function hideAbsentTiles() {
    document.querySelectorAll('.panel,.box,[class*="tile"],li,a').forEach(function (el) {
      if (el.__absChecked) return;
      var txt = (el.textContent || '').trim();
      if (txt.length && txt.length < 30 && ABSENT_LABEL_RE.test(txt)) {
        var c = el;
        for (var i = 0; i < 4 && c; i++) {
          if (/panel|box|tile|widget|col-/.test((c.className || '').toString())) { c.style.display = 'none'; break; }
          c = c.parentElement;
        }
      }
      el.__absChecked = true;
    });
  }

  function injectStrippedSaves() {
    if (!window.angular) return;
    var i = inj(); if (!i) return;
    var cur; try { cur = i.get('$state').current.name || ''; } catch (e) { cur = ''; }
    STRIPPED_SAVE_SECTIONS.forEach(function (entry, idx) {
      if (!entry.stateRe.test(cur)) return;
      var btnId = 'hb-stripped-save-' + idx;
      if (document.getElementById(btnId)) return;
      var anchor = Array.prototype.find.call(document.querySelectorAll('*'), function (el) {
        return el.children.length < 4 && el.textContent && entry.anchorText.test(el.textContent) && el.textContent.length < 90;
      });
      if (!anchor) return;
      var row = anchor.closest('.row') || anchor.closest('.form-group') || anchor.parentElement;
      if (!row || !row.parentElement) return;
      var sc; try { sc = angular.element(anchor).scope(); } catch (e) { return; }
      var saveScope = null, saveFn = null, s = sc;
      while (s && !saveScope) {
        for (var f = 0; f < entry.saveFns.length; f++) {
          if (typeof s[entry.saveFns[f]] === 'function') { saveScope = s; saveFn = entry.saveFns[f]; break; }
        }
        s = s.$parent;
      }
      if (!saveScope) return;
      var bar = document.createElement('div');
      bar.style.cssText = 'text-align:right;margin:14px 0;padding-right:10px;';
      var btn = document.createElement('button');
      btn.id = btnId; btn.textContent = entry.label;
      btn.style.cssText = 'background:#39a;color:#fff;border:0;border-radius:4px;padding:8px 18px;cursor:pointer;font-size:13px;';
      btn.onclick = function () { try { saveScope[saveFn](); if (!saveScope.$root.$$phase) saveScope.$root.$digest(); } catch (e) { alert('save error: ' + e); } };
      bar.appendChild(btn);
      row.parentElement.insertBefore(bar, row.nextSibling);
    });
  }

  // ---- session ----
  var keepAliveTimer = null;
  function applySession(minutes, keepalive) {
    try {
      if (window.$ && $.xmo) {
        if (minutes) $.xmo.sessionTimeOut = minutes;
        if (keepAliveTimer) { clearInterval(keepAliveTimer); keepAliveTimer = null; }
        if (keepalive && $.xmo.renewSession) keepAliveTimer = setInterval(function () { try { $.xmo.renewSession(); } catch (e) {} }, 60000);
      }
    } catch (e) {}
  }

  // ---- UI (session panel + quick jump + raw API editor) ----
  function buildUI() {
    if (document.getElementById('hb-unlock-ui')) return;
    var wrap = document.createElement('div'); wrap.id = 'hb-unlock-ui';
    wrap.innerHTML = ''
      + '<style>#hb-unlock-ui *{box-sizing:border-box;font-family:Arial,sans-serif}'
      + '.hb-panel{position:fixed;z-index:99999;background:#1d3a53;color:#fff;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.4);font-size:12px;padding:10px 12px;min-width:200px}'
      + '.hb-panel h4{margin:0 0 6px;font-size:12px;font-weight:bold}.hb-panel label{display:block;margin:4px 0;color:#cfe0ee}'
      + '.hb-panel input[type=text],.hb-panel input[type=number],.hb-panel select{width:100%;padding:4px;border:0;border-radius:4px;margin-top:2px;color:#222}'
      + '.hb-panel button{background:#2f6da3;color:#fff;border:0;border-radius:4px;padding:4px 8px;cursor:pointer;margin-top:6px}'
      + '.hb-session{bottom:12px;right:12px}.hb-quick{bottom:12px;left:12px}.hb-api{top:60px;right:12px;display:none;max-width:340px}'
      + '.hb-api textarea{width:100%;height:70px;color:#222;border-radius:4px;border:0;margin-top:4px;font-family:monospace}'
      + '.hb-min{float:right;cursor:pointer;color:#9fc0db}.hb-note{color:#9fc0db;font-size:11px;margin-top:4px}</style>'
      + '<div class="hb-panel hb-session"><h4>HomeBox Session <span class="hb-min" data-t="hb-session-b">_</span></h4><div id="hb-session-b">'
      + '<label>Timeout (min):<input type="number" id="hb-timeout" min="1" value="30"></label>'
      + '<label><input type="checkbox" id="hb-keepalive"> Keep alive (no logout this session)</label>'
      + '<div class="hb-note" id="hb-sess-note">timeout 30 min</div><button id="hb-api-toggle">Raw API editor</button></div></div>'
      + '<div class="hb-panel hb-quick"><h4>Quick jump <span class="hb-min" data-t="hb-quick-b">_</span></h4><div id="hb-quick-b"><select id="hb-jump"><option>— select a menu —</option></select></div></div>'
      + '<div class="hb-panel hb-api" id="hb-api"><h4>Raw API editor <span class="hb-min" data-t="hb-api-b">_</span></h4><div id="hb-api-b">'
      + '<label>XPath:<input type="text" id="hb-xpath" placeholder="Device/DNS/..."></label><button id="hb-read">Read</button>'
      + '<label>Value (JSON):<textarea id="hb-val"></textarea></label><button id="hb-write">Write</button>'
      + '<div class="hb-note">Reads/writes the XMO model via /cgi/json-req. Writes change device config.</div><div class="hb-note" id="hb-api-out"></div></div></div>';
    document.body.appendChild(wrap);
    wrap.querySelectorAll('.hb-min').forEach(function (m) { m.onclick = function () { var b = document.getElementById(m.getAttribute('data-t')); if (b) b.style.display = (b.style.display === 'none') ? '' : 'none'; }; });
    var tIn = wrap.querySelector('#hb-timeout'), kIn = wrap.querySelector('#hb-keepalive'), note = wrap.querySelector('#hb-sess-note');
    function syncSession() { var mins = parseInt(tIn.value, 10) || 30; applySession(mins, kIn.checked); note.textContent = kIn.checked ? "keepalive ON (won't log out)" : 'timeout ' + mins + ' min'; }
    tIn.onchange = syncSession; kIn.onchange = syncSession; syncSession();
    var jump = wrap.querySelector('#hb-jump'); buildJumpOptions(jump);
    jump.onchange = function () { var st = jump.value; if (!st || st.indexOf('user.') !== 0) return; var i = inj(); if (i) try { i.get('$state').go(st); } catch (e) {} };
    wrap.querySelector('#hb-api-toggle').onclick = function () { var p = document.getElementById('hb-api'); p.style.display = (p.style.display === 'none' || !p.style.display) ? 'block' : 'none'; };
    wrap.querySelector('#hb-read').onclick = apiRead; wrap.querySelector('#hb-write').onclick = apiWrite;
  }
  function buildJumpOptions(sel) {
    var i = inj(); if (!i || !sel) return; var states; try { states = i.get('$state').get(); } catch (e) { return; }
    states.filter(function (s) { return s.name && s.name.indexOf('user.') === 0; })
      .filter(function (s) { return !ABSENT_RE.test(s.name) && !ABSENT_LABEL_RE.test(s.name); })
      .map(function (s) { var label = s.name.replace(/^user\./, '').split('.').map(function (p) { return p.replace(/([A-Z])/g, ' $1').replace(/^./, function (c) { return c.toUpperCase(); }).trim(); }).join(' › '); return { name: s.name, label: label }; })
      .sort(function (a, b) { return a.label.localeCompare(b.label); })
      .forEach(function (it) { var o = document.createElement('option'); o.value = it.name; o.textContent = it.label; sel.appendChild(o); });
  }
  function apiCall(actions) {
    var body = { request: { id: 0, 'session-id': 0, priority: true, actions: actions, cnonce: 0, 'auth-key': 0 } };
    return fetch('/cgi/json-req', { method: 'POST', headers: { 'Content-Type': 'application/x-sagemcom-gui-json-req; charset=UTF-8' }, body: 'req=' + encodeURIComponent(JSON.stringify(body)) }).then(function (r) { return r.text(); });
  }
  function setOut(m) { var o = document.getElementById('hb-api-out'); if (o) o.textContent = m; }
  function apiRead() { var xp = document.getElementById('hb-xpath').value.trim(); if (!xp) return setOut('enter an xpath');
    try { var i = inj(), api = i && i.has('GuiApi') ? i.get('GuiApi') : null; if (api && api.getValue) { api.getValue(xp).then(function (v) { document.getElementById('hb-val').value = JSON.stringify(v, null, 2); setOut('read ok'); }, function (e) { setOut('read err: ' + e); }); return; } } catch (e) {}
    apiCall([{ id: 0, method: 'getValue', xpath: xp, options: {} }]).then(function (t) { document.getElementById('hb-val').value = t; setOut('read (raw)'); }).catch(function (e) { setOut('err ' + e); }); }
  function apiWrite() { var xp = document.getElementById('hb-xpath').value.trim(); if (!xp) return setOut('enter an xpath');
    var raw = document.getElementById('hb-val').value, val; try { val = JSON.parse(raw); } catch (e) { val = raw; }
    if (!confirm('Write to ' + xp + ' ?\nThis changes device config.')) return;
    try { var i = inj(), api = i && i.has('GuiApi') ? i.get('GuiApi') : null; if (api && api.setValue) { api.setValue(xp, val).then(function () { setOut('write ok'); }, function (e) { setOut('write err: ' + e); }); return; } } catch (e) {}
    apiCall([{ id: 0, method: 'setValue', xpath: xp, parameters: { value: val } }]).then(function (t) { setOut('write: ' + t.slice(0, 120)); }).catch(function (e) { setOut('err ' + e); }); }

  function applyAll() { patchGuard(); patchHideTable(); unlockAll(); killAppModal(); hideAbsentTiles(); injectStrippedSaves(); }

  function hookRouter() {
    var i = inj(); if (!i) return false; var rs; try { rs = i.get('$rootScope'); } catch (e) { return false; }
    if (rs.__hbHooked) return true;
    rs.$on('$viewContentLoaded', function () { setTimeout(applyAll, 60); });
    rs.$on('$stateChangeSuccess', function () { setTimeout(applyAll, 120); });
    rs.__hbHooked = true; return true;
  }

  function boot() {
    if (!window.angular || !inj()) return setTimeout(boot, 400);
    patchGuard(); patchHideTable(); hookRouter(); buildUI(); applyAll();
    var mo = new MutationObserver(function () { clearTimeout(window.__hbMo); window.__hbMo = setTimeout(function () { unlockAll(); killAppModal(); hideAbsentTiles(); injectStrippedSaves(); }, 150); });
    mo.observe(document.body, { childList: true, subtree: true });
  }
  boot();
})();
