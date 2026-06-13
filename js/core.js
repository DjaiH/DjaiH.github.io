'use strict';
/* ════════════════════════════════════════════════════════════════
   ENGINE — Shared systems used by all game modules
   ════════════════════════════════════════════════════════════════ */

/* ── Number Formatter ─────────────────────────────────────────── */
const Fmt = (() => {
  const SUFFIXES = [
    '', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No',
    'Dc', 'UDc', 'DDc', 'TDc', 'QaDc', 'QiDc', 'SxDc', 'SpDc', 'OcDc', 'NoDc',
    'Vi', 'UVi'
  ];
  function format(n, decimals = 2) {
    if (n === undefined || n === null || isNaN(n)) return '0';
    if (n < 0) return '-' + format(-n, decimals);
    if (n < 1000) {
      const d = Math.min(decimals, 2);
      return n % 1 === 0 ? String(Math.floor(n)) : n.toFixed(d);
    }
    const tier = Math.floor(Math.log10(n) / 3);
    const capped = Math.min(tier, SUFFIXES.length - 1);
    const scaled = n / Math.pow(1000, capped);
    return scaled.toFixed(decimals) + (SUFFIXES[capped] || '???');
  }
  function time(secs) {
    secs = Math.floor(secs);
    if (secs < 60)  return secs + 's';
    if (secs < 3600) return Math.floor(secs/60) + 'm ' + (secs%60) + 's';
    const h = Math.floor(secs/3600), m = Math.floor((secs%3600)/60);
    return h + 'h ' + m + 'm';
  }
  return { format, time };
})();

/* ── Event Bus ────────────────────────────────────────────────── */
const EventBus = (() => {
  const listeners = {};
  function on(event, fn) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(fn);
  }
  function off(event, fn) {
    if (!listeners[event]) return;
    listeners[event] = listeners[event].filter(f => f !== fn);
  }
  function emit(event, data) {
    (listeners[event] || []).forEach(fn => fn(data));
  }
  return { on, off, emit };
})();

/* ── Settings (device-local preferences) ──────────────────────── */
const Settings = (() => {
  const DEFAULTS = { haptics: true, golden: true, offlineModal: true };
  let s = { ...DEFAULTS };
  try {
    const raw = localStorage.getItem('settings');
    if (raw) s = { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {}
  function save() { localStorage.setItem('settings', JSON.stringify(s)); }
  function get(k) { return s[k]; }
  function set(k, v) { s[k] = v; save(); EventBus.emit('settings', { key: k, value: v }); }
  return { get, set };
})();

/* ── Haptics (gated by the haptics setting) ───────────────────── */
const Haptics = {
  vibrate(pattern) {
    if (Settings.get('haptics') && navigator.vibrate) navigator.vibrate(pattern);
  }
};

/* ── Toast Notifications ──────────────────────────────────────── */
const Toast = (() => {
  const container = document.getElementById('toast-container');
  function show(icon, title, msg, isAchievement = false) {
    const el = document.createElement('div');
    el.className = 'toast' + (isAchievement ? ' achievement' : '');
    el.innerHTML = `<span class="toast-icon">${icon}</span>
      <div class="toast-body">
        <div class="toast-title">${title}</div>
        ${msg ? `<div class="toast-msg">${msg}</div>` : ''}
      </div>`;
    container.appendChild(el);
    Haptics.vibrate(isAchievement ? [50, 30, 80] : 40);
    setTimeout(() => el.remove(), 3200);
  }
  return { show };
})();

/* ── Modal ────────────────────────────────────────────────────── */
const Modal = (() => {
  const overlay = document.getElementById('modal-overlay');
  const titleEl = document.getElementById('modal-title');
  const bodyEl  = document.getElementById('modal-body');
  const actionsEl = document.getElementById('modal-actions');
  let openedAt = 0;
  function isOpen() { return overlay.classList.contains('open'); }
  function show({ title, body, actions = [] }) {
    titleEl.textContent = title;
    bodyEl.innerHTML = body;
    actionsEl.innerHTML = '';
    actions.forEach(a => {
      const btn = document.createElement('button');
      btn.className = 'btn ' + (a.cls || '');
      btn.textContent = a.label;
      btn.onclick = () => { a.fn && a.fn(); close(); };
      actionsEl.appendChild(btn);
    });
    overlay.classList.add('open');
    openedAt = Date.now();
  }
  function close() { overlay.classList.remove('open'); }
  // Backdrop tap closes the modal — but ignore the synthetic "ghost click"
  // that can fire ~300ms after the tap which opened the screen/modal,
  // otherwise a welcome-back popup can be dismissed before it's even seen.
  overlay.addEventListener('click', e => { if (e.target === overlay && Date.now() - openedAt > 400) close(); });
  return { show, close, isOpen };
})();

/* ── Floating Number Animation ────────────────────────────────── */
function floatNum(x, y, text, color = null) {
  const el = document.createElement('div');
  el.className = 'float-num';
  el.textContent = text;
  if (color) el.style.color = color;
  el.style.left = (x - 20) + 'px';
  el.style.top  = (y - 20) + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

/* ── Tick Engine ──────────────────────────────────────────────── */
const Ticker = (() => {
  let last = 0;
  let paused = false;
  const callbacks = [];

  function tick(now) {
    if (!paused) {
      const dt = Math.min((now - last) / 1000, 0.5); // cap dt at 500ms
      if (last > 0) callbacks.forEach(fn => fn(dt));
    }
    last = now;
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(ts => { last = ts; requestAnimationFrame(tick); });

  document.addEventListener('visibilitychange', () => {
    paused = document.hidden;
    if (!paused) last = 0; // reset so dt doesn't spike on resume
  });

  function add(fn) { callbacks.push(fn); }
  function remove(fn) {
    const i = callbacks.indexOf(fn);
    if (i >= 0) callbacks.splice(i, 1);
  }
  return { add, remove };
})();

/* ── HUD ──────────────────────────────────────────────────────── */
const HUD = (() => {
  const el    = document.getElementById('hud');
  const title = document.getElementById('hud-title');
  const save  = document.getElementById('hud-save');
  function show(t) { el.classList.remove('hidden'); title.textContent = t; }
  function hide()  { el.classList.add('hidden'); }
  function flashSave() {
    save.classList.add('flash');
    setTimeout(() => save.classList.remove('flash'), 800);
  }
  return { show, hide, flashSave };
})();
document.getElementById('hud-back').addEventListener('click', () => Router.go('menu'));
document.getElementById('hud-info').addEventListener('click', () => Router.showHelp());

/* ── Router ───────────────────────────────────────────────────── */
const Router = (() => {
  const screens = {};
  let current = null;
  const infoBtn = document.getElementById('hud-info');

  // onHelp: optional () => void invoked by the HUD ℹ️ info button for this screen
  function register(id, { onEnter, onLeave, title, onHelp } = {}) {
    screens[id] = { onEnter, onLeave, title, onHelp };
  }

  function showHelp() {
    const fn = screens[current]?.onHelp;
    if (fn) fn();
  }

  function go(id) {
    if (current && screens[current]?.onLeave) screens[current].onLeave();
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const screenEl = document.getElementById('screen-' + id);
    if (screenEl) screenEl.classList.add('active');
    current = id;

    if (id === 'menu') {
      HUD.hide();
      updateMenuMeta();
    } else {
      const t = screens[id]?.title || id;
      HUD.show(t);
    }
    // Show the HUD info button only on screens that registered help text
    if (infoBtn) infoBtn.classList.toggle('hidden', !screens[id]?.onHelp);
    if (screens[id]?.onEnter) screens[id].onEnter();
  }

  function updateMenuMeta() {
    const games = ['clicker', 'dungeon'];
    games.forEach(g => {
      const meta = document.getElementById('card-meta-' + g);
      if (!meta) return;
      const raw = localStorage.getItem('save_' + g);
      if (raw) {
        try {
          const save = JSON.parse(raw);
          const elapsed = Math.floor((Date.now() - (save.savedAt || 0)) / 60000);
          meta.textContent = elapsed < 2 ? 'Just played' :
                             elapsed < 60 ? elapsed + 'm ago' :
                             Math.floor(elapsed/60) + 'h ago';
        } catch { meta.textContent = 'Saved'; }
      } else {
        meta.textContent = 'New game';
      }
    });
  }

  // Register built-in screens
  register('menu',         { title: '' });
  register('save',         { title: '💾 Save & Load' });
  register('achievements', { title: '🏆 Achievements', onEnter: () => AchievementSystem.renderScreen() });
  register('settings',     { title: '⚙️ Settings', onEnter: () => SettingsScreen.render() });

  // Start on menu
  window.addEventListener('DOMContentLoaded', () => go('menu'));

  return { go, register, showHelp };
})();

/* ════════════════════════════════════════════════════════════════
   SAVE SYSTEM
   ════════════════════════════════════════════════════════════════ */
const SaveSystem = (() => {
  const GAMES = ['clicker', 'dungeon'];
  const MIGRATIONS = {}; // keyed by game id, value = { v1_to_v2: fn, ... }

  function registerMigrations(gameId, migrations) {
    MIGRATIONS[gameId] = migrations;
  }

  // Write save for a game
  function write(gameId, version, data) {
    const payload = { version, game: gameId, savedAt: Date.now(), data };
    localStorage.setItem('save_' + gameId, JSON.stringify(payload));
    HUD.flashSave();
  }

  // Read + migrate save for a game
  function read(gameId, currentVersion) {
    const raw = localStorage.getItem('save_' + gameId);
    if (!raw) return null;
    try {
      let save = JSON.parse(raw);
      // Run migrations
      const migs = MIGRATIONS[gameId] || {};
      while (save.version < currentVersion) {
        const key = 'v' + save.version + '_to_v' + (save.version + 1);
        if (migs[key]) {
          save.data = migs[key](save.data);
          save.version++;
        } else {
          // No migration function — keep unknown fields, just bump version
          save.version++;
        }
      }
      return save;
    } catch (e) {
      console.error('Save read error for', gameId, e);
      return null;
    }
  }

  // Export all games as a single base64 blob
  function exportAll() {
    const bundle = {};
    GAMES.forEach(g => {
      const raw = localStorage.getItem('save_' + g);
      if (raw) bundle[g] = raw;
    });
    const achieveRaw = localStorage.getItem('achievements');
    if (achieveRaw) bundle['_achievements'] = achieveRaw;

    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(bundle))));
    const area = document.getElementById('save-export-area');
    area.value = encoded;

    // Copy to clipboard
    navigator.clipboard?.writeText(encoded).then(() => {
      Toast.show('📋', 'Save Exported', 'Copied to clipboard!');
    }).catch(() => {
      Toast.show('📋', 'Save Exported', 'Select the text above and copy it manually.');
    });
    return encoded;
  }

  // Import from textarea
  function importAll() {
    const area = document.getElementById('save-import-area');
    const code = area.value.trim();
    if (!code) { Toast.show('⚠️', 'Nothing to import', 'Paste your save code first.'); return; }

    Modal.show({
      title: '⚠️ Import Save',
      body: 'This will overwrite your current saves. Continue?',
      actions: [
        { label: 'Cancel', cls: '' },
        { label: 'Import', cls: 'btn-primary', fn: () => {
          try {
            const decoded = decodeURIComponent(escape(atob(code)));
            const bundle  = JSON.parse(decoded);
            GAMES.forEach(g => {
              if (bundle[g]) localStorage.setItem('save_' + g, bundle[g]);
            });
            if (bundle['_achievements']) localStorage.setItem('achievements', bundle['_achievements']);
            Toast.show('✅', 'Import successful', 'Restart each game to load your save.');
            area.value = '';
          } catch (e) {
            Toast.show('❌', 'Import failed', 'Invalid save code.');
          }
        }}
      ]
    });
  }

  function deleteAll() {
    Modal.show({
      title: '🗑 Delete All Saves',
      body: 'This cannot be undone. All progress in all games will be lost forever.',
      actions: [
        { label: 'Cancel', cls: '' },
        { label: 'Delete Everything', cls: 'btn-danger', fn: () => {
          GAMES.forEach(g => localStorage.removeItem('save_' + g));
          localStorage.removeItem('achievements');
          Toast.show('🗑', 'All saves deleted', 'Fresh start!');
        }}
      ]
    });
  }

  // Delete a single game's save. Safe to call while not in that game —
  // the next time it's opened, loadGame() falls back to a fresh state.
  function deleteGame(gameId) {
    localStorage.removeItem('save_' + gameId);
  }

  return { write, read, registerMigrations, exportAll, importAll, deleteAll, deleteGame };
})();

/* ════════════════════════════════════════════════════════════════
   ACHIEVEMENT SYSTEM
   ════════════════════════════════════════════════════════════════ */
const AchievementSystem = (() => {
  let unlocked = new Set();
  const defs = [];

  function load() {
    try {
      const raw = localStorage.getItem('achievements');
      if (raw) unlocked = new Set(JSON.parse(raw));
    } catch {}
  }

  function save() {
    localStorage.setItem('achievements', JSON.stringify([...unlocked]));
  }

  function register(id, icon, name, desc, hint) {
    defs.push({ id, icon, name, desc, hint });
  }

  function unlock(id) {
    if (unlocked.has(id)) return;
    unlocked.add(id);
    save();
    const def = defs.find(d => d.id === id);
    if (def) Toast.show(def.icon, 'Achievement Unlocked!', def.name, true);
    EventBus.emit('achievement', id);
  }

  function isUnlocked(id) { return unlocked.has(id); }
  function count() { return unlocked.size; }

  function renderScreen() {
    const list = document.getElementById('achievements-list');
    if (!list) return;
    if (defs.length === 0) {
      list.innerHTML = '<div class="center text-muted mt-12">No achievements yet — play some games!</div>';
      return;
    }
    list.innerHTML = defs.map(d => {
      const done = unlocked.has(d.id);
      return `<div class="achievement-item ${done ? 'unlocked' : ''}">
        <span class="ach-icon">${d.icon}</span>
        <div>
          <div class="ach-name">${d.name}</div>
          <div class="ach-desc">${done ? d.desc : '???'}</div>
          ${!done && d.hint ? `<div class="ach-hint">${d.hint}</div>` : ''}
        </div>
      </div>`;
    }).join('');
  }

  load();
  return { register, unlock, isUnlocked, count, renderScreen };
})();

/* ════════════════════════════════════════════════════════════════
   SETTINGS SCREEN
   ════════════════════════════════════════════════════════════════ */
const SettingsScreen = (() => {
  const TOGGLES = [
    { group: 'Feedback' },
    { key: 'haptics',      name: 'Haptic feedback',      desc: 'Vibrate on taps, purchases and rewards (mobile only).' },
    { group: 'Gameplay' },
    { key: 'golden',       name: 'Golden cookies',       desc: 'Spawn golden cookies in Cookie Clicker for bonus rewards.' },
    { key: 'offlineModal', name: 'Welcome-back summary', desc: 'Show a popup with earnings when you return after being away.' },
  ];
  // Games that can be reset individually
  const GAMES = [
    { id: 'clicker', icon: '🍪', name: 'Cookie Clicker' },
    { id: 'dungeon', icon: '⚔️', name: 'Idle Realm' },
  ];
  function render() {
    const list = document.getElementById('settings-list');
    if (!list) return;
    let html = '';
    TOGGLES.forEach(t => {
      if (t.group) { html += `<div class="settings-group-title">${t.group}</div>`; return; }
      const on = Settings.get(t.key);
      html += `<div class="setting-row">
        <div class="setting-info">
          <div class="setting-name">${t.name}</div>
          <div class="setting-desc">${t.desc}</div>
        </div>
        <div class="toggle ${on ? 'on' : ''}" role="switch" aria-checked="${on}" onclick="SettingsScreen.toggle('${t.key}', this)"></div>
      </div>`;
    });
    // Per-game reset
    html += `<div class="settings-group-title">Reset Progress</div>`;
    GAMES.forEach(g => {
      const saved = !!localStorage.getItem('save_' + g.id);
      html += `<div class="setting-row">
        <div class="setting-info">
          <div class="setting-name">${g.icon} ${g.name}</div>
          <div class="setting-desc">${saved ? 'Wipe this game\'s progress for a fresh start.' : 'No saved progress yet.'}</div>
        </div>
        <button class="btn btn-danger setting-btn ${saved ? '' : 'disabled'}" ${saved ? `onclick="SettingsScreen.resetGame('${g.id}')"` : 'disabled'}>Reset</button>
      </div>`;
    });
    html += `<div class="setting-desc" style="padding:2px 4px">Resetting one game leaves your other games and unlocked achievements untouched. To wipe everything, use Save / Load → Delete All Saves.</div>`;
    html += `<div class="settings-group-title">About</div>
      <div class="setting-row"><div class="setting-info">
        <div class="setting-name">Mini Game Hub</div>
        <div class="setting-desc">Offline idle games. Progress saves automatically; use Save / Load to back it up.</div>
      </div></div>`;
    list.innerHTML = html;
  }
  function toggle(key, el) {
    const next = !Settings.get(key);
    Settings.set(key, next);
    el.classList.toggle('on', next);
    el.setAttribute('aria-checked', next);
    if (next) Haptics.vibrate(30);
  }
  function resetGame(id) {
    const g = GAMES.find(x => x.id === id);
    if (!g) return;
    Modal.show({
      title: `${g.icon} Reset ${g.name}?`,
      body: `This permanently deletes all your <strong>${g.name}</strong> progress. Your other games and achievements are not affected.<br><br>This cannot be undone.`,
      actions: [
        { label: 'Cancel', cls: '' },
        { label: 'Reset', cls: 'btn-danger', fn: () => {
          SaveSystem.deleteGame(id);
          Haptics.vibrate([60, 40, 80]);
          Toast.show(g.icon, `${g.name} reset`, 'Progress wiped — fresh start next time you open it.');
          render(); // refresh the disabled/enabled state
        }}
      ]
    });
  }
  return { render, toggle, resetGame };
})();
