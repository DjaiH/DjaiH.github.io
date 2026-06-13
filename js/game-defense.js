'use strict';
/* ════════════════════════════════════════════════════════════════
   ORBITAL DEFENSE  —  semi-idle sci-fi tower defense + RPG
   ────────────────────────────────────────────────────────────────
   One turret holds the bottom of a vertical lane; waves of hostiles
   descend toward your core. The turret auto-fires; you tune its
   firepower with Credits, level up to spend skill points across four
   trees, fire active abilities, and Reboot the Reactor (prestige) for
   permanent Cores. Tuned to reward fast early and grow grindy late —
   full clear (wave 500) is a weeks-to-months haul.
   ════════════════════════════════════════════════════════════════ */
(function DefenseGame() {
  const GAME_ID      = 'defense';
  const SAVE_VERSION = 1;
  const AUTOSAVE_MS  = 30000;
  const LANE_TIME    = 11;          // seconds a normal enemy takes to cross
  const OFFLINE_CAP  = 24 * 3600;
  const PRESTIGE_WAVE = 50;         // min wave reached to allow a Reboot

  /* ── Sectors: every 10 waves. hpMod/atkMod/spdMod give each a feel.
        boss = the wave-10 commander icon for that sector. ── */
  const SECTORS = [
    { name:'Low Orbit',      enemies:['🛸','👾','🚀'],      boss:'🛰️', hpMod:1.00, atkMod:1.00, spdMod:1.00, tip:'Light scouts probe your defenses.' },
    { name:'Asteroid Belt',  enemies:['☄️','🪨','👾'],      boss:'🤖', hpMod:1.20, atkMod:0.95, spdMod:0.95, tip:'Slow, heavily-shielded rock-haulers.' },
    { name:'Derelict Fleet', enemies:['🛰️','🚀','👽'],      boss:'🛸', hpMod:1.10, atkMod:1.25, spdMod:1.05, tip:'Reanimated warships hit hard.' },
    { name:'Ion Nebula',     enemies:['🌌','👾','🛸'],      boss:'👽', hpMod:1.30, atkMod:1.15, spdMod:1.10, tip:'Charged clouds quicken the swarm.' },
    { name:'Hostile World',  enemies:['👽','🤖','🛸'],      boss:'🪐', hpMod:1.45, atkMod:1.25, spdMod:1.00, tip:'A planet that wants you gone.' },
    { name:'Wormhole',       enemies:['🌀','👾','🛸'],      boss:'🕳️', hpMod:1.35, atkMod:1.50, spdMod:1.20, tip:'Things fall out of it, fast.' },
    { name:'Alien Hive',     enemies:['👾','🐛','👽'],      boss:'👁️', hpMod:1.70, atkMod:1.45, spdMod:1.10, tip:'Endless broods of biomechanical horrors.' },
    { name:'The Singularity',enemies:['🕳️','🌑','👁️'],      boss:'🌟', hpMod:2.10, atkMod:1.80, spdMod:1.15, tip:'Only the over-built survive here.' },
  ];
  function sectorIndex(wave) { return Math.floor((wave - 1) / 10); }
  function sectorFor(wave)   { return SECTORS[sectorIndex(wave) % SECTORS.length]; }
  function isBossWave(wave)  { return wave % 10 === 0; }

  /* ── Turret upgrades (bought with Credits, reset on Reboot) ──── */
  const TURRET = [
    { id:'dmg',    name:'Plasma Damage', icon:'⚡', base:8,   per:3,    costBase:12,  costMul:1.14 },
    { id:'rate',   name:'Fire Rate',     icon:'🔫', base:1.0, per:0.12, costBase:25,  costMul:1.16, max:40, fmt:v=>v.toFixed(2)+'/s' },
    { id:'crit',   name:'Crit Chance',   icon:'🎯', base:3,   per:2,    costBase:40,  costMul:1.18, max:30, fmt:v=>v+'%' },
    { id:'critd',  name:'Crit Power',    icon:'💥', base:150, per:12,   costBase:35,  costMul:1.17, fmt:v=>v+'%' },
    { id:'multi',  name:'Multishot',     icon:'↔️', base:1,   per:1,    costBase:300, costMul:1.55, max:6, fmt:v=>v+' targets' },
    { id:'shield', name:'Core Shield',   icon:'🛡️', base:100, per:30,   costBase:20,  costMul:1.15 },
    { id:'regen',  name:'Shield Regen',  icon:'🔋', base:2,   per:1.5,  costBase:45,  costMul:1.17, fmt:v=>v.toFixed(1)+'/s' },
  ];
  function turretDef(id) { return TURRET.find(t => t.id === id); }
  function statCost(def, level) { return Math.floor(def.costBase * Math.pow(def.costMul, level)); }
  function statCostBulk(def, level, n) { let c = 0; for (let i = 0; i < n; i++) c += statCost(def, level + i); return c; }
  function statMaxAffordable(def, level, credits) {
    let n = 0, c = 0;
    while (n < 100000) {
      if (def.max !== undefined && level + n >= def.max) break;
      const next = statCost(def, level + n);
      if (c + next > credits) break;
      c += next; n++;
    }
    return n;
  }

  /* ── Skill trees (skill points from levelling, persist forever) ── */
  const SKILLS = [
    // Ballistics — raw firepower
    { id:'b_dmg',   branch:'Ballistics', name:'Overpressure',   icon:'⚡', max:10, cost:1, req:null,     reqLvl:0, desc:l=>`+${l*6}% turret damage` },
    { id:'b_crit',  branch:'Ballistics', name:'Targeting AI',   icon:'🎯', max:8,  cost:2, req:'b_dmg',  reqLvl:2, desc:l=>`+${l*3}% crit chance` },
    { id:'b_critd', branch:'Ballistics', name:'Hollow Points',  icon:'💢', max:6,  cost:3, req:'b_crit', reqLvl:1, desc:l=>`+${l*20}% crit power` },
    { id:'b_multi', branch:'Ballistics', name:'Scatter Rounds', icon:'↔️', max:3,  cost:4, req:'b_critd',reqLvl:1, desc:l=>`+${l} multishot targets` },
    // Energy — tempo
    { id:'e_rate',  branch:'Energy',     name:'Coolant Loop',   icon:'❄️', max:8,  cost:1, req:null,     reqLvl:0, desc:l=>`+${(l*0.10).toFixed(2)} fire rate` },
    { id:'e_haste', branch:'Energy',     name:'Overclock',      icon:'🔥', max:5,  cost:3, req:'e_rate', reqLvl:3, desc:l=>`+${(l*0.14).toFixed(2)} fire rate` },
    { id:'e_pierce',branch:'Energy',     name:'Rail Lance',     icon:'📡', max:3,  cost:4, req:'e_haste',reqLvl:1, desc:l=>`+${l} pierce targets` },
    // Fortitude — survival
    { id:'f_shield',branch:'Fortitude',  name:'Hull Plating',   icon:'🛡️', max:10, cost:1, req:null,     reqLvl:0, desc:l=>`+${l*8}% max shield` },
    { id:'f_slow',  branch:'Fortitude',  name:'Tractor Field',  icon:'🧲', max:10, cost:2, req:'f_shield',reqLvl:2, desc:l=>`enemies move ${l*3}% slower (max 30%)` },
    { id:'f_regen', branch:'Fortitude',  name:'Nanorepair',     icon:'🔧', max:8,  cost:2, req:'f_shield',reqLvl:3, desc:l=>`+${(l*1.5).toFixed(1)}/s shield regen` },
    { id:'f_save',  branch:'Fortitude',  name:'Failsafe',       icon:'♻️', max:3,  cost:4, req:'f_regen',reqLvl:2, desc:l=>`a breach no longer drops a wave (${l}/3 charges/wave)` },
    // Command — economy & utility
    { id:'c_credit',branch:'Command',    name:'Salvage Drones', icon:'💰', max:10, cost:1, req:null,     reqLvl:0, desc:l=>`+${l*8}% credits` },
    { id:'c_xp',    branch:'Command',    name:'Databanks',      icon:'📈', max:10, cost:1, req:null,     reqLvl:0, desc:l=>`+${l*8}% XP` },
    { id:'c_cd',    branch:'Command',    name:'Capacitors',     icon:'🔌', max:5,  cost:2, req:'c_credit',reqLvl:2, desc:l=>`-${l*8}% ability cooldowns` },
    { id:'c_drone', branch:'Command',    name:'Wing Drones',    icon:'🚁', max:5,  cost:4, req:'c_cd',   reqLvl:1, desc:l=>`+${l*8}% total DPS from escort drones` },
  ];
  function skillLvl(state, id) { return (state.skills && state.skills[id]) || 0; }
  function skillReqMet(state, sk) { return !sk.req || skillLvl(state, sk.req) >= (sk.reqLvl || 1); }

  /* ── Core (prestige) upgrades — repeatable tracks + milestones ── */
  const CORE_TRACKS = [
    { id:'k_reactor', name:'Reactor Core', icon:'⚛️', base:1, inc:1, fmt:l=>`+${l*12}% turret damage (×${(1+l*0.12).toFixed(2)})`, mul:l=>1+l*0.12 },
    { id:'k_aegis',   name:'Aegis Field',  icon:'🛡️', base:1, inc:1, fmt:l=>`+${l*15}% max shield (×${(1+l*0.15).toFixed(2)})`,   mul:l=>1+l*0.15 },
    { id:'k_avarice', name:'Avarice',      icon:'💎', base:1, inc:1, fmt:l=>`+${l*25}% credits (×${(1+l*0.25).toFixed(2)})`,       mul:l=>1+l*0.25 },
    { id:'k_insight', name:'Insight',      icon:'🧠', base:1, inc:1, fmt:l=>`+${l*20}% XP (×${(1+l*0.20).toFixed(2)})`,            mul:l=>1+l*0.20 },
  ];
  function coreTrackLvl(state, id) { return (state.coreLevels && state.coreLevels[id]) || 0; }
  function coreTrackCost(track, lvl) { return track.base + track.inc * lvl; }
  function coreTrackMul(state, id) { const t = CORE_TRACKS.find(c => c.id === id); return t ? t.mul(coreTrackLvl(state, id)) : 1; }

  const CORE_MILESTONES = [
    { id:'m_start10', name:'Forward Base',    icon:'🚩', cost:3,  desc:'Reboots start at wave 10',  apply:s => s.coreStartWave = Math.max(s.coreStartWave||0, 10) },
    { id:'m_nova',    name:'Nova Lance',      icon:'🌟', cost:5,  desc:'Unlock the Nova ability (wipes the screen)', apply:s => s.novaUnlocked = true },
    { id:'m_offline', name:'Standby Routines',icon:'🌙', cost:6,  desc:'Offline defense earns 50% more', apply:s => s.offlineMul = (s.offlineMul||1) + 0.5 },
    { id:'m_start25', name:'Orbital Foothold',icon:'🛰️', cost:14, desc:'Reboots start at wave 25',  apply:s => s.coreStartWave = Math.max(s.coreStartWave||0, 25) },
    { id:'m_start50', name:'Vanguard',        icon:'⚓', cost:40, desc:'Reboots start at wave 50',  apply:s => s.coreStartWave = Math.max(s.coreStartWave||0, 50) },
  ];

  /* ── Active abilities (tap; cooldowns reduced by Capacitors) ──── */
  const ABILITIES = [
    { id:'over',   name:'Overcharge', icon:'⚡', cd:18, desc:'Massive burst to every enemy' },
    { id:'repair', name:'Repair',     icon:'🔧', cd:28, desc:'Restore 60% core shield' },
    { id:'nova',   name:'Nova',       icon:'🌟', cd:55, desc:'Vaporize all enemies on screen', needs:s => s.novaUnlocked },
  ];

  /* ── State ─────────────────────────────────────────────────── */
  let S = null, tickFn = null, autosaveTimer = null;
  // Live combat (transient, rebuilt on enter — never saved)
  let enemies = [], fireTimer = 0, spawnTimer = 0, spawnLeft = 0, invuln = 0;
  let failsafeLeft = 0;            // Failsafe charges remaining this wave
  let cd = { over: 0, repair: 0, nova: 0 };
  let renderThrottle = 0, nextEnemyId = 1;

  function defaultState() {
    return {
      credits:      0,
      totalCredits: 0,
      allTimeCredits: 0,
      kills:        0,
      taps:         0,
      wave:         1,
      maxWave:      0,           // this-run best (drives Reboot payout)
      maxWaveEver:  0,           // all-time best
      bosses:       0,
      reboots:      0,
      // RPG layer (persists through Reboot)
      level:        1,
      xp:           0,
      skillPoints:  0,
      skills:       {},          // skillId -> level
      // Prestige layer
      cores:        0,
      allTimeCores: 0,
      coreLevels:   {},          // repeatable core track id -> level
      coreUpgrades: {},          // one-time milestone id -> true
      coreStartWave:0,
      novaUnlocked: false,
      offlineMul:   1,
      // Turret upgrade levels (reset on Reboot)
      turret:       { dmg:0, rate:0, crit:0, critd:0, multi:0, shield:0, regen:0 },
      shield:       null,        // current shield (set on enter)
      savedAt:      Date.now(),
    };
  }

  /* ── XP / levelling ────────────────────────────────────────── */
  function xpForLevel(l) { return Math.floor(40 * Math.pow(l, 1.7)); }
  function grantXp(amount) {
    S.xp += amount;
    let leveled = 0;
    while (S.xp >= xpForLevel(S.level)) {
      S.xp -= xpForLevel(S.level);
      S.level++;
      S.skillPoints++;
      leveled++;
    }
    if (leveled) {
      Toast.show('🎖️', 'Level ' + S.level + '!', `+${leveled} skill point${leveled>1?'s':''} to spend`);
      Haptics.vibrate([40, 30, 60]);
      checkAchievements();
    }
  }

  /* ── Computed turret stats ─────────────────────────────────── */
  function levelDmgMul(state) { return 1 + 0.005 * (state.level - 1); }   // small per-level reward
  function turretDamage(state) {
    const d = turretDef('dmg');
    const base = d.base + state.turret.dmg * d.per;
    const skill = 1 + 0.06 * skillLvl(state, 'b_dmg');
    return (base * skill * coreTrackMul(state, 'k_reactor') * levelDmgMul(state));
  }
  function fireRate(state) {
    const d = turretDef('rate');
    let v = d.base + state.turret.rate * d.per + 0.10 * skillLvl(state, 'e_rate') + 0.14 * skillLvl(state, 'e_haste');
    return Math.min(d.max, v);
  }
  function critChance(state) {
    const d = turretDef('crit');
    return Math.min(75, d.base + state.turret.crit * d.per + 3 * skillLvl(state, 'b_crit'));
  }
  function critPower(state) {
    const d = turretDef('critd');
    return (d.base + state.turret.critd * d.per + 20 * skillLvl(state, 'b_critd')) / 100; // as multiplier (1.5 = +50%)
  }
  function targets(state) {
    const d = turretDef('multi');
    return d.base + state.turret.multi * d.per + skillLvl(state, 'b_multi') + skillLvl(state, 'e_pierce');
  }
  function maxShield(state) {
    const d = turretDef('shield');
    const base = d.base + state.turret.shield * d.per;
    return Math.floor(base * (1 + 0.08 * skillLvl(state, 'f_shield')) * coreTrackMul(state, 'k_aegis'));
  }
  function shieldRegen(state) {
    const d = turretDef('regen');
    return d.base + state.turret.regen * d.per + 1.5 * skillLvl(state, 'f_regen');
  }
  function enemySlow(state) { return Math.min(0.30, 0.03 * skillLvl(state, 'f_slow')); }
  function droneMul(state) { return 1 + 0.08 * skillLvl(state, 'c_drone'); }
  function creditMul(state) { return (1 + 0.08 * skillLvl(state, 'c_credit')) * coreTrackMul(state, 'k_avarice'); }
  function xpMul(state) { return (1 + 0.08 * skillLvl(state, 'c_xp')) * coreTrackMul(state, 'k_insight'); }
  function abilityCd(state, base) { return base * (1 - 0.08 * skillLvl(state, 'c_cd')); }
  // Effective single-target DPS (display + offline sim)
  function turretDps(state) {
    const cc = critChance(state) / 100;
    const critMul = 1 + cc * (critPower(state) - 1);
    return turretDamage(state) * fireRate(state) * Math.max(1, targets(state)) * critMul * droneMul(state);
  }

  /* ── Enemy stats for a wave ────────────────────────────────── */
  function enemyHp(wave, boss) {
    const sec = sectorFor(wave);
    const hp = 12 * Math.pow(1.155, wave - 1) * sec.hpMod;
    return Math.max(1, Math.floor(hp * (boss ? 9 : 1)));
  }
  function enemyReward(wave, boss) {
    const r = 5 * Math.pow(1.125, wave - 1);
    return Math.max(1, Math.floor(r * (boss ? 12 : 1) * creditMul(S)));
  }
  function enemyXpReward(wave, boss) {
    const x = 4 * Math.pow(1.075, wave - 1);
    return Math.max(1, Math.floor(x * (boss ? 10 : 1) * xpMul(S)));
  }
  function enemyDamage(wave, boss) {
    const sec = sectorFor(wave);
    const dmg = 9 * Math.pow(1.135, wave - 1) * sec.atkMod;
    return Math.max(1, Math.floor(dmg * (boss ? 2.5 : 1)));
  }
  function enemyCount(wave) { return isBossWave(wave) ? 1 : 7 + Math.floor((wave - 1) / 4); }

  /* ── Wave control ──────────────────────────────────────────── */
  function startWave(wave) {
    enemies = [];
    spawnLeft = enemyCount(wave);
    spawnTimer = 0;
    fireTimer = 0;
    failsafeLeft = skillLvl(S, 'f_save');
  }
  function spawnEnemy() {
    const wave = S.wave;
    const boss = isBossWave(wave) && spawnLeft === 1; // the final one on a boss wave is the boss
    const sec  = sectorFor(wave);
    const icon = boss ? sec.boss : sec.enemies[Math.floor(Math.random() * sec.enemies.length)];
    const hp   = enemyHp(wave, boss);
    const baseSpd = (1 / LANE_TIME) * sec.spdMod * (boss ? 0.55 : (0.85 + Math.random() * 0.4));
    enemies.push({
      id: nextEnemyId++, icon, boss,
      hp, maxHp: hp,
      pos: 0, lane: 12 + Math.random() * 66,         // horizontal % for visual spread
      spd: baseSpd,
      reward: enemyReward(wave, boss),
      xp: enemyXpReward(wave, boss),
      dmg: enemyDamage(wave, boss),
      flash: 0,
    });
  }

  function onEnemyKilled(e) {
    S.credits      += e.reward;
    S.totalCredits += e.reward;
    S.allTimeCredits = (S.allTimeCredits || 0) + e.reward;
    S.kills++;
    grantXp(e.xp);
    if (e.boss) {
      S.bosses++;
      AchievementSystem.unlock('df_boss');
    }
    checkAchievements();
  }

  function onWaveCleared() {
    const wave = S.wave;
    if (wave > (S.maxWave || 0)) S.maxWave = wave;
    if (wave > (S.maxWaveEver || 0)) S.maxWaveEver = wave;
    // Wave-clear bonus credits
    const bonus = Math.floor(enemyReward(wave, false) * 4);
    S.credits += bonus; S.totalCredits += bonus; S.allTimeCredits = (S.allTimeCredits || 0) + bonus;
    if (isBossWave(wave)) {
      const sec = sectorFor(wave + 1);
      Toast.show('🛰️', 'Sector cleared!', `Entering ${sec.name}`, true);
      Haptics.vibrate([50, 40, 90]);
    }
    S.wave++;
    checkAchievements();
    startWave(S.wave);
  }

  function coreBreach() {
    if (failsafeLeft > 0) {                       // Failsafe absorbs the breach
      failsafeLeft--;
      S.shield = maxShield(S) * 0.5;
      invuln = 1.5;
      enemies = enemies.filter(e => e.pos < 0.7);
      Toast.show('♻️', 'Failsafe!', 'Breach contained — wave held');
      return;
    }
    S.shield = maxShield(S);
    invuln = 2.5;
    enemies = [];
    const drop = isBossWave(S.wave) ? 1 : 1;
    S.wave = Math.max(1, (S.coreStartWave && S.wave > S.coreStartWave ? S.coreStartWave : 1), S.wave - drop);
    // (start-wave floor only applies if you'd drop below it)
    if (S.coreStartWave && S.wave < S.coreStartWave && S.maxWave >= S.coreStartWave) S.wave = S.coreStartWave;
    Toast.show('💥', 'Core breach!', 'Shield down — fell back to wave ' + S.wave);
    Haptics.vibrate([100, 60, 100]);
    startWave(S.wave);
  }

  /* ── Combat tick ───────────────────────────────────────────── */
  function damageEnemy(e, dmg, isCrit) {
    e.hp -= dmg;
    e.flash = 0.12;
    if (e.hp <= 0) return true;
    return false;
  }
  function fireVolley() {
    if (!enemies.length) return;
    // Target the frontmost (closest to core) enemies
    const sorted = enemies.slice().sort((a, b) => b.pos - a.pos);
    const n = Math.max(1, Math.round(targets(S)));
    const dmg0 = turretDamage(S) * droneMul(S);
    for (let i = 0; i < n && i < sorted.length; i++) {
      const e = sorted[i];
      const isCrit = Math.random() * 100 < critChance(S);
      const dmg = Math.max(1, Math.floor(dmg0 * (isCrit ? critPower(S) : 1)));
      damageEnemy(e, dmg, isCrit);
    }
  }

  tickFn = function(dt) {
    if (!S) return;
    if (invuln > 0) invuln = Math.max(0, invuln - dt);
    // Cooldowns
    cd.over   = Math.max(0, cd.over   - dt);
    cd.repair = Math.max(0, cd.repair - dt);
    cd.nova   = Math.max(0, cd.nova   - dt);

    // Spawning
    if (spawnLeft > 0) {
      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        spawnEnemy();
        spawnLeft--;
        spawnTimer = isBossWave(S.wave) ? 0 : Math.max(0.45, 1.25 - S.wave * 0.004);
      }
    }

    // Turret auto-fire
    fireTimer += dt;
    const interval = 1 / fireRate(S);
    let guard = 0;
    while (fireTimer >= interval && guard++ < 20) { fireTimer -= interval; fireVolley(); }

    // Resolve deaths + movement
    const slow = 1 - enemySlow(S);
    let breached = false;
    for (const e of enemies) {
      if (e.flash > 0) e.flash = Math.max(0, e.flash - dt);
      e.pos += e.spd * slow * dt;
      if (e.pos >= 1) {                       // reached the core
        if (invuln <= 0) {
          S.shield -= e.dmg;
          if (S.shield <= 0) breached = true;
        }
        e.dead = true;
      }
    }
    // Remove killed/arrived
    let killedReward = false;
    enemies = enemies.filter(e => {
      if (e.dead) return false;
      if (e.hp <= 0) { onEnemyKilled(e); killedReward = true; return false; }
      return true;
    });

    // Shield regen
    const ms = maxShield(S);
    if (S.shield < ms) S.shield = Math.min(ms, S.shield + shieldRegen(S) * dt);

    if (breached) { coreBreach(); }
    else if (spawnLeft === 0 && enemies.length === 0) { onWaveCleared(); }

    // Throttled render
    renderThrottle += dt;
    if (renderThrottle >= 0.08) {
      renderThrottle = 0;
      if (document.getElementById('screen-defense').classList.contains('active')) {
        renderLane(); renderHud();
        if (activeTab === 'turret') renderTurretTab();
      }
    }
  };

  /* ── Abilities ─────────────────────────────────────────────── */
  window.DefenseGame_ability = function(id, ev) {
    if (!S) return;
    if (id === 'over') {
      if (cd.over > 0) return;
      const dmg = turretDamage(S) * 25 * droneMul(S);
      enemies.forEach(e => { e.hp -= dmg; e.flash = 0.2; });
      enemies = enemies.filter(e => { if (e.hp <= 0) { onEnemyKilled(e); return false; } return true; });
      cd.over = abilityCd(S, 18);
      Toast.show('⚡', 'Overcharge!', 'Burst discharged');
      AchievementSystem.unlock('df_ability'); Haptics.vibrate([30, 20, 60]);
    } else if (id === 'repair') {
      if (cd.repair > 0) return;
      S.shield = Math.min(maxShield(S), S.shield + maxShield(S) * 0.6);
      cd.repair = abilityCd(S, 28);
      Toast.show('🔧', 'Repair', 'Shield reinforced');
      AchievementSystem.unlock('df_ability'); Haptics.vibrate(50);
    } else if (id === 'nova') {
      if (!S.novaUnlocked || cd.nova > 0) return;
      enemies.forEach(e => onEnemyKilled(e));
      enemies = [];
      cd.nova = abilityCd(S, 55);
      Toast.show('🌟', 'Nova!', 'Screen cleared');
      AchievementSystem.unlock('df_ability'); Haptics.vibrate([60, 40, 90]);
    }
    renderAbilities();
  };

  // Tap the lane: a manual reinforced shot at the frontmost enemy
  window.DefenseGame_tap = function(ev) {
    if (!S || !enemies.length) return;
    S.taps++;
    const front = enemies.reduce((a, b) => (b.pos > a.pos ? b : a));
    const isCrit = Math.random() * 100 < critChance(S);
    const dmg = Math.max(1, Math.floor(turretDamage(S) * 3 * (isCrit ? critPower(S) : 1)));
    front.hp -= dmg; front.flash = 0.2;
    if (ev) floatNum(ev.clientX, ev.clientY, (isCrit ? '💥' : '🎯') + Fmt.format(dmg), isCrit ? '#f5c542' : '#fff');
    Haptics.vibrate(20);
    if (front.hp <= 0) { enemies = enemies.filter(e => e !== front); onEnemyKilled(front); }
  };

  /* ── Buy handlers ──────────────────────────────────────────── */
  window.DefenseGame_upgrade = function(id) {
    const def = turretDef(id); if (!def) return;
    const lvl = S.turret[id];
    if (def.max !== undefined && lvl >= def.max) return;
    let n = buyAmount === 'max' ? statMaxAffordable(def, lvl, S.credits) : parseInt(buyAmount);
    if (def.max !== undefined) n = Math.min(n, def.max - lvl);
    if (n < 1) return;
    const cost = statCostBulk(def, lvl, n);
    if (S.credits < cost) return;
    S.credits -= cost;
    S.turret[id] += n;
    Haptics.vibrate(35);
    renderTurretTab(); renderHud();
  };

  window.DefenseGame_buySkill = function(id) {
    const sk = SKILLS.find(s => s.id === id); if (!sk) return;
    const lvl = skillLvl(S, id);
    if (lvl >= sk.max) return;
    if (!skillReqMet(S, sk)) { const r = SKILLS.find(s => s.id === sk.req); Toast.show('🔒', 'Locked', `Needs ${r?r.name:'previous skill'} Lv.${sk.reqLvl||1}`); return; }
    if ((S.skillPoints || 0) < sk.cost) { Toast.show('🎖️', 'Not enough points', `Need ${sk.cost} skill points`); return; }
    S.skillPoints -= sk.cost;
    if (!S.skills) S.skills = {};
    S.skills[id] = lvl + 1;
    AchievementSystem.unlock('df_skill');
    Toast.show(sk.icon, sk.name + ' → Lv.' + (lvl + 1), sk.desc(lvl + 1));
    Haptics.vibrate(40);
    if (S.shield > maxShield(S)) S.shield = maxShield(S);
    renderSkillTab(); renderHud(); renderAbilities();
  };

  window.DefenseGame_buyCoreTrack = function(id) {
    const t = CORE_TRACKS.find(c => c.id === id); if (!t) return;
    const lvl = coreTrackLvl(S, id);
    const cost = coreTrackCost(t, lvl);
    if ((S.cores || 0) < cost) { Toast.show('◈', 'Not enough Cores', `Need ${cost} Cores`); return; }
    S.cores -= cost;
    if (!S.coreLevels) S.coreLevels = {};
    S.coreLevels[id] = lvl + 1;
    Toast.show(t.icon, t.name + ' → Lv.' + (lvl + 1), t.fmt(lvl + 1));
    Haptics.vibrate([40, 30, 60]);
    renderCoreTab(); renderHud();
  };

  window.DefenseGame_buyCoreMilestone = function(id) {
    const m = CORE_MILESTONES.find(u => u.id === id); if (!m || S.coreUpgrades[id]) return;
    if ((S.cores || 0) < m.cost) { Toast.show('◈', 'Not enough Cores', `Need ${m.cost} Cores`); return; }
    S.cores -= m.cost;
    S.coreUpgrades[id] = true;
    m.apply(S);
    Toast.show(m.icon, m.name, m.desc);
    Haptics.vibrate([50, 40, 80]);
    renderCoreTab(); renderHud(); renderAbilities();
  };

  /* ── Reboot (prestige) ─────────────────────────────────────── */
  function coresForWave(maxWave) {
    if (maxWave < PRESTIGE_WAVE) return 0;
    return Math.max(1, Math.floor(Math.pow(maxWave / 10, 1.45)));
  }
  window.DefenseGame_reboot = function() {
    if (S.maxWave < PRESTIGE_WAVE) { Toast.show('⚠️', 'Not yet', `Reach wave ${PRESTIGE_WAVE} this run to Reboot.`); return; }
    const gain = coresForWave(S.maxWave);
    Modal.show({
      title: '⚛️ Reboot Reactor',
      body: `Reset your <b>credits, turret upgrades and wave</b> — keep your <b>level, skills and Cores</b>.<br><br>
             Gain <strong class="text-accent">${gain} Cores ◈</strong> for reaching wave <strong>${S.maxWave}</strong>.<br>
             <span class="text-muted" style="font-size:13px">You'll restart near wave ${Math.max(1, S.coreStartWave || 1)}. Push past wave ${S.maxWave} next run for an even bigger payout.</span>`,
      actions: [
        { label: 'Cancel', cls: '' },
        { label: '⚛️ Reboot', cls: 'btn-primary', fn: () => {
          const keep = {
            level: S.level, xp: S.xp, skillPoints: S.skillPoints, skills: S.skills,
            cores: (S.cores || 0) + gain, allTimeCores: (S.allTimeCores || 0) + gain,
            coreLevels: S.coreLevels, coreUpgrades: S.coreUpgrades, coreStartWave: S.coreStartWave,
            novaUnlocked: S.novaUnlocked, offlineMul: S.offlineMul,
            reboots: S.reboots + 1, maxWaveEver: S.maxWaveEver,
            kills: S.kills, allTimeCredits: S.allTimeCredits, bosses: S.bosses,
          };
          S = Object.assign(defaultState(), keep);
          S.wave = Math.max(1, S.coreStartWave || 1);
          S.maxWave = Math.max(0, S.wave - 1);
          S.shield = maxShield(S);
          AchievementSystem.unlock('df_reboot');
          if (S.reboots >= 5) AchievementSystem.unlock('df_reboot5');
          Toast.show('⚛️', 'Reactor rebooted!', `+${gain} Cores · ${S.cores} to spend`);
          startWave(S.wave);
          renderAll();
        } }
      ]
    });
  };

  /* ── Achievements ──────────────────────────────────────────── */
  function registerAchievements() {
    AchievementSystem.register('df_wave10',  '🛰️','First Contact',   'Reach wave 10.',              'Survive 10 waves');
    AchievementSystem.register('df_wave50',  '🚀','Line Holder',      'Reach wave 50.',              'Survive 50 waves');
    AchievementSystem.register('df_wave100', '🌌','Deep Space',       'Reach wave 100.',             'Push past 100');
    AchievementSystem.register('df_wave250', '✨','Star Captain',     'Reach wave 250.',             'Push past 250');
    AchievementSystem.register('df_complete','🏆','Singularity',      'Reach wave 500 — full clear.','The long haul');
    AchievementSystem.register('df_boss',    '👾','Boss Slayer',      'Destroy a sector boss.',      'Clear wave 10');
    AchievementSystem.register('df_lvl10',   '🎖️','Veteran',          'Reach level 10.',             'Gain XP from kills');
    AchievementSystem.register('df_lvl50',   '🎓','Commander',        'Reach level 50.',             'Keep levelling');
    AchievementSystem.register('df_kill1k',  '💀','Exterminator',     'Destroy 1,000 hostiles.',     '1,000 kills');
    AchievementSystem.register('df_skill',   '⭐','Specialist',       'Learn your first skill.',     'Level up for points');
    AchievementSystem.register('df_ability', '🔋','Hands On',         'Fire an active ability.',     'Tap an ability');
    AchievementSystem.register('df_reboot',  '⚛️','Reborn Reactor',   'Reboot for the first time.',  'Reach wave 50');
    AchievementSystem.register('df_reboot5', '💫','Serial Rebooter',  'Reboot 5 times.',             '5 reboots');
  }
  function checkAchievements() {
    if (S.maxWaveEver >= 10)  AchievementSystem.unlock('df_wave10');
    if (S.maxWaveEver >= 50)  AchievementSystem.unlock('df_wave50');
    if (S.maxWaveEver >= 100) AchievementSystem.unlock('df_wave100');
    if (S.maxWaveEver >= 250) AchievementSystem.unlock('df_wave250');
    if (S.maxWaveEver >= 500) AchievementSystem.unlock('df_complete');
    if (S.level >= 10) AchievementSystem.unlock('df_lvl10');
    if (S.level >= 50) AchievementSystem.unlock('df_lvl50');
    if (S.kills >= 1000) AchievementSystem.unlock('df_kill1k');
    if (S.reboots >= 1) AchievementSystem.unlock('df_reboot');
    if (S.reboots >= 5) AchievementSystem.unlock('df_reboot5');
  }

  /* ── Offline progress ──────────────────────────────────────── */
  function applyOfflineProgress(save) {
    const elapsed = Math.min((Date.now() - (save.savedAt || Date.now())) / 1000, OFFLINE_CAP);
    if (elapsed < 60) return;
    const d = save.data;
    const wave = d.wave || 1;
    const dps  = turretDps(d);
    const hp   = enemyHp(wave, false);
    const killsPerSec = Math.min(dps / hp, fireRate(d) * Math.max(1, targets(d)));
    const kills = Math.floor(killsPerSec * elapsed);
    if (kills < 1) return;
    const perKillCredit = Math.max(1, Math.floor(5 * Math.pow(1.125, wave - 1) * creditMul(d)));
    const perKillXp     = Math.max(1, Math.floor(4 * Math.pow(1.075, wave - 1) * xpMul(d)));
    const off = (d.offlineMul || 1);
    const credits = Math.floor(kills * perKillCredit * off);
    const xp      = Math.floor(kills * perKillXp * off);
    d.credits = (d.credits || 0) + credits;
    d.totalCredits = (d.totalCredits || 0) + credits;
    d.allTimeCredits = (d.allTimeCredits || 0) + credits;
    d.kills = (d.kills || 0) + kills;
    // Apply XP (with level-ups) directly on the raw save
    d.level = d.level || 1; d.xp = d.xp || 0; d.skillPoints = d.skillPoints || 0;
    d.xp += xp;
    while (d.xp >= xpForLevel(d.level)) { d.xp -= xpForLevel(d.level); d.level++; d.skillPoints++; }
    if (!Settings.get('offlineModal')) {
      Toast.show('🛰️', 'Welcome back', `Auto-defense: ${Fmt.format(kills)} kills · +${Fmt.format(credits)} ₡`);
      return;
    }
    Modal.show({
      title: '🛰️ Welcome back, Commander',
      body: `Your turret held the line for <strong>${Fmt.time(elapsed)}</strong>.<br>
             Destroyed <strong>${Fmt.format(kills)}</strong> hostiles, banking <strong class="text-gold">${Fmt.format(credits)} ₡</strong> and <strong class="text-accent">${Fmt.format(xp)} XP</strong>.`,
      actions: [{ label: '🎯 Resume', cls: 'btn-primary' }]
    });
  }

  /* ── Load / save ───────────────────────────────────────────── */
  function loadGame() {
    SaveSystem.registerMigrations(GAME_ID, {});
    const save = SaveSystem.read(GAME_ID, SAVE_VERSION);
    if (save) {
      applyOfflineProgress(save);
      S = Object.assign(defaultState(), save.data);
    } else {
      S = defaultState();
    }
    // Normalise nested objects from older/partial saves
    S.turret      = Object.assign({ dmg:0, rate:0, crit:0, critd:0, multi:0, shield:0, regen:0 }, S.turret || {});
    S.skills      = S.skills || {};
    S.coreLevels  = S.coreLevels || {};
    S.coreUpgrades= S.coreUpgrades || {};
    if (typeof S.level !== 'number' || S.level < 1) S.level = 1;
    if (S.shield === null || S.shield === undefined || S.shield > maxShield(S)) S.shield = maxShield(S);
    S.savedAt = Date.now();
  }
  function saveGame() { S.savedAt = Date.now(); SaveSystem.write(GAME_ID, SAVE_VERSION, S); }

  /* ── Render: HUD + lane ────────────────────────────────────── */
  function renderHud() {
    const info = document.getElementById('df-wave-info');
    if (info) {
      const sec = sectorFor(S.wave);
      info.innerHTML = `${sec.boss} ${sec.name} · Wave ${S.wave}${isBossWave(S.wave) ? ' · <span style="color:var(--gold)">BOSS</span>' : ''} · best ${S.maxWaveEver}`;
    }
    const res = document.getElementById('df-resources');
    if (res) {
      let extra = '';
      if ((S.cores || 0) > 0 || S.reboots > 0) extra += ` <span style="color:var(--accent)">◈ ${Fmt.format(S.cores||0)}</span>`;
      res.innerHTML = `<span class="text-gold">₡ ${Fmt.format(Math.floor(S.credits))}</span>`
        + ` <span style="color:var(--text2)">·</span> <span class="text-green">⚔️ ${Fmt.format(turretDps(S),0)} DPS</span>`
        + extra;
    }
    // XP / level bar
    const lvlEl = document.getElementById('df-level');
    if (lvlEl) {
      const need = xpForLevel(S.level);
      const pct = Math.min(100, S.xp / need * 100);
      lvlEl.innerHTML = `<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text2)">
          <span>🎖️ Level ${S.level}${S.skillPoints?` · <span class="text-accent">${S.skillPoints} SP</span>`:''}</span>
          <span>${Fmt.format(S.xp,0)} / ${Fmt.format(need,0)} XP</span></div>
        <div class="progress-bar" style="height:5px;margin-top:2px"><div class="progress-fill" style="width:${pct}%;background:var(--accent)"></div></div>`;
    }
    // Shield bar
    const ms = maxShield(S);
    const sb = document.getElementById('df-shield-bar');
    const st = document.getElementById('df-shield-text');
    if (sb) { sb.style.width = Math.max(0, S.shield / ms * 100) + '%'; sb.className = 'progress-fill ' + (S.shield/ms < 0.3 ? '' : 'green'); if (S.shield/ms<0.3) sb.style.background='var(--red)'; else sb.style.background=''; }
    if (st) st.textContent = `🛡️ ${Fmt.format(Math.ceil(Math.max(0,S.shield)))} / ${Fmt.format(ms)}`;
  }

  function renderLane() {
    const lane = document.getElementById('df-lane');
    if (!lane) return;
    let html = '';
    for (const e of enemies) {
      const top = Math.min(90, e.pos * 90);
      const hpPct = Math.max(0, e.hp / e.maxHp * 100);
      const scale = e.boss ? 1.7 : 1;
      const glow = e.flash > 0 ? 'filter:drop-shadow(0 0 6px #fff) brightness(1.6);' : (e.boss ? 'filter:drop-shadow(0 0 8px var(--gold));' : '');
      html += `<div class="df-enemy" style="top:${top}%;left:${e.lane}%;transform:translate(-50%,0) scale(${scale})">
          <div class="df-enemy-icon" style="${glow}">${e.icon}</div>
          <div class="df-ehp"><div style="width:${hpPct}%"></div></div>
        </div>`;
    }
    lane.innerHTML = html;
  }

  function renderAbilities() {
    const row = document.getElementById('df-abilities');
    if (!row) return;
    let html = '';
    ABILITIES.forEach(a => {
      if (a.needs && !a.needs(S)) return;
      const c = cd[a.id] || 0;
      const ready = c <= 0;
      const total = abilityCd(S, a.cd);
      html += `<button class="df-ab ${ready?'ready':'cooling'}" onclick="DefenseGame_ability('${a.id}',event)" title="${a.desc}">
          <span style="font-size:18px">${a.icon}</span>
          <span style="font-size:10px">${ready ? a.name : Math.ceil(c)+'s'}</span>
          ${ready ? '' : `<span class="df-ab-fill" style="height:${Math.min(100,c/total*100)}%"></span>`}
        </button>`;
    });
    row.innerHTML = html;
  }

  /* ── Render: tabs ──────────────────────────────────────────── */
  let activeTab = localStorage.getItem('df_tab') || 'turret';
  let buyAmount = localStorage.getItem('df_buyAmt') || '1';

  window.DefenseGame_tab = function(tab, btn) {
    activeTab = tab; localStorage.setItem('df_tab', tab);
    document.querySelectorAll('#screen-defense .tab-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderAll();
  };
  function syncTabButtons() {
    document.querySelectorAll('#screen-defense .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === activeTab));
  }
  window.DefenseGame_setBuyAmount = function(amt) { buyAmount = amt; localStorage.setItem('df_buyAmt', amt); renderTurretTab(); };

  function turretValue(state, id) {
    const def = turretDef(id);
    let v;
    if (id === 'dmg')   v = turretDamage(state);
    else if (id === 'rate')  v = fireRate(state);
    else if (id === 'crit')  v = critChance(state);
    else if (id === 'critd') v = Math.round(critPower(state) * 100);
    else if (id === 'multi') v = Math.round(targets(state));
    else if (id === 'shield')v = maxShield(state);
    else if (id === 'regen') v = shieldRegen(state);
    return def.fmt ? def.fmt(v) : Fmt.format(v, 0);
  }

  function renderTurretTab() {
    const list = document.getElementById('df-content-area');
    if (!list || activeTab !== 'turret') return;
    const bar = document.getElementById('df-subbar');
    if (bar) {
      bar.style.display = 'flex';
      const amts = [['1','×1'],['10','×10'],['max','Max']];
      bar.innerHTML = '<span class="buy-amt-label">Buy</span>' + amts.map(([v,l]) =>
        `<button class="buy-amt-btn ${buyAmount===v?'active':''}" onclick="DefenseGame_setBuyAmount('${v}')">${l}</button>`).join('');
    }
    let html = '<div style="padding:10px;display:flex;flex-direction:column;gap:8px">';
    TURRET.forEach(def => {
      const lvl = S.turret[def.id];
      const atMax = def.max !== undefined && lvl >= def.max;
      let n = buyAmount === 'max' ? statMaxAffordable(def, lvl, S.credits) : parseInt(buyAmount);
      if (def.max !== undefined) n = Math.min(n, def.max - lvl);
      n = Math.max(1, n);
      const cost = statCostBulk(def, lvl, n);
      const canAfford = S.credits >= cost && !atMax;
      const cur = turretValue(S, def.id);
      const tmp = JSON.parse(JSON.stringify(S)); tmp.turret[def.id] += (atMax ? 0 : n);
      const next = turretValue(tmp, def.id);
      const preview = (!atMax && next !== cur) ? ` <span style="color:var(--green)">→ ${next}</span>` : '';
      html += `<button class="upgrade-item ${canAfford ? 'can-buy' : 'locked'}" onclick="DefenseGame_upgrade('${def.id}')">
          <div class="upg-icon">${def.icon}</div>
          <div class="upg-info">
            <div class="upg-name">${def.name} <span style="color:var(--text2);font-size:12px">Lv.${lvl}${def.max?'/'+def.max:''}</span></div>
            <div style="font-size:12px;color:var(--text2)">${cur}${preview}</div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div class="text-gold" style="font-size:13px">${atMax ? 'MAX' : '₡ '+Fmt.format(cost)}</div>
            <div style="font-size:11px;color:var(--green)">${atMax ? '' : '+'+n+' lvl'+(n>1?'s':'')}</div>
          </div>
        </button>`;
    });
    html += '</div>';
    list.innerHTML = html;
  }

  function renderSkillTab() {
    const list = document.getElementById('df-content-area');
    if (!list || activeTab !== 'skills') return;
    const branches = {};
    SKILLS.forEach(s => { (branches[s.branch] = branches[s.branch] || []).push(s); });
    let html = `<div style="padding:10px;display:flex;flex-direction:column;gap:8px">
      <div style="font-size:13px">🎖️ Skill Points: <span class="text-accent" style="font-weight:700">${S.skillPoints || 0}</span>
      <span style="color:var(--text2);font-size:12px"> · earn 1 per level. Higher tiers need points in the skill above.</span></div>`;
    Object.keys(branches).forEach(br => {
      html += `<div class="menu-section-title" style="padding:6px 2px 2px">${br}</div>`;
      branches[br].forEach(sk => {
        const lvl = skillLvl(S, sk.id);
        const maxed = lvl >= sk.max;
        const reqMet = skillReqMet(S, sk);
        const aff = (S.skillPoints || 0) >= sk.cost && reqMet && !maxed;
        const reqSk = sk.req ? SKILLS.find(s => s.id === sk.req) : null;
        const descLvl = maxed ? lvl : Math.max(lvl, 1);
        const cls = maxed ? '' : (aff ? 'can-buy' : 'locked');
        html += `<button class="upgrade-item ${cls}" ${maxed ? '' : `onclick="DefenseGame_buySkill('${sk.id}')"`} style="${lvl>0&&!aff?'border-color:var(--accent)':''}">
            <div class="upg-icon">${sk.icon}</div>
            <div class="upg-info">
              <div class="upg-name">${sk.name} <span style="color:var(--text2);font-size:12px">Lv.${lvl}/${sk.max}</span></div>
              <div style="font-size:12px;color:var(--text2)">${sk.desc(descLvl)}${!maxed && lvl>0 ? ` <span style="color:var(--green)">→ ${sk.desc(lvl+1)}</span>` : ''}</div>
              ${!reqMet ? `<div class="ach-hint" style="color:var(--text2)">🔒 Needs ${reqSk?reqSk.name:'previous skill'} Lv.${sk.reqLvl||1}</div>` : ''}
            </div>
            <div class="text-accent" style="font-size:13px;font-weight:600;flex-shrink:0">${maxed ? 'MAX' : '🎖️ ' + sk.cost}</div>
          </button>`;
      });
    });
    html += '</div>';
    list.innerHTML = html;
  }

  function renderCoreTab() {
    const list = document.getElementById('df-content-area');
    if (!list || activeTab !== 'core') return;
    const canReboot = S.maxWave >= PRESTIGE_WAVE;
    const reward = coresForWave(S.maxWave);
    let html = `<div style="padding:10px;display:flex;flex-direction:column;gap:10px">
      <div style="background:var(--bg2);border:1px solid ${canReboot?'var(--accent)':'var(--border)'};border-radius:var(--radius-sm);padding:12px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-size:15px;font-weight:600">⚛️ Reboot Reactor</div>
            <div style="font-size:12px;color:var(--text2);margin-top:2px">Reset credits, turret & wave — keep level, skills & Cores</div>
            <div style="font-size:12px;color:var(--text2)">This run's best wave: <b>${S.maxWave}</b> · Reboots: ${S.reboots}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:13px;color:var(--accent)">◈ ${Fmt.format(S.cores||0)} Cores</div>
            <div style="font-size:12px;color:var(--text2)">earned ${Fmt.format(S.allTimeCores||0)} total</div>
          </div>
        </div>
        <button class="btn btn-primary mt-8" style="${canReboot?'':'opacity:0.5'}" onclick="DefenseGame_reboot()">
          ${canReboot ? `⚛️ Reboot for +${reward} Cores` : `🔒 Reach wave ${PRESTIGE_WAVE} this run`}
        </button>
        <div style="font-size:11px;color:var(--text2);margin-top:6px">Cores scale with depth — push past wave ${S.maxWave || PRESTIGE_WAVE} next run for a bigger payout.</div>
      </div>
      <div style="font-size:12px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:0.06em;padding:4px 2px">Core Systems · repeatable</div>`;
    CORE_TRACKS.forEach(t => {
      const lvl = coreTrackLvl(S, t.id);
      const cost = coreTrackCost(t, lvl);
      const aff = (S.cores || 0) >= cost;
      html += `<button class="upgrade-item ${aff?'can-buy':'locked'}" onclick="DefenseGame_buyCoreTrack('${t.id}')">
          <div class="upg-icon">${t.icon}</div>
          <div class="upg-info">
            <div class="upg-name">${t.name} <span style="color:var(--text2);font-size:12px">Lv.${lvl}</span></div>
            <div style="font-size:12px;color:var(--text2)">${t.fmt(lvl)} <span style="color:var(--green)">→ ${t.fmt(lvl+1)}</span></div>
          </div>
          <div class="text-accent" style="font-size:13px;font-weight:600;flex-shrink:0">◈ ${cost}</div>
        </button>`;
    });
    html += '<div style="font-size:12px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:0.06em;padding:8px 2px 4px">Milestones · one-time</div>';
    CORE_MILESTONES.forEach(m => {
      const bought = S.coreUpgrades[m.id];
      const aff = (S.cores || 0) >= m.cost && !bought;
      html += `<button class="upgrade-item ${bought?'':(aff?'can-buy':'locked')}" onclick="DefenseGame_buyCoreMilestone('${m.id}')">
          <div class="upg-icon">${m.icon}</div>
          <div class="upg-info">
            <div class="upg-name">${m.name} ${bought?'<span style="color:var(--green);font-size:12px">✓</span>':''}</div>
            <div style="font-size:12px;color:var(--text2)">${m.desc}</div>
          </div>
          <div class="text-accent" style="font-size:13px;font-weight:600;flex-shrink:0">${bought?'Owned':'◈ '+m.cost}</div>
        </button>`;
    });
    html += '</div>';
    list.innerHTML = html;
  }

  function renderStatsTab() {
    const list = document.getElementById('df-content-area');
    if (!list || activeTab !== 'stats') return;
    const row = (a, b) => `<div class="stat-row"><span class="text-muted">${a}</span><span>${b}</span></div>`;
    list.innerHTML = `<div style="padding:12px;display:flex;flex-direction:column;gap:10px">
        ${row('Wave', S.wave + ' (best ' + S.maxWaveEver + ')')}
        ${row('Level', '<span class="text-accent">'+S.level+'</span>')}
        ${row('Turret DPS', '<span class="text-green">'+Fmt.format(turretDps(S),1)+'</span>')}
        ${row('Damage / shot', Fmt.format(turretDamage(S),0))}
        ${row('Fire rate', fireRate(S).toFixed(2)+'/s')}
        ${row('Crit', critChance(S).toFixed(0)+'% × '+Math.round(critPower(S)*100)+'%')}
        ${row('Multishot', Math.round(targets(S))+' targets')}
        ${row('Max shield', Fmt.format(maxShield(S),0)+' (+'+shieldRegen(S).toFixed(1)+'/s)')}
        ${row('Kills', Fmt.format(S.kills))}
        ${row('Bosses downed', Fmt.format(S.bosses||0))}
        ${row('Reboots', S.reboots)}
        ${row('Cores', '<span class="text-accent">◈ '+Fmt.format(S.cores||0)+'</span>')}
        ${row('All-time credits', '<span class="text-gold">₡ '+Fmt.format(S.allTimeCredits||0)+'</span>')}
      </div>`;
  }

  function renderAll() {
    if (!S) return;
    renderHud(); renderLane(); renderAbilities();
    const bar = document.getElementById('df-subbar');
    if (bar && activeTab !== 'turret') bar.style.display = 'none';
    if (activeTab === 'turret') renderTurretTab();
    else if (activeTab === 'skills') renderSkillTab();
    else if (activeTab === 'core') renderCoreTab();
    else if (activeTab === 'stats') renderStatsTab();
  }

  /* ── Help ──────────────────────────────────────────────────── */
  window.DefenseGame_help = function() {
    Modal.show({
      title: 'ℹ️ How Orbital Defense works',
      body: `
        <p>Your <b>turret</b> auto-fires at hostiles descending the lane. <b class="text-gold">Tap an enemy</b> for a reinforced manual shot.</p>
        <p class="mt-8">Each <b>wave</b> is a pack of enemies; wave 10/20/30… ends with a <b>boss</b> and advances the <b>sector</b>. If your <b>🛡️ core shield</b> hits zero you fall back a wave — keep it up with Shield/Regen upgrades and the <b>🔧 Repair</b> ability.</p>
        <p class="mt-8"><b class="text-gold">₡ Credits</b> upgrade the turret (reset on Reboot). Kills also grant <b class="text-accent">XP</b>; every <b>level</b> gives a <b>skill point</b> for the four <b>skill trees</b> (these persist forever).</p>
        <p class="mt-8"><b>⚡ Abilities</b> are tap-activated with cooldowns — Overcharge bursts the field, Repair restores shield, Nova (unlocked with Cores) wipes the screen.</p>
        <p class="mt-8"><b class="text-accent">⚛️ Reboot</b> at wave ${PRESTIGE_WAVE}+ trades your run for permanent <b>◈ Cores</b>. Spend them on repeatable Core Systems and one-time Milestones. Reach <b>wave 500</b> for the full clear — a long, grindy road.</p>
      `,
      actions: [{ label: 'Got it', cls: 'btn-primary' }]
    });
  };

  /* ── Build UI ──────────────────────────────────────────────── */
  function buildUI() {
    const el = document.getElementById('screen-defense');
    el.innerHTML = `
      <style>
        #df-main { display:flex; flex-direction:column; height:100%; }
        #df-combat { flex-shrink:0; background:var(--bg2); border-bottom:1px solid var(--border); }
        #df-topbar { padding:10px 12px 6px; }
        #df-wave-info { font-size:12px; color:var(--text2); }
        #df-resources { font-size:14px; font-weight:700; margin-top:3px; }
        #df-level { margin-top:6px; }
        #df-lane {
          position:relative; height:230px; margin:0 0 2px;
          background:
            radial-gradient(120% 80% at 50% 100%, rgba(124,106,247,0.12), transparent 60%),
            linear-gradient(180deg, #07070d 0%, #0d0d16 100%);
          overflow:hidden; cursor:crosshair;
        }
        .df-enemy { position:absolute; width:0; display:flex; flex-direction:column; align-items:center; pointer-events:none; }
        .df-enemy-icon { font-size:30px; line-height:1; }
        .df-ehp { width:34px; height:3px; background:rgba(255,255,255,0.18); border-radius:2px; margin-top:1px; overflow:hidden; }
        .df-ehp > div { height:100%; background:var(--red); }
        #df-turret { position:absolute; bottom:2px; left:50%; transform:translateX(-50%); font-size:40px; pointer-events:none; filter:drop-shadow(0 0 6px var(--accent)); }
        #df-shield-wrap { padding:6px 12px 4px; }
        #df-shield-text { font-size:11px; color:var(--text2); }
        #df-abilities { display:flex; gap:8px; padding:6px 12px 10px; }
        .df-ab { position:relative; overflow:hidden; flex:1; display:flex; flex-direction:column; align-items:center; gap:2px;
                 padding:6px 2px; border-radius:var(--radius-sm); border:1px solid var(--border); background:var(--bg3); color:var(--text); }
        .df-ab.ready { border-color:var(--accent); color:var(--text); }
        .df-ab.cooling { opacity:0.6; }
        .df-ab-fill { position:absolute; left:0; bottom:0; width:100%; background:rgba(124,106,247,0.25); }
        #df-content { flex:1; display:flex; flex-direction:column; min-height:0; }
        #df-content-area { flex:1; overflow-y:auto; }
        #df-subbar { display:none; align-items:center; gap:6px; padding:8px 10px; background:var(--bg2); border-bottom:1px solid var(--border); flex-shrink:0; }
        #screen-defense .buy-amt-label { font-size:12px; color:var(--text2); margin-right:2px; }
        #screen-defense .buy-amt-btn { padding:4px 12px; border-radius:var(--radius-sm); font-size:13px; font-weight:600; background:var(--bg3); border:1px solid var(--border); color:var(--text2); }
        #screen-defense .buy-amt-btn.active { background:var(--accent); border-color:var(--accent); color:#fff; }
        #screen-defense .upgrade-item.can-buy { border-color:var(--green); }
        #screen-defense .upgrade-item.can-buy:active { border-color:var(--accent); }
      </style>
      <div id="df-main">
        <div id="df-combat">
          <div id="df-topbar">
            <div id="df-wave-info"></div>
            <div id="df-resources"></div>
            <div id="df-level"></div>
          </div>
          <div id="df-lane" onclick="DefenseGame_tap(event)">
            <div id="df-turret">🛰️</div>
          </div>
          <div id="df-shield-wrap">
            <div class="progress-bar" style="height:9px"><div id="df-shield-bar" class="progress-fill green" style="width:100%"></div></div>
            <div id="df-shield-text" style="margin-top:2px"></div>
          </div>
          <div id="df-abilities"></div>
        </div>
        <div id="df-content">
          <div class="tab-bar" style="overflow-x:auto;white-space:nowrap;display:flex">
            <button class="tab-btn" data-tab="turret" style="min-width:74px" onclick="DefenseGame_tab('turret',this)">🔫 Turret</button>
            <button class="tab-btn" data-tab="skills" style="min-width:74px" onclick="DefenseGame_tab('skills',this)">🎖️ Skills</button>
            <button class="tab-btn" data-tab="core"   style="min-width:78px" onclick="DefenseGame_tab('core',this)">⚛️ Reactor</button>
            <button class="tab-btn" data-tab="stats"  style="min-width:70px" onclick="DefenseGame_tab('stats',this)">Stats</button>
          </div>
          <div id="df-subbar"></div>
          <div id="df-content-area"></div>
        </div>
      </div>`;
  }

  /* ── Register with Router ──────────────────────────────────── */
  Router.register('defense', {
    title: '🛰️ Orbital Defense',
    onHelp: () => DefenseGame_help(),
    onEnter: () => {
      loadGame();
      buildUI();
      registerAchievements();
      syncTabButtons();
      cd = { over: 0, repair: 0, nova: 0 };
      invuln = 0;
      startWave(S.wave);
      renderAll();
      checkAchievements();
      Ticker.add(tickFn);
      autosaveTimer = setInterval(() => saveGame(), AUTOSAVE_MS);
    },
    onLeave: () => {
      saveGame();
      Ticker.remove(tickFn);
      clearInterval(autosaveTimer);
      enemies = [];
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && document.getElementById('screen-defense')?.classList.contains('active')) saveGame();
  });
})(); // end DefenseGame
