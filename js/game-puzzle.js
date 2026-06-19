'use strict';
/* ════════════════════════════════════════════════════════════════
   ENIGMA PUZZLES  —  a hub of logic puzzles
   ────────────────────────────────────────────────────────────────
   A submenu lets you pick one of three classic logic puzzles:
     • 🟦 Nonogram   — deduce a hidden picture from row/column clues
     • 💡 Lights Out — toggle the grid until every light is off
     • 💣 Minesweeper — clear the field using the number clues
   Solving any of them awards ✦ Enigma Shards — a shared currency
   spent on special upgrades in Cookie Clicker and Idle Realm.
   ════════════════════════════════════════════════════════════════ */
(function PuzzleHub() {
  const GAME_ID = 'puzzle';
  const SAVE_VERSION = 2;

  let S = null;             // persistent per-puzzle stats
  let view = 'menu';        // 'menu' | 'nono' | 'lights' | 'mines'

  // Per-puzzle transient board state
  let nono = null, lights = null, mines = null;

  /* ── Save ───────────────────────────────────────────────────── */
  function defStats() { return { plays: 0, wins: 0, best: 0, streak: 0 }; }
  function defaultState() { return { nono: defStats(), lights: defStats(), mines: defStats(), savedAt: Date.now() }; }
  function loadGame() {
    const save = SaveSystem.read(GAME_ID, SAVE_VERSION);
    S = save && save.data ? Object.assign(defaultState(), save.data) : defaultState();
    S.nono = Object.assign(defStats(), S.nono);
    S.lights = Object.assign(defStats(), S.lights);
    S.mines = Object.assign(defStats(), S.mines);
  }
  function saveGame() { S.savedAt = Date.now(); SaveSystem.write(GAME_ID, SAVE_VERSION, S); }

  function setTitle(t) { const el = document.getElementById('hud-title'); if (el) el.textContent = t; }
  const META = {
    menu:   { title: '🧩 Enigma Puzzles' },
    nono:   { title: '🟦 Nonogram' },
    lights: { title: '💡 Lights Out' },
    mines:  { title: '💣 Minesweeper' },
  };

  // Award shards for a win and bump that puzzle's stats. bestVal optional
  // (bestIsLow = true → lower is better, e.g. moves/seconds).
  function win(key, reward, bestVal, bestIsLow) {
    const st = S[key];
    st.plays++; st.wins++; st.streak++;
    if (typeof bestVal === 'number') {
      if (!st.best) st.best = bestVal;
      else st.best = bestIsLow ? Math.min(st.best, bestVal) : Math.max(st.best, bestVal);
    }
    Shards.add(reward);
    saveGame();
    Haptics.vibrate([60, 40, 90]);
    Toast.show('✦', 'Solved!', `+${reward} Enigma Shards`, true);
  }
  function lose(key) {
    const st = S[key];
    st.plays++; st.streak = 0; saveGame();
  }

  /* ════════════════════════════════════════════════════════════
     NONOGRAM (Picross) — 5×5
     ════════════════════════════════════════════════════════════ */
  const NN = 5;
  const NONO_REWARD = 5;
  function runs(line) { // lengths of consecutive filled cells
    const out = []; let c = 0;
    line.forEach(v => { if (v) c++; else if (c) { out.push(c); c = 0; } });
    if (c) out.push(c);
    return out.length ? out : [0];
  }
  function nonoNew() {
    let sol;
    do { sol = Array.from({ length: NN * NN }, () => (Math.random() < 0.55 ? 1 : 0)); }
    while (sol.every(v => !v) || sol.every(v => v)); // avoid all-empty / all-full
    const rowClues = [], colClues = [];
    for (let r = 0; r < NN; r++) rowClues.push(runs(sol.slice(r * NN, r * NN + NN)));
    for (let c = 0; c < NN; c++) { const col = []; for (let r = 0; r < NN; r++) col.push(sol[r * NN + c]); colClues.push(runs(col)); }
    nono = { sol, cells: new Array(NN * NN).fill(0), rowClues, colClues, mode: 'fill', over: false };
    render();
  }
  function nonoCheck() {
    for (let i = 0; i < NN * NN; i++) if ((nono.cells[i] === 1) !== (nono.sol[i] === 1)) return false;
    return true;
  }
  window.Puzzle_nonoMode = function(m) { if (nono) { nono.mode = m; render(); } };
  window.Puzzle_nonoTap = function(i) {
    if (!nono || nono.over) return;
    const cur = nono.cells[i];
    if (nono.mode === 'fill') nono.cells[i] = cur === 1 ? 0 : 1;
    else nono.cells[i] = cur === 2 ? 0 : 2;
    Haptics.vibrate(10);
    if (nonoCheck()) { nono.over = true; win('nono', NONO_REWARD); }
    render();
  };
  window.Puzzle_nonoNew = function() { nonoNew(); };
  function renderNono() {
    const st = S.nono;
    let h = statsLine(st, 'best ' + (st.best ? st.best + 's' : '—'));
    h += `<div class="pz-sub">Fill the cells that match the row &amp; column clues. ✦ ${NONO_REWARD} Shards per solve.</div>`;
    h += `<div class="pz-modes">
        <button class="pz-mode ${nono.mode === 'fill' ? 'on' : ''}" onclick="Puzzle_nonoMode('fill')">⬛ Fill</button>
        <button class="pz-mode ${nono.mode === 'mark' ? 'on' : ''}" onclick="Puzzle_nonoMode('mark')">✕ Mark</button>
      </div>`;
    h += `<div class="nono-grid" style="grid-template-columns:auto repeat(${NN},1fr)">`;
    h += `<div class="nono-corner"></div>`;
    for (let c = 0; c < NN; c++) h += `<div class="nono-cc">${nono.colClues[c].join('<br>')}</div>`;
    for (let r = 0; r < NN; r++) {
      h += `<div class="nono-rc">${nono.rowClues[r].join(' ')}</div>`;
      for (let c = 0; c < NN; c++) {
        const i = r * NN + c, v = nono.cells[i];
        h += `<div class="nono-cell ${v === 1 ? 'fill' : ''}" onclick="Puzzle_nonoTap(${i})">${v === 2 ? '✕' : ''}</div>`;
      }
    }
    h += `</div>`;
    if (nono.over) h += `<div class="pz-result win">✦ Solved!</div>`;
    h += `<button class="btn ${nono.over ? 'btn-primary' : ''}" style="width:100%" onclick="Puzzle_nonoNew()">🔄 New Puzzle</button>`;
    return h;
  }

  /* ════════════════════════════════════════════════════════════
     LIGHTS OUT — 5×5, scrambled from solved (always solvable)
     ════════════════════════════════════════════════════════════ */
  const LN = 5;
  const LIGHTS_REWARD = 4;
  function lightsToggle(grid, i) {
    const r = Math.floor(i / LN), c = i % LN;
    const flip = j => { grid[j] = !grid[j]; };
    flip(i);
    if (r > 0) flip(i - LN);
    if (r < LN - 1) flip(i + LN);
    if (c > 0) flip(i - 1);
    if (c < LN - 1) flip(i + 1);
  }
  function lightsNew() {
    let grid;
    do {
      grid = new Array(LN * LN).fill(false);
      const presses = 6 + Math.floor(Math.random() * 6);
      for (let k = 0; k < presses; k++) lightsToggle(grid, Math.floor(Math.random() * LN * LN));
    } while (grid.every(v => !v)); // never start already solved
    lights = { grid, moves: 0, over: false };
    render();
  }
  window.Puzzle_lightTap = function(i) {
    if (!lights || lights.over) return;
    lightsToggle(lights.grid, i); lights.moves++;
    Haptics.vibrate(10);
    if (lights.grid.every(v => !v)) { lights.over = true; win('lights', LIGHTS_REWARD, lights.moves, true); }
    render();
  };
  window.Puzzle_lightNew = function() { lightsNew(); };
  function renderLights() {
    const st = S.lights;
    let h = statsLine(st, 'best ' + (st.best ? st.best + ' moves' : '—'));
    h += `<div class="pz-sub">Tap a light to flip it and its neighbours. Turn them all <b>off</b>. ✦ ${LIGHTS_REWARD} Shards per solve.</div>`;
    h += `<div class="pz-count">Moves: <b>${lights.moves}</b></div>`;
    h += `<div class="lights-grid" style="grid-template-columns:repeat(${LN},1fr)">`;
    for (let i = 0; i < LN * LN; i++) h += `<div class="light ${lights.grid[i] ? 'on' : ''}" onclick="Puzzle_lightTap(${i})"></div>`;
    h += `</div>`;
    if (lights.over) h += `<div class="pz-result win">✦ All lights off in ${lights.moves} moves!</div>`;
    h += `<button class="btn ${lights.over ? 'btn-primary' : ''}" style="width:100%" onclick="Puzzle_lightNew()">🔄 New Puzzle</button>`;
    return h;
  }

  /* ════════════════════════════════════════════════════════════
     MINESWEEPER — 9×9, 10 mines, first tap always safe
     ════════════════════════════════════════════════════════════ */
  const MW = 9, MH = 9, MMINES = 10;
  const MINES_REWARD = 6;
  function minesNew() {
    mines = { mine: new Array(MW * MH).fill(false), adj: new Array(MW * MH).fill(0),
      revealed: new Array(MW * MH).fill(false), flag: new Array(MW * MH).fill(false),
      over: false, won: false, started: false, flagMode: false, startAt: 0 };
    render();
  }
  function mineNeighbors(i) {
    const r = Math.floor(i / MW), c = i % MW, out = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < MH && nc >= 0 && nc < MW) out.push(nr * MW + nc);
    }
    return out;
  }
  function minesPlace(safe) {
    const banned = new Set([safe, ...mineNeighbors(safe)]);
    let placed = 0;
    while (placed < MMINES) {
      const i = Math.floor(Math.random() * MW * MH);
      if (mines.mine[i] || banned.has(i)) continue;
      mines.mine[i] = true; placed++;
    }
    for (let i = 0; i < MW * MH; i++) mines.adj[i] = mineNeighbors(i).filter(j => mines.mine[j]).length;
    mines.started = true; mines.startAt = Date.now();
  }
  function mineFlood(i) {
    const stack = [i];
    while (stack.length) {
      const j = stack.pop();
      if (mines.revealed[j] || mines.flag[j]) continue;
      mines.revealed[j] = true;
      if (mines.adj[j] === 0 && !mines.mine[j]) mineNeighbors(j).forEach(n => { if (!mines.revealed[n]) stack.push(n); });
    }
  }
  function minesWon() {
    for (let i = 0; i < MW * MH; i++) if (!mines.mine[i] && !mines.revealed[i]) return false;
    return true;
  }
  window.Puzzle_mineFlagMode = function() { if (mines) { mines.flagMode = !mines.flagMode; render(); } };
  window.Puzzle_mineTap = function(i) {
    if (!mines || mines.over) return;
    if (!mines.started) minesPlace(i);
    if (mines.flagMode) {
      if (!mines.revealed[i]) mines.flag[i] = !mines.flag[i];
      Haptics.vibrate(10); render(); return;
    }
    if (mines.flag[i] || mines.revealed[i]) return;
    if (mines.mine[i]) {
      mines.over = true; mines.won = false;
      for (let k = 0; k < MW * MH; k++) if (mines.mine[k]) mines.revealed[k] = true;
      lose('mines'); Haptics.vibrate([100, 60, 100]); render(); return;
    }
    mineFlood(i); Haptics.vibrate(10);
    if (minesWon()) {
      mines.over = true; mines.won = true;
      const secs = Math.max(1, Math.round((Date.now() - mines.startAt) / 1000));
      win('mines', MINES_REWARD, secs, true);
    }
    render();
  };
  window.Puzzle_mineNew = function() { minesNew(); };
  function renderMines() {
    const st = S.mines;
    let h = statsLine(st, 'best ' + (st.best ? st.best + 's' : '—'));
    const flagsUsed = mines.flag.filter(Boolean).length;
    h += `<div class="pz-sub">Reveal every safe cell; numbers count adjacent 💣. ✦ ${MINES_REWARD} Shards per solve.</div>`;
    h += `<div class="pz-modes">
        <button class="pz-mode ${mines.flagMode ? '' : 'on'}" onclick="${mines.flagMode ? 'Puzzle_mineFlagMode()' : ''}">⛏️ Dig</button>
        <button class="pz-mode ${mines.flagMode ? 'on' : ''}" onclick="${mines.flagMode ? '' : 'Puzzle_mineFlagMode()'}">🚩 Flag</button>
        <span class="pz-count" style="margin-left:auto">💣 ${MMINES - flagsUsed}</span>
      </div>`;
    h += `<div class="mines-grid" style="grid-template-columns:repeat(${MW},1fr)">`;
    const numColor = ['', '#4da6ff', '#37b24d', '#f03e3e', '#7048e8', '#d9480f', '#0c8599', '#495057', '#868e96'];
    for (let i = 0; i < MW * MH; i++) {
      if (mines.revealed[i]) {
        if (mines.mine[i]) h += `<div class="mine-cell open ${mines.over && !mines.won ? 'boom' : ''}">💣</div>`;
        else { const n = mines.adj[i]; h += `<div class="mine-cell open">${n ? `<span style="color:${numColor[n]}">${n}</span>` : ''}</div>`; }
      } else {
        h += `<div class="mine-cell" onclick="Puzzle_mineTap(${i})">${mines.flag[i] ? '🚩' : ''}</div>`;
      }
    }
    h += `</div>`;
    if (mines.over) h += `<div class="pz-result ${mines.won ? 'win' : 'lose'}">${mines.won ? '✦ Field cleared!' : '💥 Boom! Try again.'}</div>`;
    h += `<button class="btn ${mines.over ? 'btn-primary' : ''}" style="width:100%" onclick="Puzzle_mineNew()">🔄 New Field</button>`;
    return h;
  }

  /* ── Shared bits ────────────────────────────────────────────── */
  function statsLine(st, extra) {
    return `<div class="pz-stats">✦ <b class="text-accent">${Fmt.format(Shards.get())}</b> Shards · 🏆 ${st.wins}/${st.plays} · 🔥 ${st.streak}${extra ? ' · ' + extra : ''}</div>`;
  }

  window.Puzzle_open = function(v) { view = v; if (v === 'nono') nonoNew(); else if (v === 'lights') lightsNew(); else if (v === 'mines') minesNew(); render(); };
  window.Puzzle_menu = function() { view = 'menu'; render(); };

  function renderMenu() {
    const cards = [
      ['nono', '🟦', 'Nonogram', 'Deduce a hidden picture from the row &amp; column number clues.', S.nono, NONO_REWARD],
      ['lights', '💡', 'Lights Out', 'Flip lights and their neighbours until the whole grid is off.', S.lights, LIGHTS_REWARD],
      ['mines', '💣', 'Minesweeper', 'Clear the field using the numbers; flag the hidden mines.', S.mines, MINES_REWARD],
    ];
    let h = `<div class="pz-stats">✦ <b class="text-accent">${Fmt.format(Shards.get())}</b> Enigma Shards — spend them in Cookie Clicker &amp; Idle Realm</div>`;
    h += `<div class="pz-sub">Pick a logic puzzle. Every solve earns ✦ Shards.</div>`;
    cards.forEach(([id, icon, name, desc, st, rew]) => {
      h += `<button class="pz-pick" onclick="Puzzle_open('${id}')">
          <span class="pz-pick-icon">${icon}</span>
          <span class="pz-pick-info">
            <span class="pz-pick-name">${name} <span class="text-accent" style="font-size:12px">✦ ${rew}</span></span>
            <span class="pz-pick-desc">${desc}</span>
            <span class="pz-pick-meta">🏆 ${st.wins}/${st.plays} solved${st.streak ? ` · 🔥 ${st.streak}` : ''}</span>
          </span>
          <span class="pz-pick-arrow">›</span>
        </button>`;
    });
    return h;
  }

  function render() {
    const el = document.getElementById('screen-puzzle');
    if (!el || !el.classList.contains('active')) return;
    const wrap = document.getElementById('pz-wrap');
    if (!wrap) return;
    setTitle(META[view].title);
    let h = '';
    if (view !== 'menu') h += `<button class="pz-back" onclick="Puzzle_menu()">← All puzzles</button>`;
    if (view === 'menu') h += renderMenu();
    else if (view === 'nono') h += renderNono();
    else if (view === 'lights') h += renderLights();
    else if (view === 'mines') h += renderMines();
    wrap.innerHTML = h;
  }

  /* ── Help ───────────────────────────────────────────────────── */
  const HELP = {
    menu: `<p>Three classic <b>logic puzzles</b>. Solving any one awards <b class="text-accent">✦ Enigma Shards</b> — a shared currency you spend on special upgrades in <b>Cookie Clicker</b> and <b>Idle Realm</b>.</p>
           <p class="mt-8">Tap a puzzle to play. Each has a <b>🔄 New</b> button for a fresh board.</p>`,
    nono: `<p><b>Nonogram.</b> The numbers beside each row and above each column give the lengths of the filled runs, in order. Deduce which cells are filled.</p>
           <p class="mt-8">Use <b>⬛ Fill</b> to mark filled cells and <b>✕ Mark</b> to note cells you've ruled out (marks don't affect solving). Match the picture exactly to win.</p>`,
    lights: `<p><b>Lights Out.</b> Tapping a light toggles it <em>and</em> its up/down/left/right neighbours. Turn <b>every</b> light off to win — in as few moves as you can.</p>`,
    mines: `<p><b>Minesweeper.</b> Reveal cells with <b>⛏️ Dig</b>. A number shows how many of the 8 surrounding cells hold a 💣. Switch to <b>🚩 Flag</b> mode to mark suspected mines.</p>
            <p class="mt-8">Your first dig is always safe. Reveal every non-mine cell to win; tap a mine and it's game over.</p>`,
  };
  window.Puzzle_help = function() {
    Modal.show({ title: META[view].title + ' — how to play', body: HELP[view] || HELP.menu, actions: [{ label: 'Got it', cls: 'btn-primary' }] });
  };

  /* ── UI shell ───────────────────────────────────────────────── */
  function buildUI() {
    const el = document.getElementById('screen-puzzle');
    el.innerHTML = `
      <style>
        #pz-main { height:100%; overflow-y:auto; padding:14px; display:flex; flex-direction:column; gap:12px; max-width:520px; margin:0 auto; }
        #pz-wrap { display:flex; flex-direction:column; gap:12px; }
        .pz-stats { font-size:14px; }
        .pz-sub { font-size:12px; color:var(--text2); }
        .pz-count { font-size:13px; color:var(--text2); }
        .pz-back { align-self:flex-start; background:var(--bg2); border:1px solid var(--border); border-radius:var(--radius-sm); color:var(--text); padding:6px 12px; font-size:13px; }
        .pz-result { text-align:center; font-size:16px; font-weight:600; padding:10px; border-radius:var(--radius-sm); background:var(--bg2); border:1px solid var(--border); }
        .pz-result.win { border-color:var(--gold); color:var(--gold); }
        .pz-result.lose { border-color:var(--red); color:var(--red); }
        /* submenu cards */
        .pz-pick { display:flex; align-items:center; gap:12px; width:100%; text-align:left; background:var(--bg2); border:1px solid var(--border); border-radius:var(--radius); padding:12px; }
        .pz-pick:active { border-color:var(--accent); }
        .pz-pick-icon { font-size:30px; flex-shrink:0; }
        .pz-pick-info { display:flex; flex-direction:column; gap:3px; flex:1; min-width:0; }
        .pz-pick-name { font-size:16px; font-weight:600; }
        .pz-pick-desc { font-size:12px; color:var(--text2); }
        .pz-pick-meta { font-size:11px; color:var(--text2); }
        .pz-pick-arrow { font-size:22px; color:var(--text2); flex-shrink:0; }
        /* mode toggles */
        .pz-modes { display:flex; gap:8px; align-items:center; }
        .pz-mode { background:var(--bg2); border:1px solid var(--border); border-radius:var(--radius-sm); color:var(--text); padding:6px 12px; font-size:13px; }
        .pz-mode.on { border-color:var(--accent); color:var(--accent); }
        /* nonogram */
        .nono-grid { display:grid; gap:3px; align-self:center; }
        .nono-cc { font-size:12px; line-height:1.1; text-align:center; color:var(--text2); align-self:end; padding-bottom:2px; }
        .nono-rc { font-size:13px; text-align:right; color:var(--text2); align-self:center; padding-right:4px; white-space:nowrap; }
        .nono-cell { width:42px; height:42px; background:var(--bg2); border:1px solid var(--border); border-radius:4px; display:flex; align-items:center; justify-content:center; font-size:16px; color:var(--text2); }
        .nono-cell.fill { background:var(--accent); border-color:var(--accent); }
        /* lights out */
        .lights-grid { display:grid; gap:6px; align-self:center; }
        .light { width:48px; height:48px; border-radius:8px; background:var(--bg2); border:1px solid var(--border); }
        .light.on { background:var(--gold); border-color:var(--gold); box-shadow:0 0 8px var(--gold); }
        /* minesweeper */
        .mines-grid { display:grid; gap:2px; align-self:center; }
        .mine-cell { width:32px; height:32px; display:flex; align-items:center; justify-content:center; font-size:15px; font-weight:700; background:var(--accent); border:1px solid var(--border); border-radius:3px; color:#fff; }
        .mine-cell.open { background:var(--bg2); color:var(--text); }
        .mine-cell.open.boom { background:var(--red); }
      </style>
      <div id="pz-main"><div id="pz-wrap"></div></div>`;
  }

  Router.register('puzzle', {
    title: '🧩 Enigma Puzzles',
    onHelp: () => Puzzle_help(),
    onEnter: () => { loadGame(); buildUI(); view = 'menu'; render(); },
    onLeave: () => { saveGame(); },
  });
})(); // end PuzzleHub
