'use strict';
/* ════════════════════════════════════════════════════════════════
   COOKIE CLICKER GAME
   ════════════════════════════════════════════════════════════════ */
(function ClickerGame() {
  const GAME_ID      = 'clicker';
  const SAVE_VERSION = 1;
  const AUTOSAVE_MS  = 30000;
  const OFFLINE_CAP  = 24 * 3600; // 24 hours in seconds

  /* ── Building definitions ──────────────────────────────────── */
  const BUILDINGS = [
    { id:'cursor',  name:'Cursor',   icon:'👆', baseCps:0.1,  baseCost:15,       desc:'Tiny helper tapping for you.' },
    { id:'grandma', name:'Grandma',  icon:'👵', baseCps:0.5,  baseCost:100,      desc:'A nice grandma baking cookies.' },
    { id:'farm',    name:'Farm',     icon:'🌾', baseCps:4,    baseCost:1100,     desc:'Grows cookie plants.' },
    { id:'mine',    name:'Mine',     icon:'⛏️', baseCps:10,   baseCost:12000,    desc:'Cookie ore veins.' },
    { id:'factory', name:'Factory',  icon:'🏭', baseCps:40,   baseCost:130000,   desc:'Churns out cookies.' },
    { id:'bank',    name:'Bank',     icon:'🏦', baseCps:100,  baseCost:1400000,  desc:'Cookie interest rates.' },
    { id:'temple',  name:'Temple',   icon:'🛕', baseCps:400,  baseCost:20000000, desc:'Cookie gods are pleased.' },
    { id:'wizard',  name:'Wizard Tower',icon:'🧙',baseCps:6666,baseCost:330000000,desc:'Cookies from thin air.' },
  ];

  /* Building upgrades: [tier1_at, tier2_at, tier3_at] owned thresholds */
  const BUILDING_UPGRADES = {
    cursor:  [
      { at:1,  mul:2,   name:'Better Fingers',   cost:100 },
      { at:10, mul:3,   name:'Carpal Tunnel Cure',cost:5000 },
      { at:50, mul:5,   name:'Ambidextrous',       cost:500000 },
    ],
    grandma: [
      { at:1,  mul:2,   name:'Forwards from Grandma', cost:1000 },
      { at:10, mul:3,   name:'Retirement Home',        cost:50000 },
      { at:50, mul:5,   name:'Elder Pact',             cost:5000000 },
    ],
    farm: [
      { at:1,  mul:2,   name:'Fertilizer',   cost:11000 },
      { at:10, mul:3,   name:'Cookie Seeds',  cost:550000 },
      { at:50, mul:5,   name:'GMO Cookies',   cost:55000000 },
    ],
    mine: [
      { at:1,  mul:2,   name:'Sugar Gas',     cost:120000 },
      { at:10, mul:3,   name:'Megadrill',      cost:6000000 },
      { at:50, mul:5,   name:'Ultradrill',     cost:600000000 },
    ],
    factory: [
      { at:1,  mul:2,   name:'Sturdier Conveyor', cost:1300000 },
      { at:10, mul:3,   name:'Child Labour',       cost:65000000 },
      { at:50, mul:5,   name:'Sweatshop',          cost:6500000000 },
    ],
    bank: [
      { at:1,  mul:2,   name:'Taller Tellers',     cost:14000000 },
      { at:10, mul:3,   name:'Autofill',            cost:700000000 },
      { at:50, mul:5,   name:'Cookie Stock Market', cost:70000000000 },
    ],
    temple: [
      { at:1,  mul:2,   name:'Golden Idols',        cost:200000000 },
      { at:10, mul:3,   name:'Sacrifices',           cost:10000000000 },
      { at:50, mul:5,   name:'Delicious Lifeblood',  cost:1000000000000 },
    ],
    wizard: [
      { at:1,  mul:2,   name:'Pointier Hat',         cost:3300000000 },
      { at:10, mul:3,   name:'Beardlier Beard',       cost:165000000000 },
      { at:50, mul:5,   name:'Ancient Grimoire',      cost:16500000000000 },
    ],
  };

  /* Click upgrades */
  const CLICK_UPGRADES = [
    { id:'cu1', name:'Reinforced Index Finger', cost:100,          mul:2,  req: s => s.totalClicks >= 15 },
    { id:'cu2', name:'Carpal Tunnel Prevention', cost:500,         mul:2,  req: s => s.totalClicks >= 100 },
    { id:'cu3', name:'Ambidextrous',             cost:10000,       mul:3,  req: s => s.totalClicks >= 1000 },
    { id:'cu4', name:'Three Finger Click',       cost:100000,      mul:2,  req: s => s.buildings.cursor >= 10 },
    { id:'cu5', name:'Biscuit Barrel',           cost:1000000,     mul:5,  req: s => s.buildings.cursor >= 25 },
    { id:'cu6', name:'Thousandth Finger',        cost:10000000,    mul:10, req: s => s.buildings.cursor >= 50 },
  ];

  /* ── GATED LAYERS: unlock thresholds (all-time baked) ──────── */
  const UNLOCK_SUGAR    = 1e6;   // 1M  → Sugar Lumps
  const UNLOCK_TECH     = 5e7;   // 50M → Research lab
  const UNLOCK_SYNERGY  = 1e9;   // 1B  → Synergies
  const SUGAR_INTERVAL  = 600;   // seconds to grow one sugar lump

  /* ── Research / Tech tree (cookie-cost, prereq-gated) ──────── */
  const TECH = [
    { id:'t_root', name:'Cookie Science',     icon:'🔬', cost:2e7,  req:[],         branch:'Core',       desc:'×1.05 all production',                      effect:{ allMul:1.05 } },
    // Production branch
    { id:'t_p1',   name:'Assembly Lines',      icon:'🏭', cost:1e8,  req:['t_root'], branch:'Production', desc:'×1.10 all production',                      effect:{ allMul:1.10 } },
    { id:'t_p2',   name:'Quantum Baking',      icon:'⚛️', cost:5e9,  req:['t_p1'],   branch:'Production', desc:'×1.15 all production',                      effect:{ allMul:1.15 } },
    { id:'t_p3',   name:'Temporal Ovens',      icon:'⏳', cost:2e11, req:['t_p2'],   branch:'Production', desc:'×1.25 all production',                      effect:{ allMul:1.25 } },
    // Click branch
    { id:'t_c1',   name:'Ergonomic Mouse',     icon:'🖱️', cost:5e7,  req:['t_root'], branch:'Clicking',   desc:'×3 click power',                            effect:{ clickMul:3 } },
    { id:'t_c2',   name:'Click Resonance',     icon:'📳', cost:1e10, req:['t_c1'],   branch:'Clicking',   desc:'Each click also gains +1% of CpS',          effect:{ clickCps:0.01 } },
    { id:'t_c3',   name:'Finger Singularity',  icon:'☄️', cost:5e11, req:['t_c2'],   branch:'Clicking',   desc:'×5 click power & +5% of CpS per click',     effect:{ clickMul:5, clickCps:0.05 } },
    // Fortune branch
    { id:'t_f1',   name:'Lucky Day',           icon:'🍀', cost:2e8,  req:['t_root'], branch:'Fortune',    desc:'Golden cookies appear 2× more often',       effect:{ goldenFreq:0.5 } },
    { id:'t_f2',   name:'Get Lucky',           icon:'🎰', cost:2e10, req:['t_f1'],   branch:'Fortune',    desc:'Golden cookie rewards ×2',                  effect:{ goldenMul:2 } },
    { id:'t_f3',   name:'Cosmic Bakery',       icon:'🌌', cost:1e12, req:['t_f2'],   branch:'Fortune',    desc:'Offline ×2 & +1% CpS per achievement (milk)',effect:{ offlineMul:2, milk:0.01 } },
  ];

  /* ── Synergies: two buildings boost each other ─────────────── */
  const SYNERGIES = [
    { id:'sy1', a:'grandma', b:'farm',    name:'Cookie Cultivation', icon:'👵', cost:1e9,  desc:'Grandmas & Farms each boost the other (+0.05% per partner owned)' },
    { id:'sy2', a:'mine',    b:'factory', name:'Industrial Supply',  icon:'⛏️', cost:5e10, desc:'Mines & Factories each boost the other' },
    { id:'sy3', a:'bank',    b:'temple',  name:'Holy Economy',       icon:'🏦', cost:1e12, desc:'Banks & Temples each boost the other' },
    { id:'sy4', a:'cursor',  b:'wizard',  name:'Arcane Automation',  icon:'🧙', cost:5e12, desc:'Cursors & Wizard Towers each boost the other' },
  ];

  /* ── State ─────────────────────────────────────────────────── */
  let S = null; // loaded state
  let tickFn = null;
  let autosaveTimer = null;
  let ckHiddenAt = 0; // timestamp the screen was hidden (for away catch-up)
  let goldenCookieTimer = null;
  let goldenDespawnTimer = null;
  let goldenActive = false;

  function defaultState() {
    return {
      cookies:        0,
      totalBaked:     0,
      totalClicks:    0,
      enigma:         0, // ✦ Enigma Catalyst level (shard-bought CpS multiplier)
      cpc:            1, // cookies per click (base)
      buildings:      Object.fromEntries(BUILDINGS.map(b => [b.id, 0])),
      buildingUpgrades: {}, // id -> [false, false, false]
      clickUpgrades:  {}, // id -> true
      prestige:       0,
      heavenlyChips:  0,
      allTimeBaked:   0,  // persists across prestiges
      // ── Gated layers (persist across prestige) ──
      sugar:          0,   // sugar lumps
      sugarTime:      0,   // accumulator toward next lump
      buildingLevels: {},  // id -> sugar-lump level
      tech:           {},  // techId -> true
      synergies:      {},  // synergyId -> true
      savedAt:        Date.now(),
    };
  }

  /* ── Math helpers ──────────────────────────────────────────── */
  function buildingCost(id, owned) {
    const b = BUILDINGS.find(b => b.id === id);
    return Math.floor(b.baseCost * Math.pow(1.15, owned));
  }
  // Total cost to buy n buildings from current owned count (geometric sum)
  function buildingCostBulk(id, owned, n) {
    const b = BUILDINGS.find(b => b.id === id);
    return Math.floor(b.baseCost * Math.pow(1.15, owned) * (Math.pow(1.15, n) - 1) / 0.15);
  }
  // Max buildings affordable with given cookies
  function buildingMaxAffordable(id, owned, cookies) {
    const b = BUILDINGS.find(b => b.id === id);
    const base = b.baseCost * Math.pow(1.15, owned);
    if (cookies < base) return 0;
    return Math.max(0, Math.floor(Math.log(1 + cookies * 0.15 / base) / Math.log(1.15)));
  }
  // Per-building raw CpS contribution + global multiplier (for % share & accurate /s display)
  function buildingContribs(state) {
    const out = {}; let total = 0;
    BUILDINGS.forEach(b => {
      const n = state.buildings[b.id]; let m = 1;
      const ups = BUILDING_UPGRADES[b.id];
      (state.buildingUpgrades[b.id] || []).forEach((bo, i) => { if (bo) m *= ups[i].mul; });
      m *= 1 + 0.05 * ((state.buildingLevels || {})[b.id] || 0);
      m *= synergyMulFor(state, b.id);
      const c = b.baseCps * n * m; out[b.id] = c; total += c;
    });
    const g = techEffect(state, 'allMul') * milkBonus(state) * (1 + state.heavenlyChips * 0.02);
    return { out, total, g };
  }

  /* Tech tree helpers */
  function techEffect(state, key) {
    let v = (key === 'allMul' || key === 'clickMul' || key === 'goldenMul' || key === 'offlineMul') ? 1 : 0;
    TECH.forEach(t => {
      if (!state.tech || !state.tech[t.id]) return;
      const e = t.effect[key];
      if (e === undefined) return;
      if (key === 'goldenFreq') v = Math.max(v, 0) + 0; // handled separately
      if (key === 'allMul' || key === 'clickMul' || key === 'goldenMul' || key === 'offlineMul') v *= e;
      else v += e;
    });
    return v;
  }
  function goldenFreqMul(state) {
    let m = 1;
    TECH.forEach(t => { if (state.tech && state.tech[t.id] && t.effect.goldenFreq) m *= t.effect.goldenFreq; });
    return m;
  }
  function milkBonus(state) {
    const per = techEffect(state, 'milk');           // 0 unless Cosmic Bakery
    return 1 + per * AchievementSystem.count();
  }
  function synergyMulFor(state, buildingId) {
    let mul = 1;
    SYNERGIES.forEach(sy => {
      if (!state.synergies || !state.synergies[sy.id]) return;
      if (sy.a === buildingId) mul *= 1 + 0.0005 * (state.buildings[sy.b] || 0);
      if (sy.b === buildingId) mul *= 1 + 0.0005 * (state.buildings[sy.a] || 0);
    });
    return mul;
  }

  function computeCps(state) {
    let total = 0;
    BUILDINGS.forEach(b => {
      const n = state.buildings[b.id];
      if (n === 0) return;
      let mul = 1;
      const upgrades = BUILDING_UPGRADES[b.id];
      (state.buildingUpgrades[b.id] || []).forEach((bought, i) => {
        if (bought) mul *= upgrades[i].mul;
      });
      // Sugar-lump building levels: +5% each
      const lvl = (state.buildingLevels || {})[b.id] || 0;
      mul *= 1 + 0.05 * lvl;
      // Synergies
      mul *= synergyMulFor(state, b.id);
      total += b.baseCps * n * mul;
    });
    // Tech global multiplier
    total *= techEffect(state, 'allMul');
    // Milk (achievements)
    total *= milkBonus(state);
    // Prestige bonus: +2% per heavenly chip
    total *= 1 + state.heavenlyChips * 0.02;
    // ✦ Enigma Catalyst: +5% CpS per level (bought with shared Enigma Shards)
    total *= 1 + 0.05 * (state.enigma || 0);
    return total;
  }

  function computeCpc(state) {
    let mul = 1;
    CLICK_UPGRADES.forEach(u => {
      if (state.clickUpgrades[u.id]) mul *= u.mul;
    });
    // +1 cpc per 100 cursors
    const cursorBonus = Math.floor(state.buildings.cursor / 100);
    return (1 + cursorBonus) * mul * techEffect(state, 'clickMul') * (1 + state.heavenlyChips * 0.02);
  }

  /* Total cookies gained per click, including tech "% of CpS" effects */
  function clickPower(state) {
    return computeCpc(state) + computeCps(state) * techEffect(state, 'clickCps');
  }

  /* Layer unlock checks (use allTimeBaked which persists across prestige) */
  function sugarUnlocked(state)   { return (state.allTimeBaked || 0) >= UNLOCK_SUGAR; }
  function techUnlocked(state)    { return (state.allTimeBaked || 0) >= UNLOCK_TECH; }
  function synergyUnlocked(state) { return (state.allTimeBaked || 0) >= UNLOCK_SYNERGY; }

  function buildingLevelCost(level) { return level + 1; } // sugar lumps to reach next level

  function prestigeThreshold(times) {
    return 1e12 * Math.pow(7, times); // 1T, 7T, 49T ...
  }

  function heavenlyChipsForBaked(allTimeBaked) {
    return Math.floor(Math.sqrt(allTimeBaked / 1e12));
  }

  /* ── Achievements ──────────────────────────────────────────── */
  function registerAchievements() {
    AchievementSystem.register('click1',    '👆','First Click',         'Click the big cookie once.', 'Tap the cookie!');
    AchievementSystem.register('click100',  '✌️','Clickety Click',      'Click 100 times.',           'Keep tapping...');
    AchievementSystem.register('click1k',   '🖐️','Thousand Tapper',    'Click 1,000 times.',         '1,000 clicks total');
    AchievementSystem.register('bake1k',    '🍪','First Thousand',      'Bake 1,000 cookies.',        'Bake some cookies');
    AchievementSystem.register('bake1m',    '🎂','Millionaire',         'Bake 1,000,000 cookies.',    'Reach 1 million baked');
    AchievementSystem.register('bake1b',    '🍰','Billionaire',         'Bake 1 billion cookies.',    'Reach 1 billion baked');
    AchievementSystem.register('bake1t',    '🏭','Trillionaire',        'Bake 1 trillion cookies.',   'Reach 1 trillion baked');
    AchievementSystem.register('grandma1',  '👵','Grandma\'s Here',     'Buy your first Grandma.',    'Buy a Grandma');
    AchievementSystem.register('grandma25', '🧓','Golden Years',        'Own 25 Grandmas.',           '25 Grandmas');
    AchievementSystem.register('farm1',     '🌾','Cookie Farmer',       'Buy your first Farm.',       'Buy a Farm');
    AchievementSystem.register('factory1',  '🏭','Industrial Revolution','Buy your first Factory.',   'Buy a Factory');
    AchievementSystem.register('prestige1', '✨','Ascension',           'Prestige for the first time.','Reach 1 trillion all-time');
    AchievementSystem.register('prestige5', '🌟','Ascending Master',    'Prestige 5 times.',          '5 prestiges');
    AchievementSystem.register('golden1',   '🌕','Golden Chance',       'Catch a Golden Cookie.',     'Wait for a golden cookie...');
    AchievementSystem.register('sugar1',     '🍬','Sweet Tooth',        'Harvest your first sugar lump.','Reach 1M baked, then wait');
    AchievementSystem.register('tech1',      '🔬','Mad Scientist',      'Complete your first research.', 'Reach 50M baked');
    AchievementSystem.register('syn1',       '✨','Synergist',          'Unlock your first synergy.',    'Reach 1B baked');
  }

  function checkAchievements() {
    if (S.totalClicks >= 1)    AchievementSystem.unlock('click1');
    if (S.totalClicks >= 100)  AchievementSystem.unlock('click100');
    if (S.totalClicks >= 1000) AchievementSystem.unlock('click1k');
    if (S.totalBaked  >= 1e3)  AchievementSystem.unlock('bake1k');
    if (S.totalBaked  >= 1e6)  AchievementSystem.unlock('bake1m');
    if (S.totalBaked  >= 1e9)  AchievementSystem.unlock('bake1b');
    if (S.totalBaked  >= 1e12) AchievementSystem.unlock('bake1t');
    if (S.buildings.grandma >= 1)  AchievementSystem.unlock('grandma1');
    if (S.buildings.grandma >= 25) AchievementSystem.unlock('grandma25');
    if (S.buildings.farm    >= 1)  AchievementSystem.unlock('farm1');
    if (S.buildings.factory >= 1)  AchievementSystem.unlock('factory1');
    if (S.prestige >= 1) AchievementSystem.unlock('prestige1');
    if (S.prestige >= 5) AchievementSystem.unlock('prestige5');
  }

  /* ── Offline progress ──────────────────────────────────────── */
  function applyOfflineProgress(save) {
    const elapsed = Math.min((Date.now() - (save.savedAt || Date.now())) / 1000, OFFLINE_CAP);
    if (elapsed < 60) return; // less than a minute — skip modal
    const cps = computeCps(save.data);
    const earned = cps * elapsed * techEffect(save.data, 'offlineMul');
    // Grow sugar lumps offline
    let sugarGained = 0;
    if (sugarUnlocked(save.data)) {
      save.data.sugarTime = (save.data.sugarTime || 0) + elapsed;
      while (save.data.sugarTime >= SUGAR_INTERVAL) { save.data.sugarTime -= SUGAR_INTERVAL; save.data.sugar = (save.data.sugar || 0) + 1; sugarGained++; }
    }
    if (earned < 1 && sugarGained === 0) return;
    save.data.cookies    += earned;
    save.data.totalBaked += earned;
    save.data.allTimeBaked = (save.data.allTimeBaked || 0) + earned;
    if (!Settings.get('offlineModal')) {
      const sugarTxt = sugarGained ? ` · +${sugarGained} 🍬` : '';
      Toast.show('👋', 'Welcome back', `+${Fmt.format(earned)} cookies${sugarTxt} while away`);
      return;
    }
    Modal.show({
      title: '👋 Welcome back!',
      body: `You were away for <strong>${Fmt.time(elapsed)}</strong>.<br>
             Your bakers earned <strong class="text-gold">${Fmt.format(earned)} cookies</strong>${sugarGained ? ` and <strong class="text-accent">${sugarGained} 🍬 sugar lump${sugarGained>1?'s':''}</strong>` : ''} while you were gone.`,
      actions: [{ label: '🍪 Collect', cls: 'btn-primary' }]
    });
  }

  /* ── Load/save ─────────────────────────────────────────────── */
  function loadGame() {
    // Register migrations (future use)
    SaveSystem.registerMigrations(GAME_ID, {
      // v1_to_v2: (data) => { return { ...data, newField: 0 }; }
    });
    const save = SaveSystem.read(GAME_ID, SAVE_VERSION);
    if (save) {
      applyOfflineProgress(save);
      S = Object.assign(defaultState(), save.data);
    } else {
      S = defaultState();
    }
    S.savedAt = Date.now();
  }

  function saveGame() {
    S.savedAt = Date.now();
    SaveSystem.write(GAME_ID, SAVE_VERSION, S);
  }

  /* ── Render ────────────────────────────────────────────────── */
  let activeTab = localStorage.getItem('ck_tab') || 'upgrades';
  let buyAmount = localStorage.getItem('ck_buyAmt') || '1'; // '1' | '10' | '100' | 'max'

  function renderAll() {
    const cps = computeCps(S);
    const cpc = clickPower(S);

    document.getElementById('ck-cookies').textContent    = Fmt.format(S.cookies);
    document.getElementById('ck-cps').textContent        = Fmt.format(cps, 1) + '/s';
    document.getElementById('ck-total').textContent      = 'Total baked: ' + Fmt.format(S.totalBaked);
    document.getElementById('ck-prestige').textContent   = S.prestige > 0 ? `✨ Prestige ${S.prestige} · ${S.heavenlyChips} chips` : '';
    document.getElementById('ck-cpc-label').textContent  = '+' + Fmt.format(cpc, 1) + ' per tap';

    // Sugar lump readout (gated)
    const sugarEl = document.getElementById('ck-sugar');
    if (sugarEl) {
      if (sugarUnlocked(S)) {
        const pct = ((S.sugarTime || 0) / SUGAR_INTERVAL * 100).toFixed(0);
        sugarEl.style.display = 'block';
        sugarEl.innerHTML = `🍬 ${S.sugar || 0} <span style="color:var(--text2)">sugar lumps · next ${pct}%</span>`;
      } else {
        sugarEl.style.display = 'none';
      }
    }

    // Reveal gated tabs as layers unlock
    toggleTab('tech', techUnlocked(S));
    toggleTab('synergy', synergyUnlocked(S));
    // Don't sit on a tab that isn't unlocked yet
    if ((activeTab === 'tech' && !techUnlocked(S)) || (activeTab === 'synergy' && !synergyUnlocked(S))) {
      activeTab = 'upgrades';
      syncTabButtons();
    }

    renderSubbar();
    if (activeTab === 'upgrades') renderUpgradesTab(cpc);
    else if (activeTab === 'buildings') renderBuildingsTab();
    else if (activeTab === 'stats') renderStatsTab();
    else if (activeTab === 'tech') renderTechTab();
    else if (activeTab === 'synergy') renderSynergyTab();

    // Prestige button
    const canPrestige = S.allTimeBaked >= prestigeThreshold(S.prestige);
    const prestigeBtn = document.getElementById('ck-prestige-btn');
    if (prestigeBtn) {
      prestigeBtn.classList.toggle('hidden', !canPrestige);
      if (canPrestige) {
        const chips = heavenlyChipsForBaked(S.allTimeBaked) - S.heavenlyChips;
        prestigeBtn.textContent = `✨ Ascend (+${chips} Heavenly Chips)`;
      }
    }
  }

  // Small "⏳ time until affordable" tag, given a cost and current CpS
  function ttaTag(cost, cps) {
    if (S.cookies >= cost) return '';
    if (!(cps > 0)) return ''; // also catches NaN
    return ` <span style="color:var(--text2)">· ⏳ ${Fmt.time((cost - S.cookies) / cps)}</span>`;
  }

  function renderUpgradesTab(cpc) {
    const list = document.getElementById('ck-upgrades-list');
    if (!list) return;
    const cps = computeCps(S);
    let html = '';

    // ✦ Enigma Catalyst — special upgrade bought with shared Enigma Shards
    const eLvl = S.enigma || 0, eMax = eLvl >= 10, eCost = 3 + eLvl * 3, eAff = !eMax && Shards.get() >= eCost;
    html += `<button class="upgrade-item ${eMax ? '' : (eAff ? '' : 'locked')}" ${eMax ? '' : 'onclick="ClickerGame_buyEnigma()"'} style="border-color:var(--accent)">
        <div class="upg-icon">✦</div>
        <div class="upg-info">
          <div class="upg-name">Enigma Catalyst <span style="color:var(--text2);font-size:12px">Lv.${eLvl}/10</span></div>
          <div class="upg-cost" style="color:var(--text2)">+${eLvl * 5}% CpS · you have ${Fmt.format(Shards.get())} ✦</div>
        </div>
        <div class="upg-effect text-accent">${eMax ? 'MAX' : '✦ ' + eCost}</div>
      </button>`;

    // Click upgrades
    CLICK_UPGRADES.forEach(u => {
      if (S.clickUpgrades[u.id]) return; // already bought
      if (!u.req(S)) return; // not unlocked
      const canAfford = S.cookies >= u.cost;
      html += `<button class="upgrade-item ${canAfford ? '' : 'locked'}" onclick="ClickerGame_buyClickUpgrade('${u.id}')">
        <div class="upg-icon">👆</div>
        <div class="upg-info">
          <div class="upg-name">${u.name}</div>
          <div class="upg-cost text-gold">🍪 ${Fmt.format(u.cost)}${ttaTag(u.cost, cps)}</div>
        </div>
        <div class="upg-effect text-green">×${u.mul} click</div>
      </button>`;
    });

    // Building upgrades
    BUILDINGS.forEach(b => {
      const owned = S.buildings[b.id];
      const upgrades = BUILDING_UPGRADES[b.id];
      upgrades.forEach((u, i) => {
        if ((S.buildingUpgrades[b.id] || [])[i]) return; // bought
        if (owned < u.at) return; // not unlocked
        const canAfford = S.cookies >= u.cost;
        html += `<button class="upgrade-item ${canAfford ? '' : 'locked'}" onclick="ClickerGame_buyBuildingUpgrade('${b.id}',${i})">
          <div class="upg-icon">${b.icon}</div>
          <div class="upg-info">
            <div class="upg-name">${u.name}</div>
            <div class="upg-cost text-gold">🍪 ${Fmt.format(u.cost)}${ttaTag(u.cost, cps)}</div>
          </div>
          <div class="upg-effect text-green">×${u.mul} ${b.name}</div>
        </button>`;
      });
    });

    list.innerHTML = html || '<div class="center text-muted mt-12" style="padding:20px">Click the cookie and buy buildings to unlock upgrades!</div>';
  }

  function renderBuildingsTab() {
    const list = document.getElementById('ck-upgrades-list');
    if (!list) return;
    const cps = computeCps(S);
    const { out: contribs, total: rawTotal, g } = buildingContribs(S);
    let html = '';
    BUILDINGS.forEach(b => {
      const owned = S.buildings[b.id];
      // How many we're buying given the selected amount
      const n = buyAmount === 'max'
        ? Math.max(1, buildingMaxAffordable(b.id, owned, S.cookies))
        : parseInt(buyAmount);
      const cost = buildingCostBulk(b.id, owned, n);
      const canAfford = S.cookies >= cost;
      const lvl = (S.buildingLevels || {})[b.id] || 0;
      // Accurate /s contribution and % share
      const actualCps = (contribs[b.id] || 0) * g;
      const pct = rawTotal > 0 ? (contribs[b.id] / rawTotal * 100) : 0;
      const contribution = owned > 0 ? `${Fmt.format(actualCps, 1)}/s · ${pct.toFixed(0)}%` : 'not built yet';
      // Time-to-afford when you can't buy now
      let tta = '';
      if (!canAfford && cps > 0) tta = ` <span style="color:var(--text2)">· ⏳ ${Fmt.time((cost - S.cookies) / cps)}</span>`;
      // Sugar-lump level control (gated + needs the building owned)
      let sugarCtl = '';
      if (sugarUnlocked(S) && owned > 0) {
        const lcost = buildingLevelCost(lvl);
        const aff = (S.sugar || 0) >= lcost;
        sugarCtl = `<span class="bld-level ${aff ? '' : 'locked'}" onclick="event.stopPropagation();ClickerGame_levelBuilding('${b.id}')" title="Spend sugar lumps to level up">🍬 Lv.${lvl} · ${lcost}</span>`;
      } else if (lvl > 0) {
        sugarCtl = `<span class="bld-level" style="opacity:.7">🍬 Lv.${lvl}</span>`;
      }
      html += `<button class="building-item ${canAfford ? 'can-buy' : 'locked'}" onclick="ClickerGame_buyBuilding('${b.id}')">
        <div class="bld-icon">${b.icon}</div>
        <div class="bld-info">
          <div class="bld-name">${b.name} <span class="bld-count">${owned}</span></div>
          <div class="bld-cps text-green" style="font-size:12px">${contribution}${sugarCtl}</div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div class="bld-cost text-gold">🍪 ${Fmt.format(cost)}</div>
          <div style="font-size:11px;color:var(--text2)">+${n}${tta}</div>
        </div>
      </button>`;
    });
    list.innerHTML = html;
  }

  function renderStatsTab() {
    const list = document.getElementById('ck-upgrades-list');
    if (!list) return;
    const cps = computeCps(S);
    const cpc = computeCpc(S);
    const nextPrestige = prestigeThreshold(S.prestige);
    const progress = Math.min(S.allTimeBaked / nextPrestige, 1);
    list.innerHTML = `
      <div style="padding: 12px; display:flex; flex-direction:column; gap:12px;">
        <div class="stat-row"><span class="text-muted">Cookies now</span><span class="text-gold">${Fmt.format(S.cookies)}</span></div>
        <div class="stat-row"><span class="text-muted">Baked this run</span><span>${Fmt.format(S.totalBaked)}</span></div>
        <div class="stat-row"><span class="text-muted">All-time baked</span><span>${Fmt.format(S.allTimeBaked)}</span></div>
        <div class="stat-row"><span class="text-muted">Per second</span><span class="text-green">${Fmt.format(cps, 2)}</span></div>
        <div class="stat-row"><span class="text-muted">Per click</span><span>${Fmt.format(cpc, 2)}</span></div>
        <div class="stat-row"><span class="text-muted">Total clicks</span><span>${Fmt.format(S.totalClicks)}</span></div>
        <div class="stat-row"><span class="text-muted">Prestige count</span><span class="text-accent">✨ ${S.prestige}</span></div>
        <div class="stat-row"><span class="text-muted">Heavenly Chips</span><span class="text-gold">✨ ${S.heavenlyChips}</span></div>
        ${S.prestige >= 0 ? `
        <div style="margin-top:4px">
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
            <span class="text-muted">Next Ascension</span>
            <span>${Fmt.format(S.allTimeBaked)} / ${Fmt.format(nextPrestige)}</span>
          </div>
          <div class="progress-bar"><div class="progress-fill gold" style="width:${(progress*100).toFixed(1)}%"></div></div>
        </div>` : ''}
      </div>`;
  }

  function toggleTab(name, show) {
    const btn = document.getElementById('ck-tabbtn-' + name);
    if (btn) btn.style.display = show ? '' : 'none';
  }

  // Highlight the tab button that matches activeTab (used on load / auto-reset)
  function syncTabButtons() {
    document.querySelectorAll('#screen-clicker .tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === activeTab);
    });
  }

  // Pinned sub-bar: buy-amount selector on the Buildings tab
  function renderSubbar() {
    const bar = document.getElementById('ck-subbar');
    if (!bar) return;
    if (activeTab === 'buildings') {
      bar.style.display = 'flex';
      const amts = [['1','×1'],['10','×10'],['100','×100'],['max','Max']];
      bar.innerHTML = '<span class="buy-amt-label">Buy</span>' + amts.map(([v,l]) =>
        `<button class="buy-amt-btn ${buyAmount===v?'active':''}" onclick="ClickerGame_setBuyAmount('${v}',this)">${l}</button>`).join('');
    } else {
      bar.style.display = 'none';
    }
  }

  window.ClickerGame_setBuyAmount = function(amt) {
    buyAmount = amt;
    localStorage.setItem('ck_buyAmt', amt);
    renderAll();
  };

  function renderTechTab() {
    const list = document.getElementById('ck-upgrades-list');
    if (!list) return;
    const cps = computeCps(S);
    const branches = {};
    TECH.forEach(t => { (branches[t.branch] = branches[t.branch] || []).push(t); });
    let html = '<div style="padding:4px 2px 8px;font-size:12px;color:var(--text2)">🔬 Research permanent upgrades. Each node needs the one before it. ⏳ shows time until affordable.</div>';
    Object.keys(branches).forEach(br => {
      html += `<div class="menu-section-title" style="padding:6px 2px 2px">${br}</div>`;
      branches[br].forEach(t => {
        const owned = S.tech[t.id];
        const reqMet = t.req.every(r => S.tech[r]);
        const canAfford = S.cookies >= t.cost && reqMet && !owned;
        const locked = owned ? false : (!reqMet || !canAfford);
        // ⏳ time-until-affordable — only once prerequisites are met
        const tta = (!owned && reqMet && S.cookies < t.cost && cps > 0)
          ? `<div style="font-size:11px;color:var(--text2)">⏳ ${Fmt.time((t.cost - S.cookies) / cps)}</div>` : '';
        html += `<button class="upgrade-item ${locked && !owned ? 'locked' : ''}" ${owned ? '' : `onclick="ClickerGame_buyTech('${t.id}')"`} style="${owned ? 'border-color:var(--green)' : ''}">
          <div class="upg-icon">${t.icon}</div>
          <div class="upg-info">
            <div class="upg-name">${t.name} ${owned ? '<span class="text-green" style="font-size:12px">✓</span>' : ''}</div>
            <div style="font-size:12px;color:var(--text2)">${t.desc}</div>
            ${!owned && !reqMet ? '<div class="ach-hint" style="color:var(--text2)">🔒 Needs prior research</div>' : tta}
          </div>
          <div class="upg-cost text-gold" style="flex-shrink:0">${owned ? 'Owned' : '🍪 ' + Fmt.format(t.cost)}</div>
        </button>`;
      });
    });
    list.innerHTML = html;
  }

  function renderSynergyTab() {
    const list = document.getElementById('ck-upgrades-list');
    if (!list) return;
    const cps = computeCps(S);
    let html = '<div style="padding:4px 2px 8px;font-size:12px;color:var(--text2)">✨ Synergies make two building types boost each other based on how many you own.</div>';
    SYNERGIES.forEach(sy => {
      const owned = S.synergies[sy.id];
      const aB = BUILDINGS.find(b => b.id === sy.a), bB = BUILDINGS.find(b => b.id === sy.b);
      const canAfford = S.cookies >= sy.cost && !owned;
      const live = owned ? `+${(0.0005 * (S.buildings[sy.b] || 0) * 100).toFixed(1)}% / +${(0.0005 * (S.buildings[sy.a] || 0) * 100).toFixed(1)}%` : '';
      html += `<button class="upgrade-item ${owned ? '' : (canAfford ? '' : 'locked')}" ${owned ? '' : `onclick="ClickerGame_buySynergy('${sy.id}')"`} style="${owned ? 'border-color:var(--epic)' : ''}">
        <div class="upg-icon">${aB.icon}${bB.icon}</div>
        <div class="upg-info">
          <div class="upg-name">${sy.name} ${owned ? '<span style="color:var(--epic);font-size:12px">✓</span>' : ''}</div>
          <div style="font-size:12px;color:var(--text2)">${sy.desc}</div>
          ${owned ? `<div style="font-size:12px;color:var(--green)">Active: ${live}</div>` : (S.cookies < sy.cost && cps > 0 ? `<div style="font-size:11px;color:var(--text2)">⏳ ${Fmt.time((sy.cost - S.cookies) / cps)}</div>` : '')}
        </div>
        <div class="upg-cost text-gold" style="flex-shrink:0">${owned ? 'Owned' : '🍪 ' + Fmt.format(sy.cost)}</div>
      </button>`;
    });
    list.innerHTML = html;
  }

  /* ── Build HTML ────────────────────────────────────────────── */
  function buildUI() {
    const el = document.getElementById('screen-clicker');
    el.innerHTML = `
      <style>
        #ck-main { display:flex; flex-direction:column; height:100%; }
        #ck-top  { padding:16px; text-align:center; flex-shrink:0; }
        #ck-cookie-btn {
          font-size:90px; line-height:1; background:none; border:none;
          cursor:pointer; transition:transform 0.08s;
          display:block; margin:0 auto 8px;
          filter: drop-shadow(0 4px 12px rgba(245,197,66,0.3));
        }
        #ck-cookie-btn:active { transform: scale(0.88); }
        #ck-cookies { font-size:26px; font-weight:700; color:var(--gold); }
        #ck-cps     { font-size:14px; color:var(--text2); margin-top:2px; }
        #ck-total   { font-size:12px; color:var(--text2); margin-top:1px; }
        #ck-prestige{ font-size:12px; color:var(--accent); margin-top:3px; }
        #ck-cpc-label{ font-size:12px; color:var(--green); margin-top:4px; }
        #ck-prestige-btn {
          margin-top:10px; padding:8px 16px;
          background:var(--accent); border-radius:var(--radius-sm);
          font-size:13px; font-weight:600; color:#fff;
          border:none; cursor:pointer;
        }
        #ck-content { flex:1; display:flex; flex-direction:column; min-height:0; }
        #ck-upgrades-list { flex:1; overflow-y:auto; padding:10px; display:flex; flex-direction:column; gap:8px; }
        .upgrade-item, .building-item {
          display:flex; align-items:center; gap:10px;
          background:var(--bg2); border:1px solid var(--border);
          border-radius:var(--radius-sm); padding:10px 12px;
          text-align:left; width:100%;
        }
        .upgrade-item:active, .building-item:active { border-color:var(--accent); }
        .upgrade-item.locked, .building-item.locked { opacity:0.55; }
        .upg-icon, .bld-icon { font-size:24px; flex-shrink:0; }
        .upg-info, .bld-info { flex:1; }
        .upg-name, .bld-name { font-size:14px; font-weight:600; }
        .upg-cost, .bld-cost { font-size:13px; }
        .upg-effect { font-size:13px; font-weight:600; flex-shrink:0; }
        .bld-count  { background:var(--accent); color:#fff; border-radius:10px; padding:1px 7px; font-size:12px; margin-left:4px; }
        .bld-desc   { font-size:12px; margin-top:2px; }
        .bld-level  { display:inline-block; margin-left:8px; padding:1px 7px; border-radius:8px;
                      background:var(--bg3); border:1px solid var(--border); color:var(--gold); font-size:11px; }
        .bld-level.locked { opacity:0.5; }
        .bld-level:active { background:var(--border); }
        #ck-sugar   { font-size:12px; color:var(--gold); margin-top:4px; display:none; }
        #ck-content .tab-bar { overflow-x:auto; white-space:nowrap; }
        #ck-content .tab-btn { min-width:84px; }
        #ck-subbar { display:none; align-items:center; gap:6px; padding:8px 10px;
                     background:var(--bg2); border-bottom:1px solid var(--border); flex-shrink:0; }
        .buy-amt-label { font-size:12px; color:var(--text2); margin-right:2px; }
        .buy-amt-btn { padding:4px 12px; border-radius:var(--radius-sm); font-size:13px; font-weight:600;
                       background:var(--bg3); border:1px solid var(--border); color:var(--text2); }
        .buy-amt-btn.active { background:var(--accent); border-color:var(--accent); color:#fff; }
        .building-item.can-buy { border-color:var(--green); }
        .building-item.can-buy:active { border-color:var(--accent); }
        .stat-row { display:flex; justify-content:space-between; align-items:center; font-size:14px; }
        #ck-golden {
          position:absolute; font-size:42px; cursor:pointer; z-index:100;
          filter:drop-shadow(0 0 10px gold);
          animation:golden-pulse 1s ease-in-out infinite alternate;
          display:none;
        }
        @keyframes golden-pulse {
          from { transform:scale(1); }
          to   { transform:scale(1.12); }
        }
      </style>
      <div id="ck-main" style="position:relative">
        <div id="ck-top">
          <button id="ck-cookie-btn" aria-label="Click to bake cookies" onclick="ClickerGame_click(event)">🍪</button>
          <div id="ck-cookies">0</div>
          <div id="ck-cps">0/s</div>
          <div id="ck-total"></div>
          <div id="ck-prestige"></div>
          <div id="ck-cpc-label"></div>
          <div id="ck-sugar"></div>
          <button id="ck-prestige-btn" class="hidden" onclick="ClickerGame_prestige()"></button>
        </div>
        <div id="ck-content">
          <div class="tab-bar">
            <button class="tab-btn" data-tab="upgrades"  onclick="ClickerGame_tab('upgrades',this)">Upgrades</button>
            <button class="tab-btn" data-tab="buildings" onclick="ClickerGame_tab('buildings',this)">Buildings</button>
            <button id="ck-tabbtn-tech"    class="tab-btn" data-tab="tech"    style="display:none" onclick="ClickerGame_tab('tech',this)">🔬 Tech</button>
            <button id="ck-tabbtn-synergy" class="tab-btn" data-tab="synergy" style="display:none" onclick="ClickerGame_tab('synergy',this)">✨ Synergy</button>
            <button class="tab-btn" data-tab="stats"     onclick="ClickerGame_tab('stats',this)">Stats</button>
          </div>
          <div id="ck-subbar"></div>
          <div id="ck-upgrades-list"></div>
        </div>
        <span id="ck-golden" onclick="ClickerGame_goldenClick(event)">🌕</span>
      </div>`;
  }

  /* ── Exposed globals (onclick handlers) ────────────────────── */
  window.ClickerGame_click = function(e) {
    const cpc = clickPower(S);
    S.cookies    += cpc;
    S.totalBaked += cpc;
    S.allTimeBaked = (S.allTimeBaked || 0) + cpc;
    S.totalClicks++;
    floatNum(e.clientX, e.clientY, '+' + Fmt.format(cpc, 1));
    Haptics.vibrate(30);
    checkAchievements();
  };

  window.ClickerGame_buyBuilding = function(id) {
    const owned = S.buildings[id];
    const n = buyAmount === 'max'
      ? buildingMaxAffordable(id, owned, S.cookies)
      : parseInt(buyAmount);
    if (n < 1) return;
    const cost = buildingCostBulk(id, owned, n);
    if (S.cookies < cost) return;
    S.cookies -= cost;
    S.buildings[id] += n;
    if (!S.buildingUpgrades[id]) S.buildingUpgrades[id] = [false, false, false];
    Haptics.vibrate(40);
    checkAchievements();
    renderAll();
  };

  window.ClickerGame_buyClickUpgrade = function(id) {
    const u = CLICK_UPGRADES.find(u => u.id === id);
    if (!u || S.clickUpgrades[id]) return;
    if (S.cookies < u.cost) return;
    S.cookies -= u.cost;
    S.clickUpgrades[id] = true;
    Toast.show('👆', 'Upgrade Purchased', u.name);
    Haptics.vibrate(40);
  };

  // ✦ Enigma Catalyst — spend shared Enigma Shards (earned in Code Breaker)
  window.ClickerGame_buyEnigma = function() {
    const lvl = S.enigma || 0;
    if (lvl >= 10) return;
    const cost = 3 + lvl * 3;
    if (!Shards.spend(cost)) { Toast.show('✦', 'Not enough Shards', `Need ${cost} — earn them in Code Breaker`); return; }
    S.enigma = lvl + 1;
    Toast.show('✦', 'Enigma Catalyst → Lv.' + (lvl + 1), `+${(lvl + 1) * 5}% cookies per second`);
    Haptics.vibrate([40, 30, 60]);
    renderAll();
  };

  window.ClickerGame_buyBuildingUpgrade = function(buildingId, tier) {
    const u = BUILDING_UPGRADES[buildingId][tier];
    if (!u) return;
    if ((S.buildingUpgrades[buildingId] || [])[tier]) return;
    if (S.cookies < u.cost) return;
    S.cookies -= u.cost;
    if (!S.buildingUpgrades[buildingId]) S.buildingUpgrades[buildingId] = [false, false, false];
    S.buildingUpgrades[buildingId][tier] = true;
    Toast.show('⬆️', 'Upgrade Purchased', u.name);
    Haptics.vibrate(40);
  };

  window.ClickerGame_help = function() {
    Modal.show({
      title: 'ℹ️ How Cookie Clicker works',
      body: `
        <p><b class="text-gold">🍪 Tap the cookie</b> to bake cookies by hand. Each tap gives "per click" cookies.</p>
        <p class="mt-8"><b class="text-green">🏭 Buildings</b> bake cookies automatically every second (CpS). Each one you buy gets a little more expensive. Hold the ×10 / Max buttons to buy in bulk.</p>
        <p class="mt-8"><b class="text-accent">⬆️ Upgrades</b> are permanent one-time multipliers for your clicks or a building. The ⏳ timer estimates how long until you can afford one at your current rate.</p>
        <p class="mt-8"><b>🌕 Golden cookies</b> appear at random — tap them fast for a big cookie bonus.</p>
        <p class="mt-8"><b>🍬 Sugar lumps</b> (unlock at 1M baked) grow slowly over time. Spend them on the Buildings tab to permanently level a building (+5% each).</p>
        <p class="mt-8"><b>🔬 Tech</b> (50M) and <b>✨ Synergies</b> (1B) unlock deeper bonuses as you progress.</p>
        <p class="mt-8"><b>✨ Ascend</b> resets your run for Heavenly Chips — each chip is +2% to all production forever. Sugar, tech and synergies are kept.</p>
      `,
      actions: [{ label: 'Got it', cls: 'btn-primary' }]
    });
  };

  window.ClickerGame_tab = function(tab, btn) {
    activeTab = tab;
    localStorage.setItem('ck_tab', tab);
    document.querySelectorAll('#screen-clicker .tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderAll();
  };

  window.ClickerGame_levelBuilding = function(id) {
    if (!sugarUnlocked(S) || (S.buildings[id] || 0) < 1) return;
    if (!S.buildingLevels) S.buildingLevels = {};
    const lvl  = S.buildingLevels[id] || 0;
    const cost = buildingLevelCost(lvl);
    if ((S.sugar || 0) < cost) { Toast.show('🍬', 'Not enough sugar', `Need ${cost} sugar lumps.`); return; }
    S.sugar -= cost;
    S.buildingLevels[id] = lvl + 1;
    Toast.show('🍬', 'Building leveled', `${BUILDINGS.find(b=>b.id===id).name} → Lv.${lvl+1} (+5% output)`);
    Haptics.vibrate(40);
    renderAll();
  };

  window.ClickerGame_buyTech = function(id) {
    const t = TECH.find(t => t.id === id);
    if (!t || S.tech[id]) return;
    if (!t.req.every(r => S.tech[r])) return;
    if (S.cookies < t.cost) return;
    S.cookies -= t.cost;
    S.tech[id] = true;
    AchievementSystem.unlock('tech1');
    Toast.show(t.icon, 'Research Complete', t.name);
    Haptics.vibrate([40,30,60]);
    renderAll();
  };

  window.ClickerGame_buySynergy = function(id) {
    const sy = SYNERGIES.find(s => s.id === id);
    if (!sy || S.synergies[id]) return;
    if (S.cookies < sy.cost) return;
    S.cookies -= sy.cost;
    S.synergies[id] = true;
    AchievementSystem.unlock('syn1');
    Toast.show('✨', 'Synergy Unlocked', sy.name);
    Haptics.vibrate([40,30,60]);
    renderAll();
  };

  window.ClickerGame_prestige = function() {
    const chips = heavenlyChipsForBaked(S.allTimeBaked) - S.heavenlyChips;
    Modal.show({
      title: '✨ Ascend',
      body: `Reset this run and gain <strong class="text-gold">${chips} Heavenly Chips</strong>.<br>
             Each chip gives +2% to all production permanently.<br><br>
             Your buildings and upgrades will be reset, but your all-time total is kept.`,
      actions: [
        { label: 'Cancel', cls: '' },
        { label: '✨ Ascend', cls: 'btn-primary', fn: () => {
          // Capture values before resetting state
          const newPrestige = S.prestige + 1;
          const newChips    = S.heavenlyChips + chips;
          const allTime     = S.allTimeBaked;
          // Meta layers persist across ascension
          const keepSugar   = S.sugar, keepSugarT = S.sugarTime;
          const keepLevels  = S.buildingLevels, keepTech = S.tech, keepSyn = S.synergies;
          S = defaultState();
          S.prestige      = newPrestige;
          S.heavenlyChips = newChips;
          S.allTimeBaked  = allTime;
          S.sugar         = keepSugar;
          S.sugarTime     = keepSugarT;
          S.buildingLevels= keepLevels;
          S.tech          = keepTech;
          S.synergies     = keepSyn;
          AchievementSystem.unlock('prestige1');
          if (newPrestige >= 5) AchievementSystem.unlock('prestige5');
          Toast.show('✨', 'Ascended!', 'You now have ' + newChips + ' Heavenly Chips.');
        }}
      ]
    });
  };

  window.ClickerGame_goldenClick = function(e) {
    if (!goldenActive) return;
    const cps = computeCps(S);
    const bonus = Math.max(13, cps * 60 * 15) * techEffect(S, 'goldenMul'); // 15 minutes of CPS
    S.cookies    += bonus;
    S.totalBaked += bonus;
    S.allTimeBaked = (S.allTimeBaked || 0) + bonus;
    goldenActive = false;
    clearTimeout(goldenDespawnTimer);
    document.getElementById('ck-golden').style.display = 'none';
    floatNum(e.clientX, e.clientY, '🌕 +' + Fmt.format(bonus), '#f5c542');
    AchievementSystem.unlock('golden1');
    Toast.show('🌕', 'Golden Cookie!', '+' + Fmt.format(bonus) + ' cookies');
    Haptics.vibrate([80, 40, 80]);
    scheduleGoldenCookie();
  };

  function clickerActive() {
    return document.getElementById('screen-clicker')?.classList.contains('active');
  }

  function clearGoldenCookie() {
    clearTimeout(goldenCookieTimer);
    clearTimeout(goldenDespawnTimer);
    goldenActive = false;
    const gc = document.getElementById('ck-golden');
    if (gc) gc.style.display = 'none';
  }

  function scheduleGoldenCookie() {
    const delay = (90 + Math.random() * 210) * 1000 * goldenFreqMul(S); // 1.5–5 min (reduced by tech)
    clearTimeout(goldenCookieTimer);
    clearTimeout(goldenDespawnTimer);
    goldenCookieTimer = setTimeout(() => spawnGoldenCookie(), delay);
  }

  function spawnGoldenCookie() {
    // Never spawn while away from the clicker, or over the welcome-back popup.
    if (!clickerActive() || Modal.isOpen()) { scheduleGoldenCookie(); return; }
    const gc = document.getElementById('ck-golden');
    if (!gc) return;
    if (!Settings.get('golden')) {       // disabled in settings — check back later
      gc.style.display = 'none';
      goldenActive = false;
      clearTimeout(goldenCookieTimer);
      goldenCookieTimer = setTimeout(() => spawnGoldenCookie(), 60000);
      return;
    }
    const screenW = window.innerWidth;
    const screenH = document.getElementById('screen-clicker').clientHeight;
    gc.style.left = (20 + Math.random() * (screenW - 100)) + 'px';
    gc.style.top  = (100 + Math.random() * (screenH - 200)) + 'px';
    gc.style.display = 'block';
    goldenActive = true;
    // Disappears after 30s if not clicked
    clearTimeout(goldenDespawnTimer);
    goldenDespawnTimer = setTimeout(() => {
      goldenActive = false;
      gc.style.display = 'none';
      scheduleGoldenCookie();
    }, 30000);
  }

  /* ── Tick ──────────────────────────────────────────────────── */
  let renderThrottle = 0;
  tickFn = function(dt) {
    if (!S) return;
    const cps = computeCps(S);
    S.cookies    += cps * dt;
    S.totalBaked += cps * dt;
    S.allTimeBaked = (S.allTimeBaked || 0) + cps * dt;

    // Sugar lumps grow over time once unlocked
    if (sugarUnlocked(S)) {
      S.sugarTime = (S.sugarTime || 0) + dt;
      while (S.sugarTime >= SUGAR_INTERVAL) {
        S.sugarTime -= SUGAR_INTERVAL;
        S.sugar = (S.sugar || 0) + 1;
        AchievementSystem.unlock('sugar1');
        Toast.show('🍬', 'Sugar Lump!', 'A lump has matured. Spend it on the Buildings tab.');
      }
    }

    renderThrottle += dt;
    if (renderThrottle >= 0.25) {
      renderThrottle = 0;
      if (document.getElementById('screen-clicker').classList.contains('active')) {
        renderAll();
      }
    }
  };

  /* ── Register with Router ──────────────────────────────────── */
  Router.register('clicker', {
    title: '🍪 Cookie Clicker',
    onHelp: () => ClickerGame_help(),
    onEnter: () => {
      loadGame();
      buildUI();
      registerAchievements();
      syncTabButtons();
      renderAll();
      Ticker.add(tickFn);
      autosaveTimer = setInterval(() => saveGame(), AUTOSAVE_MS);
      clearGoldenCookie();      // clear any leaked state/timers from a prior visit
      scheduleGoldenCookie();   // spawn waits 1.5min+, so the welcome popup shows first
    },
    onLeave: () => {
      saveGame();
      Ticker.remove(tickFn);
      clearInterval(autosaveTimer);
      clearGoldenCookie();
    }
  });

  // The rAF ticker pauses while the tab is hidden / phone is locked, so time
  // would be lost even with the game open. Stamp the hide moment and, on
  // return, run the same offline catch-up so cookies bake while away.
  document.addEventListener('visibilitychange', () => {
    const active = document.getElementById('screen-clicker')?.classList.contains('active');
    if (!active || !S) return;
    if (document.hidden) {
      ckHiddenAt = Date.now();
      saveGame();
    } else if (ckHiddenAt) {
      applyOfflineProgress({ data: S, savedAt: ckHiddenAt });
      ckHiddenAt = 0;
      S.savedAt = Date.now();
      renderAll();
    }
  });
})(); // end ClickerGame
