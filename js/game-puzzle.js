'use strict';
/* ════════════════════════════════════════════════════════════════
   CODE BREAKER  —  a Mastermind-style logic-deduction puzzle
   ────────────────────────────────────────────────────────────────
   Guess the hidden 4-colour code (6 colours, repeats allowed) within
   10 tries. Feedback per guess: 🎯 = right colour & spot, ⚪ = right
   colour wrong spot. Cracking the code awards ✦ Enigma Shards — a
   shared currency spent on special upgrades in the other games. Fewer
   guesses → more shards.
   ════════════════════════════════════════════════════════════════ */
(function CodeBreaker() {
  const GAME_ID = 'puzzle';
  const SAVE_VERSION = 1;
  const COLORS = ['🔴', '🟠', '🟡', '🟢', '🔵', '🟣'];
  const PEGS = 4, MAX_GUESSES = 10;

  let S = null;             // persistent stats
  // transient board state
  let secret = [], rows = [], current = [], over = false, won = false;

  function defaultState() { return { plays: 0, wins: 0, best: 0, shardsEarned: 0, streak: 0, savedAt: Date.now() }; }

  function loadGame() {
    const save = SaveSystem.read(GAME_ID, SAVE_VERSION);
    S = save && save.data ? Object.assign(defaultState(), save.data) : defaultState();
  }
  function saveGame() { S.savedAt = Date.now(); SaveSystem.write(GAME_ID, SAVE_VERSION, S); }

  function newPuzzle() {
    secret = Array.from({ length: PEGS }, () => Math.floor(Math.random() * COLORS.length));
    rows = []; current = []; over = false; won = false;
    render();
  }

  function score(guess) {
    let exact = 0, partial = 0;
    const s = secret.slice(), g = guess.slice();
    for (let i = 0; i < PEGS; i++) if (g[i] === s[i]) { exact++; s[i] = -1; g[i] = -2; }
    for (let i = 0; i < PEGS; i++) { if (g[i] < 0) continue; const j = s.indexOf(g[i]); if (j >= 0) { partial++; s[j] = -1; } }
    return { exact, partial };
  }

  /* ── Input handlers ─────────────────────────────────────────── */
  window.CodeBreaker_pick = function(c) {
    if (over || current.length >= PEGS) return;
    current.push(c); Haptics.vibrate(12); render();
  };
  window.CodeBreaker_clear = function() { if (over) return; current.pop(); Haptics.vibrate(12); render(); };
  window.CodeBreaker_submit = function() {
    if (over || current.length !== PEGS) return;
    const guess = current.slice();
    const fb = score(guess);
    rows.push({ guess, exact: fb.exact, partial: fb.partial });
    current = [];
    if (fb.exact === PEGS) winGame();
    else if (rows.length >= MAX_GUESSES) loseGame();
    else { Haptics.vibrate(20); render(); }
  };
  window.CodeBreaker_new = function() { newPuzzle(); };

  function winGame() {
    over = true; won = true;
    const used = rows.length;
    const reward = Math.max(1, 11 - used);   // crack in fewer guesses → more shards
    Shards.add(reward);
    S.plays++; S.wins++; S.shardsEarned += reward; S.streak++;
    if (!S.best || used < S.best) S.best = used;
    saveGame();
    Haptics.vibrate([60, 40, 90]);
    Toast.show('✦', 'Code cracked!', `+${reward} Enigma Shards (in ${used} ${used === 1 ? 'guess' : 'guesses'})`, true);
    render();
  }
  function loseGame() {
    over = true; won = false;
    S.plays++; S.streak = 0; saveGame();
    Haptics.vibrate([100, 60, 100]);
    Toast.show('💥', 'Out of guesses', 'The code is revealed — try again!');
    render();
  }

  /* ── Render ─────────────────────────────────────────────────── */
  function pegRow(guess) { return guess.map(c => `<span class="cb-peg">${COLORS[c]}</span>`).join(''); }
  function feedback(r) {
    let h = '';
    for (let i = 0; i < r.exact; i++) h += '🎯';
    for (let i = 0; i < r.partial; i++) h += '⚪';
    for (let i = 0; i < PEGS - r.exact - r.partial; i++) h += '<span style="opacity:.25">·</span>';
    return h;
  }

  function render() {
    const el = document.getElementById('screen-puzzle');
    if (!el || !el.classList.contains('active')) return;
    const wrap = document.getElementById('cb-wrap');
    if (!wrap) return;
    let html = '';
    // Stats line
    html += `<div id="cb-stats">✦ <b class="text-accent">${Fmt.format(Shards.get())}</b> Shards · 🏆 ${S.wins}/${S.plays} · 🔥 ${S.streak}${S.best ? ' · best ' + S.best : ''}</div>`;
    html += `<div id="cb-sub">Guess the 4-colour code · 🎯 right spot · ⚪ right colour · ${MAX_GUESSES - rows.length} ${over ? '' : 'guesses left'}</div>`;

    // Past guesses
    html += '<div id="cb-board">';
    rows.forEach((r, i) => {
      html += `<div class="cb-row"><span class="cb-num">${i + 1}</span><div class="cb-pegs">${pegRow(r.guess)}</div><div class="cb-fb">${feedback(r)}</div></div>`;
    });
    // Current building row (if playing)
    if (!over) {
      let slots = '';
      for (let i = 0; i < PEGS; i++) slots += `<span class="cb-peg ${i < current.length ? '' : 'cb-empty'}">${i < current.length ? COLORS[current[i]] : '⬚'}</span>`;
      html += `<div class="cb-row cb-active"><span class="cb-num">${rows.length + 1}</span><div class="cb-pegs">${slots}</div><div class="cb-fb"></div></div>`;
    }
    html += '</div>';

    if (over) {
      html += `<div id="cb-result" class="${won ? 'win' : 'lose'}">
          ${won ? '✦ Code cracked!' : '💥 The code was:'} <span style="font-size:20px">${pegRow(secret)}</span>
        </div>
        <button class="btn btn-primary" style="width:100%" onclick="CodeBreaker_new()">🧩 New Code</button>`;
    } else {
      // Palette
      html += `<div id="cb-palette">${COLORS.map((c, i) => `<button class="cb-color" onclick="CodeBreaker_pick(${i})">${c}</button>`).join('')}</div>`;
      html += `<div id="cb-actions">
          <button class="btn" style="flex:1" onclick="CodeBreaker_clear()">⌫ Undo</button>
          <button class="btn btn-primary" style="flex:2;${current.length === PEGS ? '' : 'opacity:.5'}" onclick="CodeBreaker_submit()">✓ Guess</button>
        </div>`;
    }
    wrap.innerHTML = html;
  }

  window.CodeBreaker_help = function() {
    Modal.show({
      title: '🧩 How Code Breaker works',
      body: `
        <p>A hidden code of <b>4 colours</b> is chosen from <b>6</b> (colours can repeat). You have <b>${MAX_GUESSES} guesses</b>.</p>
        <p class="mt-8">Tap colours to build a guess, then <b>✓ Guess</b>. After each guess you get clues:</p>
        <p class="mt-8">🎯 = a peg is the <b>right colour in the right spot</b><br>⚪ = right colour, <b>wrong spot</b></p>
        <p class="mt-8">Use the clues to deduce the code. Crack it to earn <b class="text-accent">✦ Enigma Shards</b> — fewer guesses earn more. Spend Shards on special upgrades in <b>Cookie Clicker</b> and <b>Idle Realm</b>.</p>
      `,
      actions: [{ label: 'Got it', cls: 'btn-primary' }]
    });
  };

  function buildUI() {
    const el = document.getElementById('screen-puzzle');
    el.innerHTML = `
      <style>
        #cb-main { height:100%; overflow-y:auto; padding:14px; display:flex; flex-direction:column; gap:10px; max-width:480px; margin:0 auto; }
        #cb-stats { font-size:14px; }
        #cb-sub { font-size:12px; color:var(--text2); }
        #cb-board { display:flex; flex-direction:column; gap:6px; }
        .cb-row { display:flex; align-items:center; gap:10px; background:var(--bg2); border:1px solid var(--border); border-radius:var(--radius-sm); padding:6px 10px; }
        .cb-row.cb-active { border-color:var(--accent); }
        .cb-num { width:18px; font-size:12px; color:var(--text2); flex-shrink:0; }
        .cb-pegs { display:flex; gap:6px; flex:1; }
        .cb-peg { font-size:24px; line-height:1; }
        .cb-peg.cb-empty { opacity:0.4; }
        .cb-fb { font-size:13px; letter-spacing:1px; min-width:54px; text-align:right; }
        #cb-result { text-align:center; font-size:16px; font-weight:600; padding:10px; border-radius:var(--radius-sm); background:var(--bg2); border:1px solid var(--border); }
        #cb-result.win { border-color:var(--gold); color:var(--gold); }
        #cb-result.lose { border-color:var(--red); }
        #cb-palette { display:flex; gap:8px; justify-content:center; flex-wrap:wrap; }
        .cb-color { font-size:34px; line-height:1; padding:6px; border-radius:50%; background:var(--bg2); border:1px solid var(--border); }
        .cb-color:active { border-color:var(--accent); transform:scale(0.9); }
        #cb-actions { display:flex; gap:10px; }
      </style>
      <div id="cb-main"><div id="cb-wrap"></div></div>`;
  }

  Router.register('puzzle', {
    title: '🧩 Code Breaker',
    onHelp: () => CodeBreaker_help(),
    onEnter: () => { loadGame(); buildUI(); newPuzzle(); },
    onLeave: () => { saveGame(); }
  });
})(); // end CodeBreaker
