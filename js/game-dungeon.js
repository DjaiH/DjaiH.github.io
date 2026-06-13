'use strict';
/* ════════════════════════════════════════════════════════════════
   IDLE DUNGEON GAME
   ════════════════════════════════════════════════════════════════ */
(function DungeonGame() {
  const GAME_ID      = 'dungeon';
  const SAVE_VERSION = 1;
  const AUTOSAVE_MS  = 30000;
  const OFFLINE_CAP  = 24 * 3600;

  /* ── Zone definitions (one zone = 10 floors). hpMod/atkMod give
        each zone a distinct feel; key is the guaranteed trophy that
        drops from that zone's Guardian (the floor-10/20/... boss). ── */
  const FLOOR_THEMES = [
    { name:'Whispering Forest', enemies:['🐺','🦊','🐗','🐻','🦌','🦅','🐝'], boss:'🐲', guardian:'🦁', key:'🍃', keyName:'Sylvan Sigil',  tip:'Beasts hunt in packs — steady damage wins.', hpMod:1.00, atkMod:1.00 },
    { name:'Hollow Caves',      enemies:['🦇','🕷️','🦂','🐍','🦎','🪲','🐛'], boss:'👹', guardian:'🦖', key:'💎', keyName:'Cave Heart',    tip:'Thick hides soak hits — invest in Attack.',  hpMod:1.25, atkMod:0.95 },
    { name:'Sunken Marsh',      enemies:['🐸','🦟','🐊','🪱','🐢','🦠'],       boss:'🐙', guardian:'🐊', key:'🫧', keyName:'Bog Pearl',     tip:'Venom stings — keep your HP high.',          hpMod:1.05, atkMod:1.30 },
    { name:'Cursed Castle',     enemies:['💀','🧟','👻','🧛','⚔️','🗡️','🛡️'], boss:'🧙', guardian:'👑', key:'🗝️', keyName:'Royal Seal',    tip:'The restless dead never tire.',              hpMod:1.35, atkMod:1.15 },
    { name:'Frozen Peaks',      enemies:['🐻‍❄️','🦣','🐧','🦭','🦅','🌬️'],     boss:'🦬', guardian:'🐻‍❄️', key:'❄️', keyName:'Frost Core',    tip:'The cold punishes the under-geared.',        hpMod:1.50, atkMod:1.20 },
    { name:'Molten Volcano',    enemies:['🔥','🌋','💥','🐉','😈','🦂'],       boss:'👺', guardian:'🐲', key:'🔥', keyName:'Ember Crown',   tip:'Everything hits harder in the heat.',        hpMod:1.40, atkMod:1.55 },
    { name:'Astral Void',       enemies:['🌑','⬛','🌀','👁️','🛸','☄️'],       boss:'🪐', guardian:'👾', key:'🌌', keyName:'Void Shard',    tip:'Reality bends — only power matters.',        hpMod:1.85, atkMod:1.55 },
    { name:'The Abyss',         enemies:['🕳️','👁️','🐙','🦑','🌫️','💀'],     boss:'🐉', guardian:'😱', key:'💀', keyName:'Abyssal Idol',  tip:'Only the strongest descend this far.',       hpMod:2.30, atkMod:1.90 },
  ];
  function zoneIndex(floor) { return Math.floor((floor - 1) / 10); }
  function themeFor(floor)  { return FLOOR_THEMES[zoneIndex(floor) % FLOOR_THEMES.length]; }
  // A Guardian stands on the last floor of each zone (floor 10, 20, 30 …)
  function isGuardianFloor(floor) { return floor % 10 === 0; }

  /* ── Stat upgrade costs ─────────────────────────────────────── */
  const STAT_DEFS = [
    { id:'atk',  name:'Attack',       icon:'⚔️',  base:10,  costBase:50,  costMul:1.15 },
    { id:'hp',   name:'Max HP',       icon:'❤️',  base:100, costBase:80,  costMul:1.12 },
    { id:'crit', name:'Crit Chance',  icon:'💥',  base:0,   costBase:200, costMul:1.20, max:50 },
    { id:'crit2',name:'Crit Damage',  icon:'🎯',  base:150, costBase:150, costMul:1.18, isPercent:true },
    { id:'spd',  name:'Attack Speed', icon:'⚡',  base:1,   costBase:300, costMul:1.22, max:5 },
  ];

  /* ── Soul upgrades (post-rebirth) ────────────────────────────
        One-time milestones plus three repeatable tracks so souls
        always have somewhere to go, run after run. ───────────────── */
  const SOUL_UPGRADES = [
    // One-time milestone unlocks
    { id:'su3', name:'Quick Start',    icon:'🚀', cost:3,  desc:'Start each rebirth at floor 5',  apply: s => s.soulStartFloor = Math.max(s.soulStartFloor||0, 5) },
    { id:'su5', name:'Lucky Strikes',  icon:'🍀', cost:4,  desc:'+10% Crit Chance permanently',   apply: s => s.soulCritBonus = (s.soulCritBonus||0) + 10 },
    { id:'su7', name:'Dungeon Master', icon:'👑', cost:12, desc:'Start each rebirth at floor 15', apply: s => s.soulStartFloor = Math.max(s.soulStartFloor||0, 15) },
    { id:'su8', name:'Soul Anchor',    icon:'⚓', cost:20, desc:'Start each rebirth at floor 30', apply: s => s.soulStartFloor = Math.max(s.soulStartFloor||0, 30) },
  ];
  // Repeatable soul tracks: cost rises with each level so souls keep mattering
  const SOUL_TRACKS = [
    { id:'st_dmg',  name:'Soul Forge',   icon:'⚔️', base:2, inc:1, per:0.08, fmt:l=>`+${l*8}% Damage (×${(1+l*0.08).toFixed(2)})`,  apply:(s,l)=> s.soulDmgMul  = l*0.08 },
    { id:'st_hp',   name:'Soul Ward',    icon:'🛡️', base:2, inc:1, per:0.10, fmt:l=>`+${l*10}% Max HP (×${(1+l*0.10).toFixed(2)})`, apply:(s,l)=> s.soulHpMul   = l*0.10 },
    { id:'st_gold', name:'Soul Greed',   icon:'💰', base:2, inc:1, per:0.15, fmt:l=>`+${l*15}% Gold (×${(1+l*0.15).toFixed(2)})`,   apply:(s,l)=> s.soulGoldMul = l*0.15 },
  ];
  function soulTrackLvl(state, id) { return (state.soulLevels && state.soulLevels[id]) || 0; }
  function soulTrackCost(track, lvl) { return track.base + track.inc * lvl; }
  // Re-apply all repeatable soul track bonuses from stored levels (call on load)
  function applySoulTracks(state) {
    if (!state.soulLevels) state.soulLevels = {};
    SOUL_TRACKS.forEach(t => t.apply(state, soulTrackLvl(state, t.id)));
  }

  /* ── Gear ───────────────────────────────────────────────────── */
  const GEAR_SLOTS  = ['weapon','armor','ring'];
  const GEAR_RARITY = [
    { name:'Common',    cls:'',       mul:1.0, color:'var(--common)' },
    { name:'Rare',      cls:'rare',   mul:1.45, color:'var(--rare)'   },
    { name:'Epic',      cls:'epic',   mul:2.1, color:'var(--epic)'   },
    { name:'Legendary', cls:'legend', mul:3.2, color:'var(--gold)'   },
  ];
  const INV_CAP = 30; // backpack size — overflow auto-sells the weakest item
  // Auto-sell threshold labels (index = rarity floor that still gets sold + 1)
  // 0 = off, 1 = sell Common, 2 = sell ≤Rare, 3 = sell ≤Epic
  const AUTOSELL_LABELS = ['Off', 'Common', '≤ Rare', '≤ Epic'];

  /* ── Gear affixes ───────────────────────────────────────────────
        Secondary bonuses that turn loot into build choices. Higher
        rarities roll more (and stronger) affixes, so a Legendary with
        the right affixes can beat a higher-base Epic for your build.
        Values are flat numbers interpreted per-kind in gearAffixTotals. */
  const GEAR_AFFIXES = [
    { id:'dmg',  name:'of Power',     icon:'⚔️', fmt:v=>`+${v}% Damage` },
    { id:'hp',   name:'of Vigor',     icon:'❤️', fmt:v=>`+${v}% Max HP` },
    { id:'crit', name:'of Precision', icon:'💥', fmt:v=>`+${v}% Crit Chance` },
    { id:'critd',name:'of Savagery',  icon:'🎯', fmt:v=>`+${v}% Crit Damage` },
    { id:'gold', name:'of Fortune',   icon:'💰', fmt:v=>`+${v}% Gold` },
    { id:'life', name:'of Leeching',  icon:'🩸', fmt:v=>`+${v}% Lifesteal` },
    { id:'spd',  name:'of Swiftness', icon:'⚡', fmt:v=>`+${(v/100).toFixed(2)} Atk Speed` },
  ];
  const AFFIX_COUNT = [0, 1, 2, 3]; // by rarity index: Common,Rare,Epic,Legendary
  function affixDef(id) { return GEAR_AFFIXES.find(a => a.id === id); }
  function affixText(a) { const d = affixDef(a.id); return d ? d.fmt(a.val) : ''; }
  function affixSummary(g) {
    if (!g || !g.affixes || !g.affixes.length) return '';
    return g.affixes.map(affixText).join(' · ');
  }
  // Roll a single affix magnitude for the given rarity & kind
  function affixRoll(id, rarIdx) {
    const range = { 1:[4,8], 2:[7,12], 3:[10,18] }[rarIdx] || [3,5];
    let v = range[0] + Math.floor(Math.random() * (range[1] - range[0] + 1));
    if (id === 'spd')  v = Math.max(3, Math.round(v * 0.7));  // attack speed stays modest (v/100)
    if (id === 'crit') v = Math.max(2, Math.round(v * 0.6));  // crit-chance points stay modest
    return v;
  }
  function rollAffixes(rarIdx) {
    const n = AFFIX_COUNT[rarIdx] || 0;
    if (!n) return [];
    const pool = GEAR_AFFIXES.slice();
    const out = [];
    for (let i = 0; i < n && pool.length; i++) {
      const d = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      out.push({ id: d.id, val: affixRoll(d.id, rarIdx) });
    }
    return out;
  }
  // Sum all affix bonuses across the three equipped slots
  function gearAffixTotals(state) {
    const t = { dmg:0, hp:0, crit:0, critd:0, gold:0, life:0, spd:0 };
    GEAR_SLOTS.forEach(slot => {
      const g = state.gear[slot];
      if (!g || !g.affixes) return;
      g.affixes.forEach(a => { if (t[a.id] !== undefined) t[a.id] += a.val; });
    });
    return t;
  }
  // Rough power rating used for auto-equip + ▲/▼ compare arrows
  function gearScore(g) {
    if (!g) return 0;
    let s = g.value * (1 + g.rarity * 0.18);
    if (g.affixes) g.affixes.forEach(a => { s += a.val * 1.6; });
    return s;
  }
  function sellValue(g) { return Math.floor(g.value * 3 * (g.rarity + 1)); }

  /* ── Skill tree (skill points, prereq-gated) ───────────────── */
  const UNLOCK_SKILLS = 10; // max floor reached to unlock the skill tree
  const SKILLS = [
    // Might — offense
    { id:'k_atk1',  branch:'Might',    name:'Sharpen',          icon:'⚔️', max:10, cost:1, req:null,     reqLvl:0, desc:l=>`+${l*5}% Attack` },
    { id:'k_multi', branch:'Might',    name:'Multi-Strike',     icon:'🗡️', max:5,  cost:2, req:'k_atk1', reqLvl:3, desc:l=>`${l*5}% chance to hit twice` },
    { id:'k_exec',  branch:'Might',    name:'Executioner',      icon:'☠️', max:5,  cost:3, req:'k_multi',reqLvl:1, desc:l=>`+${l*8}% damage vs bosses & elites` },
    { id:'k_cleave',branch:'Might',    name:'Power Tap',        icon:'🪓', max:5,  cost:4, req:'k_exec', reqLvl:1, desc:l=>`Taps deal +${l*40}% damage` },
    // Vitality — survival
    { id:'k_hp1',   branch:'Vitality', name:'Toughness',        icon:'❤️', max:10, cost:1, req:null,     reqLvl:0, desc:l=>`+${l*6}% Max HP` },
    { id:'k_life',  branch:'Vitality', name:'Lifesteal',        icon:'🩸', max:5,  cost:2, req:'k_hp1',  reqLvl:3, desc:l=>`Heal ${l*2}% of damage dealt` },
    { id:'k_regen', branch:'Vitality', name:'Regeneration',     icon:'💚', max:5,  cost:3, req:'k_life', reqLvl:1, desc:l=>`Regen ${l*1.5}%/s of Max HP` },
    { id:'k_wind',  branch:'Vitality', name:'Second Wind',      icon:'🌬️', max:5,  cost:4, req:'k_regen',reqLvl:1, desc:l=>`Revive at +${l*8}% HP after dying` },
    // Fortune — rewards
    { id:'k_gold1', branch:'Fortune',  name:'Greed',            icon:'💰', max:10, cost:1, req:null,     reqLvl:0, desc:l=>`+${l*8}% Gold` },
    { id:'k_crit',  branch:'Fortune',  name:'Deadeye',          icon:'🎯', max:8,  cost:2, req:'k_gold1',reqLvl:3, desc:l=>`+${l*3}% Crit Chance` },
    { id:'k_drop',  branch:'Fortune',  name:'Treasure Hunter',  icon:'💎', max:5,  cost:3, req:'k_crit', reqLvl:1, desc:l=>`+${l*4}% chance for rare+ gear` },
    { id:'k_ess',   branch:'Fortune',  name:'Soul Siphon',      icon:'🔮', max:5,  cost:4, req:'k_drop', reqLvl:1, desc:l=>`+${l*20}% Essence from bosses` },
    // Arcane — tempo
    { id:'k_focus', branch:'Arcane',   name:'Focus',            icon:'🧿', max:8,  cost:2, req:null,     reqLvl:0, desc:l=>`+${l*8}% Crit Damage` },
    { id:'k_haste', branch:'Arcane',   name:'Haste',            icon:'⚡', max:5,  cost:3, req:'k_focus',reqLvl:2, desc:l=>`+${(l*0.15).toFixed(2)} Attack Speed` },
    { id:'k_momentum',branch:'Arcane', name:'Bloodlust',        icon:'🔥', max:5,  cost:5, req:'k_haste',reqLvl:1, desc:l=>`+${l*3}% damage per wave cleared (caps ${l*30}%)` },
  ];
  function skillLvl(state, id) { return (state.skills && state.skills[id]) || 0; }

  /* Gear set synergy: matching rarity across all 3 slots */
  function gearSetBonus(state) {
    const g = state.gear;
    if (!g.weapon || !g.armor || !g.ring) return 1;
    const minRar = Math.min(g.weapon.rarity, g.armor.rarity, g.ring.rarity);
    if (minRar >= 3) return 1.60; // all Legendary
    if (minRar >= 2) return 1.35; // all Epic
    if (minRar >= 1) return 1.15; // all Rare+
    return 1;
  }
  /* Enchant multiplier for a gear slot: +8% per enchant level */
  function enchantMul(state, slot) { return 1 + 0.08 * ((state.enchant && state.enchant[slot]) || 0); }

  // quality: 0 = normal boss, 1 = elite, 2 = guardian (better rarity odds)
  function randomGear(floor, luck, quality) {
    luck = luck || 0;
    quality = quality || 0;
    const slot   = GEAR_SLOTS[Math.floor(Math.random() * GEAR_SLOTS.length)];
    // Rarity roll, improved by Treasure Hunter (luck) and monster quality
    const qBonus = quality * 0.12;
    const r = Math.random();
    let rarIdx;
    if (r < 0.03 + luck * 0.5 + qBonus)      rarIdx = 3; // Legendary
    else if (r < 0.15 + luck + qBonus * 1.5) rarIdx = 2; // Epic
    else if (r < 0.45 + luck * 1.5)          rarIdx = 1; // Rare
    else                                     rarIdx = 0; // Common
    const rar    = GEAR_RARITY[rarIdx];
    const icons  = { weapon:['⚔️','🗡️','🪓','🔱','🏹'], armor:['🛡️','🧥','⛓️','🪬','💠'], ring:['💍','🔮','📿','🌀','🔑'] };
    const icon   = icons[slot][Math.floor(Math.random() * 5)];
    const base   = 6 + Math.floor(Math.pow(floor, 1.35) * 1.4);
    const statIdx = slot === 'weapon' ? 0 : slot === 'armor' ? 1 : Math.floor(Math.random() * 3);
    const value   = Math.floor(base * rar.mul * (0.85 + Math.random() * 0.35));
    const affixes = rollAffixes(rarIdx);
    let name = rar.name + ' ' + (slot.charAt(0).toUpperCase()+slot.slice(1));
    if (affixes.length) name += ' ' + affixDef(affixes[0].id).name; // e.g. "Epic Weapon of Power"
    return { slot, icon, rarity: rarIdx, name, statIdx, value, affixes };
  }

  /* ── Achievements ─────────────────────────────────────────────*/
  function registerAchievements() {
    AchievementSystem.register('d_floor5',   '🗺️','Explorer',         'Reach floor 5.',               'Clear 5 floors');
    AchievementSystem.register('d_floor20',  '🏰','Deep Delver',       'Reach floor 20.',              'Clear 20 floors');
    AchievementSystem.register('d_floor50',  '🌋','Abyss Walker',      'Reach floor 50.',              'Clear 50 floors');
    AchievementSystem.register('d_kill100',  '⚔️','Slayer',            'Kill 100 monsters.',           '100 kills');
    AchievementSystem.register('d_kill1k',   '💀','Thousand Slayer',   'Kill 1,000 monsters.',         '1,000 kills');
    AchievementSystem.register('d_epic',     '💜','Epic Find',         'Find an Epic rarity item.',    'Kill bosses');
    AchievementSystem.register('d_rebirth1', '🌟','Born Again',        'Rebirth for the first time.',  'Reach floor 50');
    AchievementSystem.register('d_rebirth3', '💫','Reborn Thrice',     'Rebirth 3 times.',             '3 rebirths');
    AchievementSystem.register('d_tap1k',    '👊','Tapper\'s Fist',    'Tap 1,000 times in combat.',   'Tap to fight!');
    AchievementSystem.register('d_gold1m',   '💰','Gold Hoarder',      'Earn 1 million gold all-time.','Earn lots of gold');
    AchievementSystem.register('d_skill',     '⭐','Skilled',           'Learn your first skill.',      'Reach floor 10');
    AchievementSystem.register('d_enchant',   '🔨','Blacksmith',        'Enchant a piece of gear.',     'Collect essence from bosses');
    AchievementSystem.register('d_set',       '🧩','Matching Set',      'Equip a full Rare+ gear set.', 'Match all 3 gear rarities');
    AchievementSystem.register('d_legend',    '🌟','Legend',            'Find a Legendary item.',       'Slay elites & guardians');
    AchievementSystem.register('d_guardian',  '🛡️','Gatekeeper',        'Defeat a Zone Guardian.',      'Clear floor 10');
    AchievementSystem.register('d_elite',     '✨','Elite Hunter',      'Slay an Elite monster.',       'Elites appear at random');
    AchievementSystem.register('d_floor100',  '🐉','Abyssal',           'Reach floor 100.',             'Descend forever');
    AchievementSystem.register('d_keys',      '🗝️','Key Collector',     'Collect 4 different zone keys.','Beat zone guardians');
  }

  /* ── State ─────────────────────────────────────────────────── */
  let S = null;
  let tickFn = null;
  let autosaveTimer = null;
  let combatTimer = 0;

  function defaultState() {
    return {
      gold:          0,
      totalGold:     0,
      allTimeGold:   0,
      kills:         0,
      taps:          0,
      floor:         1,
      wave:          1,
      maxFloor:      0,
      rebirths:      0,
      souls:         0,
      allTimeSouls:  0,  // total souls ever earned (display only)
      soulUpgrades:  {}, // one-time soul upgrades: id -> true
      soulLevels:    {}, // repeatable soul upgrades: id -> level
      soulDmgMul:    0,
      soulGoldMul:   0,
      soulHpMul:     0,
      soulCritBonus: 0,
      soulStartFloor:0,
      stats: { atk:0, hp:0, crit:0, crit2:0, spd:0 }, // levels, not values
      gear:  { weapon:null, armor:null, ring:null },
      inventory: [],     // backpack of unequipped gear the player curates
      autoEquip: true,   // auto-equip a drop if it scores higher than what's worn
      autoSellBelow: 0,  // auto-sell new drops with rarity < this (0 = off)
      hp:    null, // current hp — set on enter
      waveStreak:    0,  // waves cleared without dying (drives Bloodlust)
      // ── Gated layers (persist across rebirth) ──
      skillPoints:  0,
      skills:       {},  // skillId -> level
      maxFloorEver: 0,   // highest floor reached, ever (drives skill points)
      essence:      0,   // crafting currency from bosses
      enchant:      { weapon:0, armor:0, ring:0 },
      keys:         {},  // zoneKeyName -> count (collected guardian trophies)
      savedAt: Date.now(),
    };
  }

  /* ── Computed hero stats ───────────────────────────────────── */
  function heroAtk(state) {
    const lvl  = state.stats.atk;
    const base = STAT_DEFS[0].base + lvl * 2;
    let gearBonus = 0;
    if (state.gear.weapon) gearBonus += state.gear.weapon.value * enchantMul(state, 'weapon');
    const soulMul  = 1 + (state.soulDmgMul || 0);
    const skillMul = 1 + 0.05 * skillLvl(state, 'k_atk1');
    const affixMul = 1 + gearAffixTotals(state).dmg / 100;
    return Math.floor((base * soulMul + gearBonus) * skillMul * gearSetBonus(state) * affixMul);
  }

  function heroMaxHp(state) {
    const lvl  = state.stats.hp;
    const base = STAT_DEFS[1].base + lvl * 20;
    let gearBonus = 0;
    if (state.gear.armor) gearBonus += state.gear.armor.value * 5 * enchantMul(state, 'armor');
    const soulMul  = 1 + (state.soulHpMul || 0);
    const skillMul = 1 + 0.06 * skillLvl(state, 'k_hp1');
    const affixMul = 1 + gearAffixTotals(state).hp / 100;
    return Math.floor((base * soulMul + gearBonus) * skillMul * gearSetBonus(state) * affixMul);
  }

  function heroCrit(state) {
    const lvl = state.stats.crit;
    const ringCrit = state.gear.ring?.statIdx === 2 ? state.gear.ring.value / 10 * enchantMul(state, 'ring') : 0;
    return Math.min(80, lvl * 2 + (state.soulCritBonus || 0) + 3 * skillLvl(state, 'k_crit') + ringCrit + gearAffixTotals(state).crit);
  }

  function heroCritDmg(state) {
    const lvl = state.stats.crit2;
    const ringDmg = state.gear.ring?.statIdx === 1 ? state.gear.ring.value * enchantMul(state, 'ring') : 0;
    return 150 + lvl * 10 + ringDmg + 8 * skillLvl(state, 'k_focus') + gearAffixTotals(state).critd;
  }

  function goldMul(state) {
    return (1 + (state.soulGoldMul || 0)) * (1 + 0.08 * skillLvl(state, 'k_gold1')) * (1 + gearAffixTotals(state).gold / 100);
  }
  function dropLuck(state) { return 0.04 * skillLvl(state, 'k_drop'); }
  function skillsUnlocked(state) { return (state.maxFloorEver || 0) >= UNLOCK_SKILLS; }
  // Fraction of damage healed back: Lifesteal skill + 'of Leeching' affixes
  function lifestealFrac(state) {
    return 0.02 * skillLvl(state, 'k_life') + gearAffixTotals(state).life / 100;
  }

  function heroSpeed(state) {
    const lvl = state.stats.spd;
    return Math.min(8, 1 + lvl * 0.2 + 0.15 * skillLvl(state, 'k_haste') + gearAffixTotals(state).spd / 100); // attacks per second
  }

  // Bloodlust: damage ramps as you clear waves without dying
  function bloodlustMul(state) {
    const l = skillLvl(state, 'k_momentum');
    if (!l) return 1;
    return 1 + l * Math.min(0.30, 0.03 * (state.waveStreak || 0));
  }
  // Executioner: bonus damage vs bosses & elites
  function executionerMul(state, enemy) {
    const l = skillLvl(state, 'k_exec');
    if (!l || !enemy || (!enemy.isBoss && !enemy.isElite)) return 1;
    return 1 + 0.08 * l;
  }
  // Combined situational damage multiplier applied at hit time
  function combatDmgMul(state, enemy) {
    return bloodlustMul(state) * executionerMul(state, enemy);
  }

  function statCost(stat, level) {
    const def = STAT_DEFS.find(d => d.id === stat);
    return Math.floor(def.costBase * Math.pow(def.costMul, level));
  }
  // Total gold to buy n levels of a stat from current level
  function statCostBulk(stat, level, n) {
    let c = 0;
    for (let i = 0; i < n; i++) c += statCost(stat, level + i);
    return c;
  }
  // Most levels affordable with given gold (respecting max cap)
  function statMaxAffordable(stat, level, gold, cap) {
    let n = 0, c = 0;
    while (n < 100000) {
      if (cap !== undefined && level + n >= cap) break;
      const next = statCost(stat, level + n);
      if (c + next > gold) break;
      c += next; n++;
    }
    return n;
  }
  // Effective single-target DPS for display
  function heroDps(state) {
    const crit = heroCrit(state) / 100;
    const critMul = 1 + crit * (heroCritDmg(state) / 100 - 1);
    return heroAtk(state) * heroSpeed(state) * critMul;
  }

  /* ── Enemy for current floor/wave ─────────────────────────── */
  let currentEnemy = null;

  function spawnEnemy() {
    const theme    = themeFor(S.floor);
    const isBoss   = S.wave === 10;
    const isGuard  = isBoss && isGuardianFloor(S.floor);   // zone Guardian
    // Elites: occasional tougher normal monster with much better loot
    const isElite  = !isBoss && Math.random() < 0.10;
    // Difficulty: floors ramp harder than before, and waves matter within a floor
    const floorPow = 1 + (S.floor - 1) * 0.14 + (S.wave - 1) * 0.03;
    const hpMod    = theme.hpMod || 1;
    const atkMod   = theme.atkMod || 1;
    const tierMul  = isGuard ? 14 : isBoss ? 6 : isElite ? 3 : 1;
    const maxHp    = Math.max(1, Math.floor(28 * Math.pow(floorPow, 2.3) * hpMod * tierMul));
    const goldTier = isGuard ? 28 : isBoss ? 11 : isElite ? 4 : 1;
    const reward   = Math.floor(6 * Math.pow(floorPow, 1.15) * goldTier * goldMul(S));
    const atk      = Math.floor(4 * Math.pow(floorPow, 1.85) * atkMod * (isBoss ? 1.4 : 1));
    let icon;
    if (isGuard)      icon = theme.guardian || theme.boss;
    else if (isBoss)  icon = theme.boss;
    else              icon = theme.enemies[Math.floor(Math.random() * theme.enemies.length)];
    const name = isGuard ? `${theme.name} Guardian` : isBoss ? `${theme.name} Boss` : isElite ? 'Elite' : '';
    currentEnemy = { icon, isBoss, isGuard, isElite, name, maxHp, hp: maxHp, reward, atk };
    renderEnemy();
  }

  /* ── Offline progress ─────────────────────────────────────── */
  function applyOfflineProgress(save) {
    const elapsed = Math.min((Date.now() - (save.savedAt || Date.now())) / 1000, OFFLINE_CAP);
    if (elapsed < 60) return;
    // Simulate gold from kills at current floor (matches live HP/reward curve)
    const d = save.data;
    const theme  = themeFor(d.floor || 1);
    const fp     = 1 + ((d.floor || 1) - 1) * 0.14;
    const spd    = heroSpeed(d);
    const atk    = heroAtk(d);
    const enemyHp = Math.max(1, Math.floor(28 * Math.pow(fp, 2.3) * (theme.hpMod || 1)));
    const killsPerSec = Math.min((spd * atk) / enemyHp, spd); // can't out-kill attack rate
    const kills = Math.floor(killsPerSec * elapsed);
    const goldPerKill = Math.floor(6 * Math.pow(fp, 1.15) * goldMul(d));
    const earned = kills * goldPerKill;
    if (earned < 1) return;
    d.gold        = (d.gold || 0) + earned;
    d.totalGold   = (d.totalGold || 0) + earned;
    d.allTimeGold = (d.allTimeGold || 0) + earned;
    d.kills       = (d.kills || 0) + kills;
    if (!Settings.get('offlineModal')) {
      Toast.show('👋', 'Welcome back', `Slew ${Fmt.format(kills)} foes · +${Fmt.format(earned)} gold`);
      return;
    }
    Modal.show({
      title: '👋 Welcome back!',
      body: `Away for <strong>${Fmt.time(elapsed)}</strong>.<br>
             Your hero slew <strong>${Fmt.format(kills)}</strong> monsters and earned <strong class="text-gold">${Fmt.format(earned)} gold</strong>.`,
      actions: [{ label: '⚔️ Continue', cls: 'btn-primary' }]
    });
  }

  /* ── Load / save ───────────────────────────────────────────── */
  function loadGame() {
    SaveSystem.registerMigrations(GAME_ID, {
      // v1_to_v2: data => { return { ...data, newField: 0 }; }
    });
    const save = SaveSystem.read(GAME_ID, SAVE_VERSION);
    if (save) {
      const legacy = save.data.maxFloorEver === undefined;   // pre-skill-tree save
      const preSoulTracks = save.data.soulLevels === undefined; // pre soul-track rework
      applyOfflineProgress(save);
      S = Object.assign(defaultState(), save.data);
      // Retroactively credit existing progress toward the skill tree (one-time)
      if (legacy) {
        S.maxFloorEver = Math.max(S.maxFloor || 0, S.floor || 0);
        S.skillPoints  = (S.skillPoints || 0) + S.maxFloorEver;
      }
      // Migrate removed one-time soul upgrades: refund their souls so the
      // player can re-spend them on the new repeatable tracks, and clear the
      // old flat multipliers (the tracks are now the single source of truth).
      if (preSoulTracks) {
        const REMOVED = { su1:1, su2:1, su4:2, su6:5 };
        let refund = 0;
        Object.keys(REMOVED).forEach(id => { if (S.soulUpgrades && S.soulUpgrades[id]) { refund += REMOVED[id]; delete S.soulUpgrades[id]; } });
        S.souls = (S.souls || 0) + refund;
        S.soulLevels = {};
        S.soulDmgMul = 0; S.soulHpMul = 0; S.soulGoldMul = 0;
      }
    } else {
      S = defaultState();
    }
    applySoulTracks(S); // recompute repeatable soul bonuses from stored levels
    if (!Array.isArray(S.inventory)) S.inventory = [];
    if (typeof S.autoEquip !== 'boolean') S.autoEquip = true;
    if (typeof S.autoSellBelow !== 'number') S.autoSellBelow = 0;
    if (S.hp === null || S.hp > heroMaxHp(S)) S.hp = heroMaxHp(S);
    S.savedAt = Date.now();
  }

  function saveGame() {
    S.savedAt = Date.now();
    SaveSystem.write(GAME_ID, SAVE_VERSION, S);
  }

  /* ── Check achievements ────────────────────────────────────── */
  function checkAchievements() {
    if (S.floor >= 5)  AchievementSystem.unlock('d_floor5');
    if (S.floor >= 20) AchievementSystem.unlock('d_floor20');
    if (S.floor >= 50) AchievementSystem.unlock('d_floor50');
    if (S.floor >= 100) AchievementSystem.unlock('d_floor100');
    if (S.kills >= 100)  AchievementSystem.unlock('d_kill100');
    if (S.kills >= 1000) AchievementSystem.unlock('d_kill1k');
    if (S.taps  >= 1000) AchievementSystem.unlock('d_tap1k');
    if (S.allTimeGold >= 1e6) AchievementSystem.unlock('d_gold1m');
    if (S.rebirths >= 1) AchievementSystem.unlock('d_rebirth1');
    if (S.rebirths >= 3) AchievementSystem.unlock('d_rebirth3');
    // Check for epic / legendary gear
    GEAR_SLOTS.forEach(slot => {
      const rar = S.gear[slot]?.rarity;
      if (rar >= 2) AchievementSystem.unlock('d_epic');
      if (rar >= 3) AchievementSystem.unlock('d_legend');
    });
    if (S.keys && Object.keys(S.keys).length >= 4) AchievementSystem.unlock('d_keys');
    if (gearSetBonus(S) > 1) AchievementSystem.unlock('d_set');
  }

  /* ── Combat resolution ─────────────────────────────────────── */

  // Drop gold for selling an item; updates all gold counters
  function gainGold(amount) {
    S.gold += amount; S.totalGold += amount; S.allTimeGold = (S.allTimeGold || 0) + amount;
  }
  // Add an item to the backpack. If the bag is full, the single weakest
  // item (which may be the new one) is auto-sold so loot is never lost.
  function inventoryAdd(g) {
    if (!Array.isArray(S.inventory)) S.inventory = [];
    S.inventory.push(g);
    while (S.inventory.length > INV_CAP) {
      let worst = 0;
      for (let i = 1; i < S.inventory.length; i++)
        if (gearScore(S.inventory[i]) < gearScore(S.inventory[worst])) worst = i;
      const junk = S.inventory.splice(worst, 1)[0];
      const sell = sellValue(junk);
      gainGold(sell);
      Toast.show('💰', 'Bag full — auto-sold', `${junk.name} · +${Fmt.format(sell)} gold`);
    }
  }

  // Stash a fresh drop: auto-sell it if its rarity is below the chosen
  // threshold, otherwise file it in the bag for the player to curate.
  function maybeStash(gear) {
    if (gear.rarity < (S.autoSellBelow || 0)) {
      const sell = sellValue(gear);
      gainGold(sell);
      Toast.show('💰', 'Auto-sold ' + gear.name, `+${Fmt.format(sell)} gold`);
      return;
    }
    inventoryAdd(gear);
    Toast.show(gear.icon, 'Loot: ' + gear.name, affixSummary(gear) || 'Sent to your bag', gear.rarity >= 2);
  }

  // Roll & resolve a gear drop. With auto-equip on, a higher-scoring drop is
  // worn immediately (the old piece drops into the bag); otherwise the drop
  // is stashed (or auto-sold by tier) so loot stays meaningful but tidy.
  function grantGear(quality) {
    const gear = randomGear(S.floor, dropLuck(S), quality);
    if (gear.rarity >= 3) AchievementSystem.unlock('d_legend');
    if (gear.rarity >= 2) AchievementSystem.unlock('d_epic');
    const equipped = S.gear[gear.slot];
    if (S.autoEquip && (!equipped || gearScore(gear) > gearScore(equipped))) {
      S.gear[gear.slot] = gear;
      if (equipped) inventoryAdd(equipped);
      const sub = affixSummary(gear) || `+${gear.value} ${STAT_DEFS[gear.statIdx].name}`;
      Toast.show(gear.icon, gear.name + ' Equipped!', sub, gear.rarity >= 2);
    } else {
      maybeStash(gear);
    }
  }

  // Equip an item from the bag; the displaced piece returns to the bag.
  window.DungeonGame_equip = function(idx) {
    if (!S.inventory || !S.inventory[idx]) return;
    const g = S.inventory.splice(idx, 1)[0];
    const old = S.gear[g.slot];
    S.gear[g.slot] = g;
    if (old) S.inventory.push(old);
    S.hp = Math.min(S.hp, heroMaxHp(S));
    Toast.show(g.icon, g.name + ' equipped', affixSummary(g) || `+${g.value} ${STAT_DEFS[g.statIdx].name}`);
    Haptics.vibrate(40);
    checkAchievements();
    renderGearTab(); renderCombat();
  };

  // Sell a single item from the bag for gold.
  window.DungeonGame_sell = function(idx) {
    if (!S.inventory || !S.inventory[idx]) return;
    const g = S.inventory.splice(idx, 1)[0];
    const sell = sellValue(g);
    gainGold(sell);
    Toast.show('💰', 'Sold ' + g.name, `+${Fmt.format(sell)} gold`);
    Haptics.vibrate(30);
    renderGearTab(); renderCombat();
  };

  // Sell every bagged item that doesn't beat what's already equipped.
  window.DungeonGame_sellJunk = function() {
    if (!S.inventory || !S.inventory.length) return;
    let total = 0, n = 0;
    S.inventory = S.inventory.filter(g => {
      if (gearScore(g) > gearScore(S.gear[g.slot])) return true; // keep upgrades
      total += sellValue(g); n++;
      return false;
    });
    if (n) { gainGold(total); Toast.show('💰', `Sold ${n} item${n>1?'s':''}`, `+${Fmt.format(total)} gold`); Haptics.vibrate(40); }
    else Toast.show('🎒', 'Nothing to sell', 'Every bagged item beats your gear.');
    renderGearTab(); renderCombat();
  };

  window.DungeonGame_toggleAutoEquip = function() {
    S.autoEquip = !S.autoEquip;
    Toast.show('🎚️', 'Auto-equip ' + (S.autoEquip ? 'ON' : 'OFF'), S.autoEquip ? 'Upgrades equip themselves' : 'All drops go to your bag');
    renderGearTab();
  };

  // Cycle the auto-sell tier: Off → Common → ≤Rare → ≤Epic → Off
  window.DungeonGame_cycleAutoSell = function() {
    S.autoSellBelow = ((S.autoSellBelow || 0) + 1) % AUTOSELL_LABELS.length;
    const lvl = S.autoSellBelow;
    Toast.show('🗑️', 'Auto-sell: ' + AUTOSELL_LABELS[lvl], lvl ? `New ${AUTOSELL_LABELS[lvl]} drops are sold automatically` : 'All drops are kept');
    renderGearTab();
  };

  // Roll whether a kill drops gear. base chance + a little from Treasure Hunter.
  function gearDrops(base) {
    return Math.random() < Math.min(0.95, base + 0.03 * skillLvl(S, 'k_drop'));
  }

  function onHeroDeath() {
    const reviveFrac = Math.min(0.95, 0.4 + 0.08 * skillLvl(S, 'k_wind'));
    S.hp = heroMaxHp(S) * reviveFrac;
    S.wave = Math.max(1, S.wave - 1);
    S.waveStreak = 0; // lose Bloodlust momentum
    Toast.show('💀', 'You fell!', 'Back to wave ' + S.wave);
    Haptics.vibrate([90, 50, 90]);
    spawnEnemy();
  }

  function onEnemyKilled() {
    const e = currentEnemy;
    S.gold      += e.reward;
    S.totalGold += e.reward;
    S.allTimeGold = (S.allTimeGold || 0) + e.reward;
    S.kills++;
    S.waveStreak = (S.waveStreak || 0) + 1;

    if (e.isElite) { AchievementSystem.unlock('d_elite'); if (gearDrops(0.55)) grantGear(1); }

    if (e.isBoss) {
      S.maxFloor = Math.max(S.maxFloor, S.floor);
      const essBase = 1 + Math.floor(S.floor / 10);
      const essMul  = 1 + 0.20 * skillLvl(S, 'k_ess');
      const essGain = Math.max(1, Math.round(essBase * essMul * (e.isGuard ? 3 : 1)));
      S.essence = (S.essence || 0) + essGain;
      // Guardians always reward gear (milestone); normal bosses drop ~45% of the time
      if (e.isGuard) grantGear(2);
      else if (gearDrops(0.45)) grantGear(0);
      if (e.isGuard) {
        const theme = themeFor(S.floor);
        if (!S.keys) S.keys = {};
        S.keys[theme.keyName] = (S.keys[theme.keyName] || 0) + 1;
        AchievementSystem.unlock('d_guardian');
        Toast.show(theme.key, 'Guardian Slain!', `Claimed the ${theme.keyName} · +${essGain} 💎`, true);
      }
      S.floor++;
      S.wave = 1;
      // One skill point per new highest floor reached
      if (S.floor > (S.maxFloorEver || 0)) {
        const gained = S.floor - (S.maxFloorEver || 0);
        S.maxFloorEver = S.floor;
        S.skillPoints = (S.skillPoints || 0) + gained;
        if (skillsUnlocked(S)) Toast.show('⭐', 'Skill Point!', `+${gained} to spend in the Skills tab.`);
      }
      Haptics.vibrate([60, 40, 100]);
    } else {
      S.wave = Math.min(S.wave + 1, 10);
    }
    S.hp = Math.min(S.hp + heroMaxHp(S) * 0.12, heroMaxHp(S)); // heal 12% on kill
    checkAchievements();
    spawnEnemy();
  }

  function resolveHit() {
    if (!currentEnemy || !S) return;
    let dmg = heroAtk(S);
    const isCrit = Math.random() * 100 < heroCrit(S);
    if (isCrit) dmg = Math.floor(dmg * heroCritDmg(S) / 100);
    const ms = skillLvl(S, 'k_multi');
    const multi = ms && Math.random() * 100 < ms * 5;
    if (multi) dmg *= 2;
    dmg = Math.max(1, Math.floor(dmg * combatDmgMul(S, currentEnemy)));

    currentEnemy.hp -= dmg;

    // Lifesteal (skill + 'of Leeching' affixes)
    const lf = lifestealFrac(S);
    if (lf) S.hp = Math.min(heroMaxHp(S), S.hp + dmg * lf);

    // Show floating dmg on enemy area
    const enemyEl = document.getElementById('dn-enemy-area');
    if (enemyEl) {
      const r = enemyEl.getBoundingClientRect();
      const tag = multi ? '⚡' : (isCrit ? '💥' : '');
      floatNum(r.left + r.width/2, r.top + r.height/3, tag + Fmt.format(dmg), isCrit || multi ? '#f5c542' : '#e05555');
    }

    // Hero takes damage per attack interval
    S.hp -= currentEnemy.atk * (1 / heroSpeed(S));
    if (S.hp <= 0) { onHeroDeath(); return; }
    if (currentEnemy.hp <= 0) onEnemyKilled();
    renderCombat();
  }

  /* ── Tap attack ────────────────────────────────────────────── */
  window.DungeonGame_tap = function(e) {
    if (!S || !currentEnemy) return;
    S.taps++;
    const cleaveMul = 1 + 0.4 * skillLvl(S, 'k_cleave'); // Power Tap: +40% per level
    let dmg = Math.floor(heroAtk(S) * 2.5 * cleaveMul);
    const isCrit = Math.random() * 100 < heroCrit(S);
    if (isCrit) dmg = Math.floor(dmg * heroCritDmg(S) / 100);
    dmg = Math.max(1, Math.floor(dmg * combatDmgMul(S, currentEnemy)));
    currentEnemy.hp -= dmg;
    const lf = lifestealFrac(S);
    if (lf) S.hp = Math.min(heroMaxHp(S), S.hp + dmg * lf);
    floatNum(e.clientX, e.clientY, (isCrit ? '💥' : '👊') + Fmt.format(dmg), isCrit ? '#f5c542' : '#fff');
    Haptics.vibrate(25);
    if (currentEnemy.hp <= 0) { onEnemyKilled(); renderCombat(); }
    else renderEnemy();
    checkAchievements();
  };

  window.DungeonGame_upgradestat = function(id) {
    const lvl = S.stats[id];
    const def = STAT_DEFS.find(d => d.id === id);
    if (def.max !== undefined && lvl >= def.max) return;
    let n = dnBuyAmount === 'max' ? statMaxAffordable(id, lvl, S.gold, def.max) : parseInt(dnBuyAmount);
    if (def.max !== undefined) n = Math.min(n, def.max - lvl);
    if (n < 1) return;
    const cost = statCostBulk(id, lvl, n);
    if (S.gold < cost) return;
    S.gold -= cost;
    S.stats[id] += n;
    Haptics.vibrate(40);
    renderStats();
    renderCombat();
  };

  function skillReqMet(sk) {
    return !sk.req || skillLvl(S, sk.req) >= (sk.reqLvl || 1);
  }

  window.DungeonGame_buySkill = function(id) {
    const sk = SKILLS.find(s => s.id === id);
    if (!sk) return;
    const lvl = skillLvl(S, id);
    if (lvl >= sk.max) return;
    if (!skillReqMet(sk)) {
      const reqSk = SKILLS.find(s => s.id === sk.req);
      Toast.show('🔒', 'Locked', `Requires ${reqSk ? reqSk.name : 'previous skill'} Lv.${sk.reqLvl || 1}.`);
      return;
    }
    if ((S.skillPoints || 0) < sk.cost) { Toast.show('⭐', 'Not enough points', `Need ${sk.cost} skill points.`); return; }
    S.skillPoints -= sk.cost;
    if (!S.skills) S.skills = {};
    S.skills[id] = lvl + 1;
    AchievementSystem.unlock('d_skill');
    Toast.show(sk.icon, sk.name + ' → Lv.' + (lvl + 1), sk.desc(lvl + 1));
    Haptics.vibrate(40);
    renderSkillTab();
    renderCombat();
  };

  window.DungeonGame_enchant = function(slot) {
    const g = S.gear[slot];
    if (!g) { Toast.show('🔨', 'Nothing equipped', 'Find gear from bosses first.'); return; }
    if (!S.enchant) S.enchant = { weapon:0, armor:0, ring:0 };
    const lvl  = S.enchant[slot] || 0;
    const cost = lvl + 1; // essence cost rises with level
    if ((S.essence || 0) < cost) { Toast.show('💎', 'Not enough essence', `Need ${cost} essence.`); return; }
    S.essence -= cost;
    S.enchant[slot] = lvl + 1;
    AchievementSystem.unlock('d_enchant');
    Toast.show('🔨', 'Gear Enchanted', `${g.name} +${(lvl+1)*8}% (Lv.${lvl+1})`);
    Haptics.vibrate([40,30,60]);
    renderGearTab();
    renderCombat();
  };

  window.DungeonGame_buySoulUpgrade = function(id) {
    const u = SOUL_UPGRADES.find(u => u.id === id);
    if (!u || S.soulUpgrades[id]) return;
    if (S.souls < u.cost) return;
    S.souls -= u.cost;
    S.soulUpgrades[id] = true;
    u.apply(S);
    Toast.show(u.icon, 'Soul Power', u.name + ': ' + u.desc);
    Haptics.vibrate([60,40,80]);
    renderSoulTab();
    renderCombat();
  };

  window.DungeonGame_buySoulTrack = function(id) {
    const t = SOUL_TRACKS.find(t => t.id === id);
    if (!t) return;
    const lvl  = soulTrackLvl(S, id);
    const cost = soulTrackCost(t, lvl);
    if ((S.souls || 0) < cost) { Toast.show('💫', 'Not enough souls', `Need ${cost} souls.`); return; }
    S.souls -= cost;
    if (!S.soulLevels) S.soulLevels = {};
    S.soulLevels[id] = lvl + 1;
    t.apply(S, lvl + 1);
    if (S.hp > heroMaxHp(S)) S.hp = heroMaxHp(S);
    Toast.show(t.icon, t.name + ' → Lv.' + (lvl + 1), t.fmt(lvl + 1));
    Haptics.vibrate([60,40,80]);
    renderSoulTab();
    renderCombat();
  };

  const REBIRTH_FLOOR = 50;
  // Souls scale with how deep you got — going past your previous best pays off.
  function soulsForFloor(maxFloor) {
    if (maxFloor < REBIRTH_FLOOR) return 0;
    return Math.max(1, Math.floor(Math.pow(maxFloor / 10, 1.35)));
  }

  window.DungeonGame_rebirth = function() {
    if (S.maxFloor < REBIRTH_FLOOR) {
      Toast.show('⚠️', 'Not yet', `Reach floor ${REBIRTH_FLOOR} this run to rebirth.`);
      return;
    }
    const souls = soulsForFloor(S.maxFloor);
    Modal.show({
      title: '🌟 Rebirth',
      body: `Reset your <b>gold, stats and floor</b> — keep gear, skills, enchants and soul powers.<br><br>
             Gain <strong class="text-accent">${souls} Souls</strong> for reaching floor <strong>${S.maxFloor}</strong> this run.<br>
             <span class="text-muted" style="font-size:13px">You'll start over near floor ${Math.max(1, S.soulStartFloor || 1)} and must climb again — but reaching <b>deeper than ${S.maxFloor}</b> next time grants even more souls.</span>`,
      actions: [
        { label: 'Cancel', cls: '' },
        { label: '🌟 Rebirth', cls: 'btn-primary', fn: () => {
          const gear     = S.gear;
          const inventory = S.inventory;
          const autoEquip = S.autoEquip;
          const autoSellBelow = S.autoSellBelow;
          const rebirths = S.rebirths + 1;
          const soulMods = { soulDmgMul: S.soulDmgMul, soulGoldMul: S.soulGoldMul, soulHpMul: S.soulHpMul, soulCritBonus: S.soulCritBonus, soulStartFloor: S.soulStartFloor };
          const soulUpgrades = S.soulUpgrades, soulLevels = S.soulLevels;
          const allTimeGold  = S.allTimeGold;
          const allTimeSouls = (S.allTimeSouls || 0) + souls;
          const kills        = S.kills;
          // Meta layers persist across rebirth
          const keepSkillPts = S.skillPoints, keepSkills = S.skills, keepMaxEver = S.maxFloorEver;
          const keepEssence  = S.essence, keepEnchant = S.enchant, keepKeys = S.keys;
          const carrySouls   = (S.souls || 0) + souls;
          S = defaultState();
          // maxFloor intentionally RESET — you must re-climb to rebirth again
          S.gear        = gear;
          S.inventory   = inventory;
          S.autoEquip   = autoEquip;
          S.autoSellBelow = autoSellBelow;
          S.rebirths    = rebirths;
          S.souls       = carrySouls;
          S.allTimeSouls = allTimeSouls;
          S.soulUpgrades = soulUpgrades;
          S.soulLevels  = soulLevels;
          S.allTimeGold  = allTimeGold;
          S.kills        = kills;
          S.skillPoints = keepSkillPts;
          S.skills      = keepSkills;
          S.maxFloorEver= keepMaxEver;
          S.essence     = keepEssence;
          S.enchant     = keepEnchant;
          S.keys        = keepKeys;
          Object.assign(S, soulMods);
          applySoulTracks(S);
          S.floor = Math.max(1, S.soulStartFloor || 1);
          S.wave  = 1;
          // maxFloor resets on rebirth (must re-climb to rebirth again), but
          // seed it to the start floor so the Floors tab can navigate the
          // floors the hero already begins on.
          S.maxFloor = Math.max(0, S.floor - 1);
          S.hp = heroMaxHp(S);
          AchievementSystem.unlock('d_rebirth1');
          if (rebirths >= 3) AchievementSystem.unlock('d_rebirth3');
          Toast.show('🌟', 'Reborn!', `+${souls} souls · ${S.souls} to spend`);
          spawnEnemy();
          renderAll2();
        }}
      ]
    });
  };

  window.DungeonGame_setFloor = function(f) {
    if (f > S.maxFloor + 1) return;
    S.floor = f;
    S.wave  = 1;
    spawnEnemy();
    renderCombat();
  };

  window.DungeonGame_help = function() {
    Modal.show({
      title: 'ℹ️ How Idle Dungeon works',
      body: `
        <p>Your hero <b>auto-attacks</b> the monster. <b class="text-gold">Tap the enemy</b> for big bonus hits.</p>
        <p class="mt-8">Each floor has <b>10 waves</b>. Wave 10 is a <b>👑 Boss</b>; clearing it advances a floor and drops gear + 💎 essence. Every 10th floor ends with a tough <b class="text-gold">🛡️ Guardian</b> that drops a rare zone <b>key</b>.</p>
        <p class="mt-8"><b>✨ Elites</b> appear at random — tougher, but far better loot.</p>
        <p class="mt-8"><b class="text-green">💰 Gold</b> upgrades your stats. <b>Gear</b> drops with <b class="text-accent">affixes</b> (extra bonuses like +Damage, Lifesteal or Crit) — rarer items roll more. Loot lands in your <b>🎒 Bag</b>: compare it, <b>equip</b> what fits your build, or <b>sell</b> the rest. <b>Auto-equip</b> wears clear upgrades for you, and <b>Auto-sell</b> can discard low-rarity drops automatically. <b>💎 Essence</b> enchants gear; matching all three rarities grants a <b>set bonus</b>.</p>
        <p class="mt-8"><b>⭐ Skills</b> (unlock floor ${UNLOCK_SKILLS}) cost points earned for each new deepest floor — higher tiers need levels in the skill above them.</p>
        <p class="mt-8"><b class="text-accent">🌟 Rebirth</b> at floor ${REBIRTH_FLOOR}+ resets your run (gold, stats, floor) for <b>Souls</b>. The deeper you reached, the more souls you earn. Spend them on repeatable <b>Soul Powers</b> and one-time milestones that make every run stronger. You must climb back up to rebirth again — so souls truly add up over time.</p>
        <p class="mt-8">If you die you drop back a wave and lose your <b>🔥 Bloodlust</b> streak, so keep your HP up.</p>
      `,
      actions: [{ label: 'Got it', cls: 'btn-primary' }]
    });
  };

  /* ── Render ────────────────────────────────────────────────── */
  let activeTab2   = localStorage.getItem('dn_tab') || 'stats';
  let dnBuyAmount  = localStorage.getItem('dn_buyAmt') || '1'; // '1' | '10' | 'max'

  window.DungeonGame_tab = function(tab, btn) {
    activeTab2 = tab;
    localStorage.setItem('dn_tab', tab);
    document.querySelectorAll('#screen-dungeon .tab-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderAll2();
  };

  function syncDnTabButtons() {
    document.querySelectorAll('#screen-dungeon .tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === activeTab2);
    });
  }

  window.DungeonGame_setBuyAmount = function(amt) {
    dnBuyAmount = amt;
    localStorage.setItem('dn_buyAmt', amt);
    renderStats();
  };

  function renderEnemy() {
    const el = document.getElementById('dn-enemy-icon');
    const bar = document.getElementById('dn-enemy-bar');
    const name = document.getElementById('dn-enemy-name');
    if (!el || !currentEnemy) return;
    const e = currentEnemy;
    el.textContent = e.icon;
    el.classList.toggle('elite', !!e.isElite && !e.isBoss);
    el.classList.toggle('guardian', !!e.isGuard);
    const pct = Math.max(0, e.hp / e.maxHp * 100);
    bar.style.width = pct + '%';
    bar.className = 'progress-fill ' + (e.isBoss ? 'gold' : (e.isElite ? 'epic' : ''));
    let tag = '';
    if (e.isGuard)      tag = '🛡️ GUARDIAN  ';
    else if (e.isBoss)  tag = '👑 BOSS  ';
    else if (e.isElite) tag = '✨ ELITE  ';
    name.textContent = tag + 'HP: ' + Fmt.format(Math.max(0,e.hp)) + ' / ' + Fmt.format(e.maxHp);
  }

  function renderCombat() {
    const theme = themeFor(S.floor);
    const fl = document.getElementById('dn-floor-info');
    if (fl) {
      let bl = '';
      const blm = bloodlustMul(S);
      if (blm > 1.001) bl = ` · <span style="color:var(--gold)">🔥 +${Math.round((blm-1)*100)}%</span>`;
      fl.innerHTML = `${theme.name} · Floor ${S.floor} · Wave ${S.wave}/10${isGuardianFloor(S.floor) && S.wave===10 ? ' · <span style="color:var(--gold)">🛡️ Guardian</span>':''}${bl}`;
    }
    const hpEl = document.getElementById('dn-hero-hp');
    const hpBar = document.getElementById('dn-hero-bar');
    const maxHp = heroMaxHp(S);
    if (hpEl) hpEl.innerHTML = Fmt.format(Math.ceil(S.hp)) + ' / ' + Fmt.format(maxHp) + ' HP <span style="color:var(--red)">· ⚔️ ' + Fmt.format(heroDps(S), 0) + ' DPS</span>';
    if (hpBar) { hpBar.style.width = Math.max(0, S.hp / maxHp * 100) + '%'; hpBar.className = 'progress-fill green'; }
    const goldEl = document.getElementById('dn-gold');
    if (goldEl) {
      let extra = '';
      if ((S.maxFloorEver || 0) >= 1) extra += ` <span style="color:var(--accent);font-size:13px">💎 ${S.essence || 0}</span>`;
      if (skillsUnlocked(S)) extra += ` <span style="color:var(--accent);font-size:13px">⭐ ${S.skillPoints || 0}</span>`;
      if ((S.souls || 0) > 0) extra += ` <span style="color:var(--accent);font-size:13px">💫 ${S.souls}</span>`;
      goldEl.innerHTML = '💰 ' + Fmt.format(S.gold) + extra;
    }
    // Reveal Skills tab once unlocked
    const skBtn = document.getElementById('dn-tabbtn-skills');
    if (skBtn) skBtn.style.display = skillsUnlocked(S) ? '' : 'none';
    renderEnemy();
  }

  function statValue(state, id) {
    if (id==='atk')  return heroAtk(state) + ' dmg';
    if (id==='hp')   return heroMaxHp(state) + ' HP';
    if (id==='crit') return heroCrit(state).toFixed(0) + '%';
    if (id==='crit2')return heroCritDmg(state) + '%';
    if (id==='spd')  return heroSpeed(state).toFixed(1) + '/s';
    return '';
  }

  function renderStats() {
    const list = document.getElementById('dn-content-area');
    if (!list || activeTab2 !== 'stats') return;
    // Pinned buy-amount selector
    const bar = document.getElementById('dn-subbar');
    if (bar) {
      bar.style.display = 'flex';
      const amts = [['1','×1'],['10','×10'],['max','Max']];
      bar.innerHTML = '<span class="buy-amt-label">Buy</span>' + amts.map(([v,l]) =>
        `<button class="buy-amt-btn ${dnBuyAmount===v?'active':''}" onclick="DungeonGame_setBuyAmount('${v}')">${l}</button>`).join('');
    }
    let html = `<div style="padding:10px;display:flex;flex-direction:column;gap:8px">`;
    STAT_DEFS.forEach(def => {
      const lvl   = S.stats[def.id];
      const atMax = def.max !== undefined && lvl >= def.max;
      let n = dnBuyAmount === 'max' ? statMaxAffordable(def.id, lvl, S.gold, def.max) : parseInt(dnBuyAmount);
      if (def.max !== undefined) n = Math.min(n, def.max - lvl);
      n = Math.max(1, n); // always show at least the next level's cost
      const cost = statCostBulk(def.id, lvl, n);
      const canAfford = S.gold >= cost && !atMax;
      // Preview the value after buying n levels
      const tmp = JSON.parse(JSON.stringify(S)); tmp.stats[def.id] += (atMax ? 0 : n);
      const cur = statValue(S, def.id), next = statValue(tmp, def.id);
      const preview = (!atMax && next !== cur) ? ` <span style="color:var(--green)">→ ${next}</span>` : '';
      html += `<button class="upgrade-item ${canAfford ? 'can-buy' : 'locked'}" onclick="DungeonGame_upgradestat('${def.id}')">
        <div class="upg-icon">${def.icon}</div>
        <div class="upg-info">
          <div class="upg-name">${def.name} <span style="color:var(--text2);font-size:12px">Lv.${lvl}</span></div>
          <div style="font-size:12px;color:var(--text2)">${cur}${preview}</div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div class="text-gold" style="font-size:13px">${atMax ? 'MAX' : '💰 '+Fmt.format(cost)}</div>
          <div style="font-size:11px;color:var(--green)">${atMax ? '' : '+'+n+' level'+(n>1?'s':'')}</div>
        </div>
      </button>`;
    });
    html += '</div>';
    list.innerHTML = html;
  }

  function renderGearTab() {
    const list = document.getElementById('dn-content-area');
    if (!list || activeTab2 !== 'gear') return;
    const setMul = gearSetBonus(S);
    let html = '<div style="padding:10px;display:flex;flex-direction:column;gap:10px">';
    // Set bonus banner
    const setTxt = setMul >= 1.6 ? 'All Legendary — +60% all stats'
                 : setMul > 1.2  ? 'All Epic — +35% all stats'
                 : setMul > 1    ? 'All Rare+ — +15% all stats'
                 : 'Match all 3 slots at the same rarity (Rare+) for a set bonus';
    html += `<div style="background:var(--bg2);border:1px solid ${setMul>1?'var(--epic)':'var(--border)'};border-radius:var(--radius-sm);padding:10px;font-size:13px">
      <span style="font-weight:600">🧩 Set Bonus:</span> <span style="color:${setMul>1?'var(--green)':'var(--text2)'}">${setTxt}</span>
      <div style="font-size:12px;color:var(--text2);margin-top:4px">💎 Essence: <span class="text-accent">${S.essence || 0}</span> — enchant gear (+8% each). Items roll <b>affixes</b> (extra bonuses); pick gear that fits your build.</div>
    </div>`;
    // Zone-key trophies collected from Guardians
    const keyEntries = Object.entries(S.keys || {}).filter(([,n]) => n > 0);
    if (keyEntries.length) {
      const keyIcons = keyEntries.map(([name,n]) => {
        const t = FLOOR_THEMES.find(z => z.keyName === name);
        return `<span title="${name}${n>1?' ×'+n:''}">${t?t.key:'🗝️'}${n>1?`<span style="font-size:10px">×${n}</span>`:''}</span>`;
      }).join(' ');
      html += `<div style="background:var(--bg2);border:1px solid var(--gold);border-radius:var(--radius-sm);padding:10px;font-size:13px">
        <span style="font-weight:600">🗝️ Guardian Keys:</span> <span style="font-size:18px">${keyIcons}</span>
        <div style="font-size:12px;color:var(--text2);margin-top:2px">Rare trophies dropped by Zone Guardians on floors 10, 20, 30…</div>
      </div>`;
    }
    // Renders the affix line for an item (coloured by its rarity)
    const affixLine = g => (g && g.affixes && g.affixes.length)
      ? `<div style="font-size:11px;color:var(--accent);margin-top:1px">${g.affixes.map(a => `${affixDef(a.id).icon} ${affixText(a)}`).join('  ')}</div>` : '';

    html += `<div class="menu-section-title" style="padding:4px 2px 0">Equipped</div>`;
    GEAR_SLOTS.forEach(slot => {
      const g = S.gear[slot];
      const color = g ? GEAR_RARITY[g.rarity].color : 'var(--text2)';
      const enLvl = (S.enchant && S.enchant[slot]) || 0;
      const eff = g ? Math.floor(g.value * enchantMul(S, slot)) : 0;
      const enCost = enLvl + 1;
      const aff = (S.essence || 0) >= enCost;
      html += `<div class="upgrade-item" style="border-color:${color}">
        <div class="upg-icon" style="font-size:28px">${g ? g.icon : '❔'}</div>
        <div class="upg-info">
          <div class="upg-name" style="color:${color}">${g ? g.name : slot.charAt(0).toUpperCase()+slot.slice(1)+' (empty)'} ${enLvl ? `<span style="color:var(--gold);font-size:11px">+${enLvl}</span>` : ''}</div>
          ${g ? `<div style="font-size:12px;color:var(--text2)">+${eff} ${STAT_DEFS[g.statIdx].name}${enLvl?` <span style="color:var(--text2)">(base ${g.value})</span>`:''}</div>` : '<div style="font-size:12px;color:var(--text2)">Defeat bosses to find gear</div>'}
          ${affixLine(g)}
        </div>
        ${g ? `<button class="bld-level ${aff?'can-buy':'locked'}" onclick="DungeonGame_enchant('${slot}')" style="flex-shrink:0">🔨 💎${enCost}</button>` : ''}
      </div>`;
    });

    // ── Backpack: curate your loot ──────────────────────────────
    const inv = S.inventory || [];
    const asLvl = S.autoSellBelow || 0;
    html += `<div style="padding:8px 2px 0">
        <span class="menu-section-title" style="padding:0">🎒 Bag <span style="color:var(--text2);font-weight:400">${inv.length}/${INV_CAP}</span></span>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:6px">
          <button class="buy-amt-btn ${S.autoEquip?'active':''}" onclick="DungeonGame_toggleAutoEquip()" title="Auto-equip upgrades">⚙️ Auto-equip ${S.autoEquip?'ON':'OFF'}</button>
          <button class="buy-amt-btn ${asLvl?'active':''}" onclick="DungeonGame_cycleAutoSell()" title="Auto-sell new drops at or below this rarity">🗑️ Auto-sell: ${AUTOSELL_LABELS[asLvl]}</button>
          ${inv.length ? `<button class="buy-amt-btn" onclick="DungeonGame_sellJunk()">💰 Sell extras</button>` : ''}
        </div>
      </div>`;
    if (!inv.length) {
      html += `<div class="center text-muted" style="padding:14px 10px;font-size:12px">Your bag is empty. ${S.autoEquip ? 'Drops that beat your gear equip automatically; the rest land here.' : 'Auto-equip is off — every drop lands here for you to choose.'}</div>`;
    } else {
      // Strongest first so the best finds are easy to spot
      const order = inv.map((g,i) => i).sort((a,b) => gearScore(inv[b]) - gearScore(inv[a]));
      order.forEach(i => {
        const g = inv[i];
        const color = GEAR_RARITY[g.rarity].color;
        const equipped = S.gear[g.slot];
        const diff = gearScore(g) - gearScore(equipped);
        const cmp = !equipped ? `<span style="color:var(--green)">▲ new ${g.slot}</span>`
                  : diff > 0.5 ? `<span style="color:var(--green)">▲ upgrade</span>`
                  : diff < -0.5 ? `<span style="color:var(--red)">▼ weaker</span>`
                  : `<span style="color:var(--text2)">≈ similar</span>`;
        const canEquip = !equipped || diff > 0.5;
        html += `<div class="upgrade-item" style="border-color:${color}">
          <div class="upg-icon" style="font-size:24px">${g.icon}</div>
          <div class="upg-info">
            <div class="upg-name" style="color:${color}">${g.name}</div>
            <div style="font-size:12px;color:var(--text2)">+${g.value} ${STAT_DEFS[g.statIdx].name} · ${cmp}</div>
            ${affixLine(g)}
          </div>
          <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0">
            <button class="bld-level ${canEquip?'can-buy':''}" onclick="DungeonGame_equip(${i})">Equip</button>
            <button class="bld-level" onclick="DungeonGame_sell(${i})" style="color:var(--gold)">💰${Fmt.format(sellValue(g))}</button>
          </div>
        </div>`;
      });
    }
    html += '</div>';
    list.innerHTML = html;
  }

  function renderSkillTab() {
    const list = document.getElementById('dn-content-area');
    if (!list || activeTab2 !== 'skills') return;
    if (!skillsUnlocked(S)) {
      list.innerHTML = `<div class="center text-muted" style="padding:30px 20px">🔒 Reach <strong>floor ${UNLOCK_SKILLS}</strong> to unlock the Skill Tree.<br><br>Highest floor so far: ${S.maxFloorEver || 0}</div>`;
      return;
    }
    const branches = {};
    SKILLS.forEach(s => { (branches[s.branch] = branches[s.branch] || []).push(s); });
    let html = `<div style="padding:10px;display:flex;flex-direction:column;gap:8px">
      <div style="font-size:13px">⭐ Skill Points: <span class="text-accent" style="font-weight:700">${S.skillPoints || 0}</span>
      <span style="color:var(--text2);font-size:12px"> · earn 1 per new deepest floor. Higher tiers need points in the skill above.</span></div>`;
    Object.keys(branches).forEach(br => {
      html += `<div class="menu-section-title" style="padding:6px 2px 2px">${br}</div>`;
      branches[br].forEach(sk => {
        const lvl = skillLvl(S, sk.id);
        const maxed = lvl >= sk.max;
        const reqMet = skillReqMet(sk);
        const aff = (S.skillPoints || 0) >= sk.cost && reqMet && !maxed;
        const reqSk = sk.req ? SKILLS.find(s => s.id === sk.req) : null;
        // Preview shows current level's effect, or the first level's if unbought
        const descLvl = maxed ? lvl : Math.max(lvl, 1);
        const cls = maxed ? '' : (aff ? 'can-buy' : 'locked');
        html += `<button class="upgrade-item ${cls}" ${maxed ? '' : `onclick="DungeonGame_buySkill('${sk.id}')"`} style="${lvl>0&&!aff?'border-color:var(--accent)':''}">
          <div class="upg-icon">${sk.icon}</div>
          <div class="upg-info">
            <div class="upg-name">${sk.name} <span style="color:var(--text2);font-size:12px">Lv.${lvl}/${sk.max}</span></div>
            <div style="font-size:12px;color:var(--text2)">${sk.desc(descLvl)}${!maxed && lvl>0 ? ` <span style="color:var(--green)">→ ${sk.desc(lvl+1)}</span>` : ''}</div>
            ${!reqMet ? `<div class="ach-hint" style="color:var(--text2)">🔒 Needs ${reqSk?reqSk.name:'previous skill'} Lv.${sk.reqLvl||1}</div>` : ''}
          </div>
          <div class="text-accent" style="font-size:13px;font-weight:600;flex-shrink:0">${maxed ? 'MAX' : '⭐ ' + sk.cost}</div>
        </button>`;
      });
    });
    html += '</div>';
    list.innerHTML = html;
  }

  function renderSoulTab() {
    const list = document.getElementById('dn-content-area');
    if (!list || activeTab2 !== 'soul') return;
    const canRebirth = S.maxFloor >= REBIRTH_FLOOR;
    const reward = soulsForFloor(S.maxFloor);
    let html = `<div style="padding:10px;display:flex;flex-direction:column;gap:10px">
      <div style="background:var(--bg2);border:1px solid ${canRebirth?'var(--accent)':'var(--border)'};border-radius:var(--radius-sm);padding:12px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-size:15px;font-weight:600">🌟 Rebirth</div>
            <div style="font-size:12px;color:var(--text2);margin-top:2px">Reset gold, stats & floor — keep gear, skills & souls</div>
            <div style="font-size:12px;color:var(--text2)">This run's max floor: <b>${S.maxFloor}</b> · Rebirths: ${S.rebirths}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:13px;color:var(--accent)">💫 ${S.souls} Souls</div>
            <div style="font-size:12px;color:var(--text2)">earned ${Fmt.format(S.allTimeSouls||0)} total</div>
          </div>
        </div>
        <button class="btn btn-primary mt-8" style="${canRebirth?'':'opacity:0.5'}" onclick="DungeonGame_rebirth()">
          ${canRebirth ? `🌟 Rebirth for +${reward} Souls` : `🔒 Reach floor ${REBIRTH_FLOOR} this run`}
        </button>
        <div style="font-size:11px;color:var(--text2);margin-top:6px">Souls scale with depth — push past floor ${S.maxFloor || REBIRTH_FLOOR} next run for a bigger payout.</div>
      </div>`;

    // Repeatable soul tracks — a permanent sink so souls always matter
    html += '<div style="font-size:12px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:0.06em;padding:4px 2px">Soul Powers · repeatable</div>';
    SOUL_TRACKS.forEach(t => {
      const lvl  = soulTrackLvl(S, t.id);
      const cost = soulTrackCost(t, lvl);
      const aff  = (S.souls || 0) >= cost;
      html += `<button class="upgrade-item ${aff?'can-buy':'locked'}" onclick="DungeonGame_buySoulTrack('${t.id}')">
        <div class="upg-icon">${t.icon}</div>
        <div class="upg-info">
          <div class="upg-name">${t.name} <span style="color:var(--text2);font-size:12px">Lv.${lvl}</span></div>
          <div style="font-size:12px;color:var(--text2)">${t.fmt(lvl)} <span style="color:var(--green)">→ ${t.fmt(lvl+1)}</span></div>
        </div>
        <div class="text-accent" style="font-size:13px;font-weight:600;flex-shrink:0">💫 ${cost}</div>
      </button>`;
    });

    html += '<div style="font-size:12px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:0.06em;padding:8px 2px 4px">Soul Milestones · one-time</div>';
    SOUL_UPGRADES.forEach(u => {
      const bought = S.soulUpgrades[u.id];
      const canAfford = S.souls >= u.cost && !bought;
      html += `<button class="upgrade-item ${bought?'':(canAfford?'can-buy':'locked')}" onclick="DungeonGame_buySoulUpgrade('${u.id}')">
        <div class="upg-icon">${u.icon}</div>
        <div class="upg-info">
          <div class="upg-name">${u.name} ${bought?'<span style="color:var(--green);font-size:12px">✓</span>':''}</div>
          <div style="font-size:12px;color:var(--text2)">${u.desc}</div>
        </div>
        <div class="text-accent" style="font-size:13px;font-weight:600;flex-shrink:0">${bought?'Owned':'💫 '+u.cost}</div>
      </button>`;
    });
    html += '</div>';
    list.innerHTML = html;
  }

  function renderFloorTab() {
    const list = document.getElementById('dn-content-area');
    if (!list || activeTab2 !== 'floors') return;
    let html = `<div style="padding:10px;display:flex;flex-direction:column;gap:6px">
      <div style="font-size:12px;color:var(--text2);padding:0 2px 4px">Jump to any cleared floor. Each zone spans 10 floors and ends with a <span style="color:var(--gold)">🛡️ Guardian</span> that drops a key.</div>`;
    const max = Math.max(S.maxFloor + 1, S.floor);
    let lastZone = -1;
    for (let f = 1; f <= max; f++) {
      const theme = themeFor(f);
      const zi = zoneIndex(f);
      if (zi !== lastZone) {
        lastZone = zi;
        html += `<div class="menu-section-title" style="padding:8px 2px 2px">${theme.key} ${theme.name} <span style="color:var(--text2);font-weight:400;text-transform:none;letter-spacing:0">— ${theme.tip}</span></div>`;
      }
      const isCurrent = f === S.floor;
      const isLocked  = f > S.maxFloor + 1;
      const guard     = isGuardianFloor(f);
      const icon      = guard ? (theme.guardian||theme.boss) : theme.enemies[f % theme.enemies.length];
      html += `<button class="upgrade-item ${isLocked?'locked':''}" onclick="DungeonGame_setFloor(${f})"
        style="${isCurrent?'border-color:var(--accent)':(guard?'border-color:var(--gold)':'')}">
        <div class="upg-icon">${icon}</div>
        <div class="upg-info">
          <div class="upg-name">Floor ${f} — ${theme.name}${guard?' <span style="color:var(--gold);font-size:11px">🛡️ Guardian</span>':''}</div>
          <div style="font-size:12px;color:var(--text2)">${isLocked?'🔒 Clear previous floor':(guard?`Drops the ${theme.key} ${theme.keyName}`:'Boss at wave 10: '+theme.boss)}</div>
        </div>
        ${isCurrent?'<div style="color:var(--accent);font-size:12px">Now</div>':''}
      </button>`;
    }
    html += '</div>';
    list.innerHTML = html;
  }

  function renderAll2() {
    if (!S) return;
    // Don't open on the Skills tab before it's unlocked
    if (activeTab2 === 'skills' && !skillsUnlocked(S)) { activeTab2 = 'stats'; syncDnTabButtons(); }
    renderCombat();
    // Buy-amount sub-bar only applies to the Stats tab
    const bar = document.getElementById('dn-subbar');
    if (bar && activeTab2 !== 'stats') bar.style.display = 'none';
    if (activeTab2 === 'stats')  renderStats();
    else if (activeTab2 === 'gear')   renderGearTab();
    else if (activeTab2 === 'skills') renderSkillTab();
    else if (activeTab2 === 'soul')   renderSoulTab();
    else if (activeTab2 === 'floors') renderFloorTab();
  }

  /* ── Build UI ──────────────────────────────────────────────── */
  function buildUI() {
    const el = document.getElementById('screen-dungeon');
    el.innerHTML = `
      <style>
        #dn-main { display:flex; flex-direction:column; height:100%; }
        #dn-combat-zone {
          flex-shrink:0; padding:14px; background:var(--bg2);
          border-bottom:1px solid var(--border);
        }
        #dn-floor-info { font-size:12px; color:var(--text2); margin-bottom:8px; }
        #dn-gold { font-size:14px; font-weight:700; margin-bottom:10px; }
        #dn-enemy-area {
          display:flex; flex-direction:column; align-items:center;
          gap:6px; padding:10px 0;
        }
        #dn-enemy-icon {
          font-size:72px; line-height:1;
          cursor:pointer; transition:transform 0.07s;
          filter:drop-shadow(0 2px 8px rgba(0,0,0,0.5));
        }
        #dn-enemy-icon:active { transform:scale(0.9); }
        #dn-enemy-icon.elite    { filter:drop-shadow(0 0 10px var(--epic)); animation:dn-pulse 1.1s ease-in-out infinite alternate; }
        #dn-enemy-icon.guardian { filter:drop-shadow(0 0 14px var(--gold)); animation:dn-pulse 0.8s ease-in-out infinite alternate; }
        @keyframes dn-pulse { from { transform:scale(1); } to { transform:scale(1.08); } }
        #dn-enemy-name { font-size:12px; color:var(--text2); }
        #screen-dungeon .progress-fill.epic { background:var(--epic); }
        .dn-bar-wrap { width:100%; }
        #dn-hero-info { display:flex; flex-direction:column; align-items:stretch; gap:4px; margin-top:10px; font-size:13px; }
        #dn-hero-hp { color:var(--text2); font-size:12px; }
        #dn-content { flex:1; display:flex; flex-direction:column; min-height:0; }
        #dn-content-area { flex:1; overflow-y:auto; }
        #dn-subbar { display:none; align-items:center; gap:6px; padding:8px 10px;
                     background:var(--bg2); border-bottom:1px solid var(--border); flex-shrink:0; }
        #screen-dungeon .buy-amt-label { font-size:12px; color:var(--text2); margin-right:2px; }
        #screen-dungeon .buy-amt-btn { padding:4px 12px; border-radius:var(--radius-sm); font-size:13px; font-weight:600;
                       background:var(--bg3); border:1px solid var(--border); color:var(--text2); }
        #screen-dungeon .buy-amt-btn.active { background:var(--accent); border-color:var(--accent); color:#fff; }
        #screen-dungeon .upgrade-item.can-buy { border-color:var(--green); }
        #screen-dungeon .upgrade-item.can-buy:active { border-color:var(--accent); }
        #screen-dungeon .bld-level { padding:4px 9px; margin-left:0; }
        #screen-dungeon .bld-level.can-buy { border-color:var(--green); color:var(--green); }
        #screen-dungeon .bld-level.can-buy:active { border-color:var(--accent); }
      </style>
      <div id="dn-main" style="position:relative">
        <div id="dn-combat-zone">
          <div id="dn-floor-info"></div>
          <div id="dn-gold"></div>
          <div id="dn-enemy-area">
            <span id="dn-enemy-icon" onclick="DungeonGame_tap(event)"></span>
            <div id="dn-enemy-name"></div>
            <div class="dn-bar-wrap">
              <div class="progress-bar"><div id="dn-enemy-bar" class="progress-fill" style="width:100%"></div></div>
            </div>
          </div>
          <div id="dn-hero-info">
            <span id="dn-hero-hp"></span>
            <div class="progress-bar" style="height:8px"><div id="dn-hero-bar" class="progress-fill green" style="width:100%"></div></div>
          </div>
        </div>
        <div id="dn-content">
          <div class="tab-bar" style="overflow-x:auto;white-space:nowrap;display:flex">
            <button class="tab-btn" data-tab="stats"  style="min-width:70px" onclick="DungeonGame_tab('stats',this)">Stats</button>
            <button class="tab-btn" data-tab="gear"   style="min-width:70px" onclick="DungeonGame_tab('gear',this)">Gear</button>
            <button id="dn-tabbtn-skills" class="tab-btn" data-tab="skills" style="min-width:78px;display:none" onclick="DungeonGame_tab('skills',this)">⭐ Skills</button>
            <button class="tab-btn" data-tab="floors" style="min-width:70px" onclick="DungeonGame_tab('floors',this)">Floors</button>
            <button class="tab-btn" data-tab="soul"   style="min-width:70px" onclick="DungeonGame_tab('soul',this)">Soul</button>
          </div>
          <div id="dn-subbar"></div>
          <div id="dn-content-area"></div>
        </div>
      </div>`;
  }

  /* ── Tick ──────────────────────────────────────────────────── */
  let renderThrottle2 = 0;
  tickFn = function(dt) {
    if (!S || !currentEnemy) return;
    // Regeneration skill
    const rg = skillLvl(S, 'k_regen');
    if (rg) S.hp = Math.min(heroMaxHp(S), S.hp + heroMaxHp(S) * 0.015 * rg * dt);
    combatTimer += dt;
    const spd = 1 / heroSpeed(S);
    while (combatTimer >= spd) {
      combatTimer -= spd;
      resolveHit();
    }
    renderThrottle2 += dt;
    if (renderThrottle2 >= 0.25) {
      renderThrottle2 = 0;
      if (document.getElementById('screen-dungeon').classList.contains('active')) {
        renderCombat();
        if (activeTab2 === 'stats') renderStats();
      }
    }
  };

  /* ── Register ──────────────────────────────────────────────── */
  Router.register('dungeon', {
    title: '⚔️ Idle Dungeon',
    onHelp: () => DungeonGame_help(),
    onEnter: () => {
      loadGame();
      buildUI();
      registerAchievements();
      syncDnTabButtons();
      spawnEnemy();
      renderAll2();
      Ticker.add(tickFn);
      autosaveTimer = setInterval(() => saveGame(), AUTOSAVE_MS);
    },
    onLeave: () => {
      saveGame();
      Ticker.remove(tickFn);
      clearInterval(autosaveTimer);
      currentEnemy = null;
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && document.getElementById('screen-dungeon')?.classList.contains('active')) {
      saveGame();
    }
  });
})(); // end DungeonGame
