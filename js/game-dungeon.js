'use strict';
/* ════════════════════════════════════════════════════════════════
   IDLE REALM  —  a Melvor/RuneScape-style idle skiller
   ────────────────────────────────────────────────────────────────
   One action at a time: fight, or chop / fish / mine, or fire / cook /
   smith. Ten skills level on the classic RS XP curve to 99. Gathering
   feeds production, production feeds combat (gear) and sustain (food),
   and skill levels passively buff one another. Slow on purpose — a
   long-haul grind with rare drops. The active action runs while idle.
   (Game id stays 'dungeon'; old Idle Dungeon saves are wiped on load.)
   ════════════════════════════════════════════════════════════════ */
(function IdleRealm() {
  const GAME_ID      = 'dungeon';
  const SAVE_VERSION = 2;
  const AUTOSAVE_MS  = 30000;
  const OFFLINE_CAP  = 24 * 3600;
  const PATK_INT     = 2.4;   // player attack interval (seconds)

  /* ── XP curve (RuneScape formula), capped at level 99 ─────────── */
  const MAX_LEVEL = 99;
  const XP_TABLE = (() => {
    const t = [0, 0]; let pts = 0;
    for (let l = 1; l < MAX_LEVEL; l++) { pts += Math.floor(l + 300 * Math.pow(2, l / 7)); t[l + 1] = Math.floor(pts / 4); }
    return t; // t[level] = total xp required to BE that level
  })();
  function levelForXp(xp) { let L = 1; while (L < MAX_LEVEL && xp >= XP_TABLE[L + 1]) L++; return L; }
  function xpForLevel(L) { return XP_TABLE[Math.min(MAX_LEVEL, L)] || 0; }

  /* ── Skills ──────────────────────────────────────────────────── */
  const SKILLS = [
    { id:'attack',     name:'Attack',     icon:'⚔️', kind:'combat' },
    { id:'strength',   name:'Strength',   icon:'💪', kind:'combat' },
    { id:'defence',    name:'Defence',    icon:'🛡️', kind:'combat' },
    { id:'hitpoints',  name:'Hitpoints',  icon:'❤️', kind:'combat' },
    { id:'woodcutting',name:'Woodcutting',icon:'🪓', kind:'gather' },
    { id:'fishing',    name:'Fishing',    icon:'🎣', kind:'gather' },
    { id:'mining',     name:'Mining',     icon:'⛏️', kind:'gather' },
    { id:'firemaking', name:'Firemaking', icon:'🔥', kind:'produce' },
    { id:'cooking',    name:'Cooking',    icon:'🍳', kind:'produce' },
    { id:'smithing',   name:'Smithing',   icon:'🔨', kind:'produce' },
  ];
  const SKILL = Object.fromEntries(SKILLS.map(s => [s.id, s]));

  /* ── Items ───────────────────────────────────────────────────── */
  const ITEMS = {
    coins:       { name:'Coins',          icon:'🪙', type:'currency' },
    // logs
    log_normal:  { name:'Logs',           icon:'🪵', type:'log',  value:2 },
    log_oak:     { name:'Oak Logs',       icon:'🪵', type:'log',  value:6 },
    log_willow:  { name:'Willow Logs',    icon:'🪵', type:'log',  value:14 },
    log_maple:   { name:'Maple Logs',     icon:'🪵', type:'log',  value:28 },
    // raw fish
    fish_shrimp: { name:'Raw Shrimp',     icon:'🦐', type:'raw',  value:2 },
    fish_trout:  { name:'Raw Trout',      icon:'🐟', type:'raw',  value:6 },
    fish_salmon: { name:'Raw Salmon',     icon:'🐟', type:'raw',  value:14 },
    fish_lobster:{ name:'Raw Lobster',    icon:'🦞', type:'raw',  value:30 },
    fish_sword:  { name:'Raw Swordfish',  icon:'🐠', type:'raw',  value:55 },
    // cooked food (heal in combat)
    food_shrimp: { name:'Shrimp',         icon:'🦐', type:'food', heal:30,  value:4 },
    food_trout:  { name:'Trout',          icon:'🐟', type:'food', heal:70,  value:10 },
    food_salmon: { name:'Salmon',         icon:'🐟', type:'food', heal:120, value:22 },
    food_lobster:{ name:'Lobster',        icon:'🦞', type:'food', heal:180, value:45 },
    food_sword:  { name:'Swordfish',      icon:'🐠', type:'food', heal:260, value:80 },
    // ores
    ore_copper:  { name:'Copper Ore',     icon:'🟤', type:'ore',  value:3 },
    ore_tin:     { name:'Tin Ore',        icon:'⚪', type:'ore',  value:3 },
    ore_iron:    { name:'Iron Ore',       icon:'🔴', type:'ore',  value:10 },
    ore_coal:    { name:'Coal',           icon:'⚫', type:'ore',  value:16 },
    ore_mithril: { name:'Mithril Ore',    icon:'🔵', type:'ore',  value:48 },
    // bars
    bar_bronze:  { name:'Bronze Bar',     icon:'🟫', type:'bar',  value:8 },
    bar_iron:    { name:'Iron Bar',       icon:'⬜', type:'bar',  value:24 },
    bar_steel:   { name:'Steel Bar',      icon:'◻️', type:'bar',  value:60 },
    bar_mithril: { name:'Mithril Bar',    icon:'🟦', type:'bar',  value:160 },
    // gear (slot weapon/armor/tool)
    weapon_bronze: { name:'Bronze Sword',     icon:'🗡️', type:'gear', slot:'weapon', tier:1, acc:6,  str:6,  value:40 },
    weapon_iron:   { name:'Iron Sword',       icon:'🗡️', type:'gear', slot:'weapon', tier:2, acc:12, str:11, value:120 },
    weapon_steel:  { name:'Steel Sword',      icon:'⚔️', type:'gear', slot:'weapon', tier:3, acc:22, str:20, value:340 },
    weapon_mithril:{ name:'Mithril Sword',    icon:'⚔️', type:'gear', slot:'weapon', tier:4, acc:38, str:34, value:900 },
    armor_bronze:  { name:'Bronze Platebody', icon:'🛡️', type:'gear', slot:'armor',  tier:1, def:10, value:50 },
    armor_iron:    { name:'Iron Platebody',   icon:'🛡️', type:'gear', slot:'armor',  tier:2, def:20, value:150 },
    armor_steel:   { name:'Steel Platebody',  icon:'🛡️', type:'gear', slot:'armor',  tier:3, def:36, value:420 },
    armor_mithril: { name:'Mithril Platebody',icon:'🛡️', type:'gear', slot:'armor',  tier:4, def:60, value:1100 },
    tool_bronze:   { name:'Bronze Toolkit',   icon:'🛠️', type:'gear', slot:'tool',   tier:1, speed:0.08, value:60 },
    tool_iron:     { name:'Iron Toolkit',     icon:'🛠️', type:'gear', slot:'tool',   tier:2, speed:0.16, value:180 },
    tool_steel:    { name:'Steel Toolkit',    icon:'🛠️', type:'gear', slot:'tool',   tier:3, speed:0.26, value:480 },
    tool_mithril:  { name:'Mithril Toolkit',  icon:'🛠️', type:'gear', slot:'tool',   tier:4, speed:0.40, value:1300 },
    // uncut gems — rare gathering drops
    usapphire:   { name:'Uncut Sapphire', icon:'🔹', type:'uncut', value:60 },
    uemerald:    { name:'Uncut Emerald',  icon:'🟢', type:'uncut', value:120 },
    uruby:       { name:'Uncut Ruby',     icon:'🔻', type:'uncut', value:240 },
    udiamond:    { name:'Uncut Diamond',  icon:'🔸', type:'uncut', value:600 },
    gem_dragon:  { name:'Dragonstone',    icon:'💎', type:'uncut', value:5000 }, // rare combat drop
    // cut gems
    sapphire:    { name:'Sapphire', icon:'🔹', type:'gem', value:140 },
    emerald:     { name:'Emerald',  icon:'🟢', type:'gem', value:280 },
    ruby:        { name:'Ruby',     icon:'🔻', type:'gem', value:560 },
    diamond:     { name:'Diamond',  icon:'🔸', type:'gem', value:1400 },
    // amulets (equip slot 'amulet') — build choices, equipped manually
    amulet_sapphire:{ name:'Amulet of Accuracy', icon:'📿', type:'gear', slot:'amulet', tier:1, acc:12,            value:400 },
    amulet_ruby:    { name:'Amulet of Power',    icon:'📿', type:'gear', slot:'amulet', tier:2, str:14,            value:900 },
    amulet_emerald: { name:'Amulet of Foraging', icon:'📿', type:'gear', slot:'amulet', tier:2, gspeed:0.15, rare:0.5, value:900 },
    amulet_diamond: { name:'Amulet of Skill',    icon:'📿', type:'gear', slot:'amulet', tier:3, acc:12, str:12, rare:0.3, value:2400 },
    amulet_glory:   { name:'Amulet of Glory',    icon:'🏵️', type:'gear', slot:'amulet', tier:4, acc:22, str:22, rare:0.6, value:8000 },
  };
  function itemName(id) { return (ITEMS[id] || {}).name || id; }
  function itemIcon(id) { return (ITEMS[id] || {}).icon || '❔'; }

  /* ── Skill actions (gathering + production) ─────────────────────
        type gather  → produces 1 item every `time` s
        type produce → consumes `inputs`, makes `output` (cooking can burn) */
  const ACTIONS = [
    // Woodcutting
    { id:'wc_normal', skill:'woodcutting', name:'Normal Tree', icon:'🌳', lvl:1,  xp:8,  time:3.0, item:'log_normal' },
    { id:'wc_oak',    skill:'woodcutting', name:'Oak Tree',    icon:'🌳', lvl:15, xp:16, time:3.6, item:'log_oak' },
    { id:'wc_willow', skill:'woodcutting', name:'Willow Tree', icon:'🌳', lvl:30, xp:32, time:4.2, item:'log_willow' },
    { id:'wc_maple',  skill:'woodcutting', name:'Maple Tree',  icon:'🌳', lvl:45, xp:55, time:5.0, item:'log_maple' },
    // Fishing
    { id:'fs_shrimp', skill:'fishing', name:'Net Shrimp',   icon:'🦐', lvl:1,  xp:7,  time:3.0, item:'fish_shrimp' },
    { id:'fs_trout',  skill:'fishing', name:'Fly Trout',    icon:'🐟', lvl:15, xp:18, time:3.6, item:'fish_trout' },
    { id:'fs_salmon', skill:'fishing', name:'Fly Salmon',   icon:'🐟', lvl:30, xp:35, time:4.2, item:'fish_salmon' },
    { id:'fs_lobster',skill:'fishing', name:'Cage Lobster', icon:'🦞', lvl:45, xp:60, time:5.0, item:'fish_lobster' },
    { id:'fs_sword',  skill:'fishing', name:'Harpoon Swordfish', icon:'🐠', lvl:60, xp:90, time:5.6, item:'fish_sword' },
    // Mining
    { id:'mn_copper', skill:'mining', name:'Copper Vein', icon:'🟤', lvl:1,  xp:8,  time:3.0, item:'ore_copper' },
    { id:'mn_tin',    skill:'mining', name:'Tin Vein',    icon:'⚪', lvl:1,  xp:8,  time:3.0, item:'ore_tin' },
    { id:'mn_iron',   skill:'mining', name:'Iron Vein',   icon:'🔴', lvl:15, xp:18, time:3.6, item:'ore_iron' },
    { id:'mn_coal',   skill:'mining', name:'Coal Seam',   icon:'⚫', lvl:30, xp:30, time:4.2, item:'ore_coal' },
    { id:'mn_mithril',skill:'mining', name:'Mithril Vein',icon:'🔵', lvl:50, xp:70, time:5.4, item:'ore_mithril' },
    // Firemaking (burns logs for XP)
    { id:'fm_normal', skill:'firemaking', name:'Burn Logs',        icon:'🔥', lvl:1,  xp:12, time:2.2, inputs:{ log_normal:1 } },
    { id:'fm_oak',    skill:'firemaking', name:'Burn Oak Logs',    icon:'🔥', lvl:15, xp:24, time:2.6, inputs:{ log_oak:1 } },
    { id:'fm_willow', skill:'firemaking', name:'Burn Willow Logs', icon:'🔥', lvl:30, xp:45, time:3.0, inputs:{ log_willow:1 } },
    { id:'fm_maple',  skill:'firemaking', name:'Burn Maple Logs',  icon:'🔥', lvl:45, xp:75, time:3.4, inputs:{ log_maple:1 } },
    // Cooking (raw → food, can burn)
    { id:'ck_shrimp', skill:'cooking', name:'Cook Shrimp',    icon:'🦐', lvl:1,  xp:10, time:2.2, inputs:{ fish_shrimp:1 },  output:'food_shrimp',  burn:0.30 },
    { id:'ck_trout',  skill:'cooking', name:'Cook Trout',     icon:'🐟', lvl:15, xp:22, time:2.6, inputs:{ fish_trout:1 },   output:'food_trout',   burn:0.28 },
    { id:'ck_salmon', skill:'cooking', name:'Cook Salmon',    icon:'🐟', lvl:30, xp:40, time:3.0, inputs:{ fish_salmon:1 },  output:'food_salmon',  burn:0.26 },
    { id:'ck_lobster',skill:'cooking', name:'Cook Lobster',   icon:'🦞', lvl:45, xp:65, time:3.4, inputs:{ fish_lobster:1 }, output:'food_lobster', burn:0.24 },
    { id:'ck_sword',  skill:'cooking', name:'Cook Swordfish', icon:'🐠', lvl:60, xp:95, time:3.8, inputs:{ fish_sword:1 },   output:'food_sword',   burn:0.22 },
    // Smithing — smelt bars
    { id:'sm_bronze', skill:'smithing', name:'Smelt Bronze', icon:'🟫', lvl:1,  xp:10, time:3.0, inputs:{ ore_copper:1, ore_tin:1 }, output:'bar_bronze' },
    { id:'sm_iron',   skill:'smithing', name:'Smelt Iron',   icon:'⬜', lvl:15, xp:20, time:3.4, inputs:{ ore_iron:1 },             output:'bar_iron' },
    { id:'sm_steel',  skill:'smithing', name:'Smelt Steel',  icon:'◻️', lvl:30, xp:35, time:3.8, inputs:{ ore_iron:1, ore_coal:2 }, output:'bar_steel' },
    { id:'sm_mithril',skill:'smithing', name:'Smelt Mithril',icon:'🟦', lvl:50, xp:70, time:4.6, inputs:{ ore_mithril:1, ore_coal:4 }, output:'bar_mithril' },
    // Smithing — forge gear
    { id:'fg_weapon_bronze', skill:'smithing', name:'Forge Bronze Sword',    icon:'🗡️', lvl:4,  xp:25,  time:4.0, inputs:{ bar_bronze:1 },  output:'weapon_bronze' },
    { id:'fg_tool_bronze',   skill:'smithing', name:'Forge Bronze Toolkit',  icon:'🛠️', lvl:6,  xp:40,  time:4.0, inputs:{ bar_bronze:2 },  output:'tool_bronze' },
    { id:'fg_armor_bronze',  skill:'smithing', name:'Forge Bronze Platebody',icon:'🛡️', lvl:8,  xp:50,  time:4.4, inputs:{ bar_bronze:3 },  output:'armor_bronze' },
    { id:'fg_weapon_iron',   skill:'smithing', name:'Forge Iron Sword',      icon:'🗡️', lvl:23, xp:48,  time:4.4, inputs:{ bar_iron:1 },    output:'weapon_iron' },
    { id:'fg_tool_iron',     skill:'smithing', name:'Forge Iron Toolkit',    icon:'🛠️', lvl:25, xp:70,  time:4.4, inputs:{ bar_iron:2 },    output:'tool_iron' },
    { id:'fg_armor_iron',    skill:'smithing', name:'Forge Iron Platebody',  icon:'🛡️', lvl:28, xp:96,  time:4.8, inputs:{ bar_iron:3 },    output:'armor_iron' },
    { id:'fg_weapon_steel',  skill:'smithing', name:'Forge Steel Sword',     icon:'⚔️', lvl:43, xp:80,  time:4.8, inputs:{ bar_steel:1 },   output:'weapon_steel' },
    { id:'fg_tool_steel',    skill:'smithing', name:'Forge Steel Toolkit',   icon:'🛠️', lvl:45, xp:120, time:4.8, inputs:{ bar_steel:2 },   output:'tool_steel' },
    { id:'fg_armor_steel',   skill:'smithing', name:'Forge Steel Platebody', icon:'🛡️', lvl:48, xp:160, time:5.2, inputs:{ bar_steel:3 },   output:'armor_steel' },
    { id:'fg_weapon_mithril',skill:'smithing', name:'Forge Mithril Sword',   icon:'⚔️', lvl:58, xp:130, time:5.2, inputs:{ bar_mithril:1 }, output:'weapon_mithril' },
    { id:'fg_tool_mithril',  skill:'smithing', name:'Forge Mithril Toolkit', icon:'🛠️', lvl:60, xp:200, time:5.2, inputs:{ bar_mithril:2 }, output:'tool_mithril' },
    { id:'fg_armor_mithril', skill:'smithing', name:'Forge Mithril Platebody',icon:'🛡️',lvl:63, xp:260, time:5.6, inputs:{ bar_mithril:3 }, output:'armor_mithril' },
    // Smithing — cut gems
    { id:'cut_sapphire', skill:'smithing', name:'Cut Sapphire', icon:'🔹', lvl:20, xp:50,  time:3.0, inputs:{ usapphire:1 }, output:'sapphire' },
    { id:'cut_emerald',  skill:'smithing', name:'Cut Emerald',  icon:'🟢', lvl:27, xp:67,  time:3.2, inputs:{ uemerald:1 },  output:'emerald' },
    { id:'cut_ruby',     skill:'smithing', name:'Cut Ruby',     icon:'🔻', lvl:34, xp:85,  time:3.4, inputs:{ uruby:1 },     output:'ruby' },
    { id:'cut_diamond',  skill:'smithing', name:'Cut Diamond',  icon:'🔸', lvl:43, xp:108, time:3.6, inputs:{ udiamond:1 },  output:'diamond' },
    // Smithing — craft amulets (gem + bar). The dragonstone makes the best-in-slot Glory.
    { id:'amu_acc',   skill:'smithing', name:'Craft Amulet of Accuracy', icon:'📿', lvl:22, xp:90,  time:4.5, inputs:{ sapphire:1, bar_iron:1 },   output:'amulet_sapphire' },
    { id:'amu_forage',skill:'smithing', name:'Craft Amulet of Foraging', icon:'📿', lvl:30, xp:140, time:4.8, inputs:{ emerald:1, bar_steel:1 },   output:'amulet_emerald' },
    { id:'amu_power', skill:'smithing', name:'Craft Amulet of Power',    icon:'📿', lvl:36, xp:170, time:4.8, inputs:{ ruby:1, bar_steel:1 },      output:'amulet_ruby' },
    { id:'amu_skill', skill:'smithing', name:'Craft Amulet of Skill',    icon:'📿', lvl:46, xp:230, time:5.2, inputs:{ diamond:1, bar_mithril:1 }, output:'amulet_diamond' },
    { id:'amu_glory', skill:'smithing', name:'Craft Amulet of Glory',    icon:'🏵️', lvl:60, xp:500, time:6.0, inputs:{ gem_dragon:1, bar_mithril:1 }, output:'amulet_glory' },
  ];
  const ACTION = Object.fromEntries(ACTIONS.map(a => [a.id, a]));
  // Rare gem drop tables for gathering (mult scales the base rate by node).
  const gemTable = mult => [
    { item:'usapphire', chance:0.0040 * mult },
    { item:'uemerald',  chance:0.0016 * mult },
    { item:'uruby',     chance:0.0007 * mult },
    { item:'udiamond',  chance:0.00025 * mult },
  ];
  // Mining is the prime gem source; woodcutting/fishing only rarely (bird nests / oysters)
  [['mn_copper',1],['mn_tin',1],['mn_iron',1.4],['mn_coal',1.8],['mn_mithril',2.6],
   ['wc_normal',0.4],['wc_oak',0.5],['wc_willow',0.6],['wc_maple',0.7],
   ['fs_shrimp',0.4],['fs_trout',0.5],['fs_salmon',0.6],['fs_lobster',0.7],['fs_sword',0.8]]
    .forEach(([id, mult]) => { if (ACTION[id]) ACTION[id].rare = gemTable(mult); });

  /* ── Monsters (combat). reqCb gates by combat level. ──────────── */
  const MONSTERS = [
    { id:'chicken', name:'Chicken',      icon:'🐔', zone:'Greenfields', reqCb:1,  hp:6,   maxHit:1,  acc:2,  def:1,  xp:5,   coins:[1,4],    interval:2.4 },
    { id:'rat',     name:'Giant Rat',    icon:'🐀', zone:'Greenfields', reqCb:1,  hp:12,  maxHit:2,  acc:4,  def:3,  xp:9,   coins:[2,6],    interval:2.4 },
    { id:'wolf',    name:'Wolf',         icon:'🐺', zone:'Greenfields', reqCb:5,  hp:30,  maxHit:4,  acc:8,  def:7,  xp:18,  coins:[4,12],   interval:2.6 },
    { id:'goblin',  name:'Goblin',       icon:'👺', zone:'Stonebreak',  reqCb:12, hp:55,  maxHit:6,  acc:16, def:14, xp:32,  coins:[8,22],   interval:2.6, drops:[{ item:'ore_iron', min:1, max:2, chance:0.10 }] },
    { id:'bandit',  name:'Bandit',       icon:'🥷', zone:'Stonebreak',  reqCb:20, hp:90,  maxHit:9,  acc:28, def:24, xp:55,  coins:[18,44],  interval:2.6, drops:[{ item:'bar_iron', min:1, max:1, chance:0.06 }, { item:'weapon_iron', min:1, max:1, chance:0.01 }] },
    { id:'hobgob',  name:'Hobgoblin',    icon:'👹', zone:'Stonebreak',  reqCb:30, hp:140, maxHit:13, acc:42, def:40, xp:90,  coins:[30,70],  interval:2.8, drops:[{ item:'ore_coal', min:1, max:3, chance:0.12 }, { item:'armor_iron', min:1, max:1, chance:0.01 }] },
    { id:'troll',   name:'Mountain Troll',icon:'🧌',zone:'Frostpeak',   reqCb:42, hp:230, maxHit:19, acc:62, def:58, xp:150, coins:[55,120], interval:3.0, drops:[{ item:'ore_mithril', min:1, max:2, chance:0.08 }, { item:'weapon_steel', min:1, max:1, chance:0.008 }] },
    { id:'ogre',    name:'Ogre',         icon:'👿', zone:'Frostpeak',   reqCb:55, hp:360, maxHit:26, acc:88, def:80, xp:240, coins:[90,200], interval:3.0, drops:[{ item:'bar_mithril', min:1, max:2, chance:0.06 }, { item:'armor_steel', min:1, max:1, chance:0.008 }] },
    { id:'demon',   name:'Lesser Demon', icon:'😈', zone:'Emberdeep',   reqCb:70, hp:560, maxHit:36, acc:120,def:112,xp:400, coins:[160,340],interval:3.0, drops:[{ item:'weapon_mithril', min:1, max:1, chance:0.006 }, { item:'gem_dragon', min:1, max:1, chance:0.001 }] },
    { id:'dragon',  name:'Green Dragon', icon:'🐉', zone:'Emberdeep',   reqCb:85, hp:880, maxHit:50, acc:170,def:160,xp:700, coins:[300,650],interval:3.2, drops:[{ item:'armor_mithril', min:1, max:1, chance:0.006 }, { item:'gem_dragon', min:1, max:1, chance:0.003 }] },
  ];
  const MONSTER = Object.fromEntries(MONSTERS.map(m => [m.id, m]));
  const ZONES = [...new Set(MONSTERS.map(m => m.zone))];

  /* ── State ───────────────────────────────────────────────────── */
  let S = null, tickFn = null, autosaveTimer = null;
  let progress = 0;            // seconds accumulated on the active action (transient)
  let cmb = null;              // transient combat state { id, mhp, php, pAtk, mAtk, flash }
  let renderThrottle = 0;

  function defaultState() {
    const skillsXp = {};
    SKILLS.forEach(s => { skillsXp[s.id] = (s.id === 'hitpoints') ? xpForLevel(10) : 0; });
    return {
      schema:      'realm',          // marker: distinguishes the reworked save
      skillsXp,
      bank:        { coins: 25 },
      equip:       { weapon: null, armor: null, tool: null, amulet: null },
      action:      null,             // { type:'skill', id } | { type:'combat', id }
      combatStyle: 'attack',         // attack | strength | defence (Accurate/Aggressive/Defensive)
      mastery:     {},               // actionId -> mastery xp (per-action progression)
      shop:        {},               // shop upgrade id -> level (coin sink)
      maxCombat:   0,
      kills:       0,
      actionsDone: 0,
      savedAt:     Date.now(),
    };
  }

  /* ── Skill/level helpers ─────────────────────────────────────── */
  function skillXp(id)    { return (S.skillsXp && S.skillsXp[id]) || 0; }
  function skillLevel(id) { return levelForXp(skillXp(id)); }
  function totalLevel()   { return SKILLS.reduce((s, k) => s + skillLevel(k.id), 0); }
  function combatLevel() {
    const a = skillLevel('attack'), st = skillLevel('strength'), d = skillLevel('defence'), h = skillLevel('hitpoints');
    return Math.floor(0.25 * (d + h) + 0.325 * (a + st));
  }
  function maxHp() { return skillLevel('hitpoints') * 10; }
  function addXp(id, amount) {
    if (!amount) return;
    amount = Math.round(amount * globalXpMul());   // Tome of Learning
    const before = skillLevel(id);
    S.skillsXp[id] = skillXp(id) + amount;
    const after = skillLevel(id);
    if (after > before) {
      Toast.show(SKILL[id].icon, SKILL[id].name + ' Level ' + after + '!', after >= MAX_LEVEL ? 'Maxed — 99!' : '', after >= MAX_LEVEL);
      Haptics.vibrate([40, 30, 60]);
      checkAchievements();
    }
  }

  /* ── Bank helpers ────────────────────────────────────────────── */
  function bankCount(id) { return (S.bank && S.bank[id]) || 0; }
  function bankAdd(id, q) { S.bank[id] = bankCount(id) + q; }
  function bankRemove(id, q) { const n = bankCount(id) - q; if (n > 0) S.bank[id] = n; else delete S.bank[id]; }
  function hasInputs(inputs) { return Object.keys(inputs).every(k => bankCount(k) >= inputs[k]); }
  function spendInputs(inputs) { Object.keys(inputs).forEach(k => bankRemove(k, inputs[k])); }

  /* ── Equipment / derived combat bonuses ──────────────────────── */
  function equippedItem(slot) { const id = S.equip[slot]; return id ? ITEMS[id] : null; }
  function bonus(slot, key)   { const it = equippedItem(slot); return (it && it[key]) || 0; }
  function toolSpeed()        { return bonus('tool', 'speed'); }

  // Gathering/production speed: tool + skill level, capped. Synergies:
  //  - mining level speeds Smithing; firemaking level cuts cooking burn.
  function actionEffTime(a) {
    let bonusPct = Math.min(0.30, skillLevel(a.skill) * 0.0025);   // up to -30% from level
    bonusPct += masterySpeed(a.id);                                // per-action mastery
    if (a.skill === 'woodcutting' || a.skill === 'fishing' || a.skill === 'mining') bonusPct += toolSpeed() + bonus('amulet', 'gspeed') + 0.03 * shopLvl('gloves');
    if (a.skill === 'smithing') bonusPct += Math.min(0.20, skillLevel('mining') * 0.002); // mining→smithing synergy
    return Math.max(0.3, a.time * (1 - Math.min(0.7, bonusPct)));
  }
  function cookBurnChance(a) {
    return Math.max(0, a.burn - skillLevel('cooking') * 0.01 - skillLevel('firemaking') * 0.003);
  }
  // Rare-drop multiplier: Amulet of Foraging/Skill/Glory boost gem chances.
  function rareBonus() { return 1 + bonus('amulet', 'rare'); }
  // Cooking synergy + Iron Stomach shop upgrade: food heals more.
  function foodHeal(id) { return Math.floor((ITEMS[id].heal || 0) * (1 + 0.005 * skillLevel('cooking') + 0.05 * shopLvl('stomach'))); }

  /* ── Mastery: per-action progression (cap 50) ────────────────── */
  const MASTERY_CAP = 50;
  function masteryXpForLevel(L) { return Math.floor(40 * Math.pow(L, 2.2)); } // cumulative xp to reach L
  function masteryXp(id)    { return (S.mastery && S.mastery[id]) || 0; }
  function masteryLevel(id) { const xp = masteryXp(id); let L = 0; while (L < MASTERY_CAP && xp >= masteryXpForLevel(L + 1)) L++; return L; }
  function masterySpeed(id) { return Math.min(0.20, masteryLevel(id) * 0.004); }  // up to -20% time
  function masteryDouble(id){ return Math.min(0.30, masteryLevel(id) * 0.006); }  // up to +30% double yield
  function addMastery(id, amount) {
    if (!S.mastery) S.mastery = {};
    const before = masteryLevel(id);
    S.mastery[id] = masteryXp(id) + amount;
    const after = masteryLevel(id);
    if (after > before) {
      const a = ACTION[id];
      Toast.show('🎯', 'Mastery ' + after + (after >= MASTERY_CAP ? ' (MAX)' : ''), (a ? a.name : id) + ' — faster + more double yields');
      if (after >= MASTERY_CAP) AchievementSystem.unlock('r_mastery');
    }
  }

  /* ── Coin Store: permanent, stacking, coin-sink upgrades ─────── */
  const SHOP = [
    { id:'gloves',  name:'Gathering Gloves', icon:'🧤', max:10, base:500,  mul:1.8, fmt:l=>`+${l*3}% gathering speed` },
    { id:'tome',    name:'Tome of Learning', icon:'📖', max:10, base:2000, mul:2.0, fmt:l=>`+${l*2}% XP from everything` },
    { id:'stomach', name:'Iron Stomach',     icon:'🍖', max:10, base:900,  mul:1.7, fmt:l=>`+${l*5}% food healing` },
    { id:'whet',    name:'Whetstone',        icon:'🎯', max:10, base:1500, mul:1.9, fmt:l=>`+${l*3}% combat damage` },
    { id:'charm',   name:'Offline Charm',    icon:'⏳', max:12, base:1200, mul:1.6, fmt:l=>`+${l*2}h offline cap (${24 + l*2}h total)` },
  ];
  function shopLvl(id) { return (S.shop && S.shop[id]) || 0; }
  function shopDef(id) { return SHOP.find(s => s.id === id); }
  function shopCost(def, lvl) { return Math.floor(def.base * Math.pow(def.mul, lvl)); }
  function globalXpMul()  { return 1 + 0.02 * shopLvl('tome'); }
  function combatDmgMul() { return 1 + 0.03 * shopLvl('whet'); }
  function offlineCap()   { return OFFLINE_CAP + shopLvl('charm') * 7200; }

  /* ── Combat math ─────────────────────────────────────────────── */
  function playerMaxHit() { return Math.floor((2 + (skillLevel('strength') + bonus('weapon', 'str') + bonus('amulet', 'str')) * 0.22) * combatDmgMul()); }
  function playerAtkRoll() { return (skillLevel('attack') + 8) * (1 + (bonus('weapon', 'acc') + bonus('amulet', 'acc')) / 48); }
  function playerDefRoll() { return (skillLevel('defence') + bonus('armor', 'def') + 8); }
  function hitChance(atkRoll, defRoll) { return atkRoll / (atkRoll + defRoll); }
  function playerDps(m) {
    const hc = hitChance(playerAtkRoll(), m.def + 8);
    return (playerMaxHit() / 2) * hc / PATK_INT;
  }

  /* ── Active-action control ───────────────────────────────────── */
  window.IdleRealm_selectAction = function(id) {
    const a = ACTION[id]; if (!a) return;
    if (skillLevel(a.skill) < a.lvl) { Toast.show('🔒', 'Locked', `${SKILL[a.skill].name} Lv.${a.lvl} required`); return; }
    S.action = { type: 'skill', id };
    progress = 0; cmb = null;
    Toast.show(a.icon, 'Training ' + SKILL[a.skill].name, a.name);
    renderAll();
  };
  window.IdleRealm_fight = function(id) {
    const m = MONSTER[id]; if (!m) return;
    if (combatLevel() < m.reqCb) { Toast.show('🔒', 'Too dangerous', `Combat level ${m.reqCb} required`); return; }
    S.action = { type: 'combat', id };
    progress = 0;
    cmb = { id, mhp: m.hp, php: maxHp(), pAtk: PATK_INT, mAtk: m.interval, flash: 0 };
    Toast.show(m.icon, 'Fighting ' + m.name, 'Style: ' + styleName());
    renderAll();
  };
  window.IdleRealm_stop = function() { S.action = null; cmb = null; progress = 0; renderAll(); };
  window.IdleRealm_setStyle = function(st) {
    S.combatStyle = st;
    Toast.show('🥋', 'Combat style: ' + styleName(), SKILL[styleSkill()].name + ' gains XP');
    renderActiveHeader(); if (activeTab === 'combat') renderCombatTab();
  };
  function styleSkill() { return S.combatStyle; }
  function styleName() { return S.combatStyle === 'attack' ? 'Accurate' : S.combatStyle === 'strength' ? 'Aggressive' : 'Defensive'; }

  /* ── Tick: process the single active action ──────────────────── */
  function completeSkillCycle(a) {
    if (a.inputs) {
      if (!hasInputs(a.inputs)) { Toast.show('🛑', 'Out of materials', 'Stopped ' + a.name); S.action = null; return false; }
      spendInputs(a.inputs);
    }
    const dbl = Math.random() < masteryDouble(a.id);   // mastery: chance at double yield
    if (a.output) {
      const burned = a.burn && Math.random() < cookBurnChance(a);
      if (!burned) {
        bankAdd(a.output, dbl ? 2 : 1); addXp(a.skill, a.xp); maybeAutoEquip(a.output);
        const ot = ITEMS[a.output] && ITEMS[a.output].type;
        if (ot === 'gem') AchievementSystem.unlock('r_gem');
        if (ITEMS[a.output] && ITEMS[a.output].slot === 'amulet') AchievementSystem.unlock('r_amulet');
        if (a.output === 'amulet_glory') AchievementSystem.unlock('r_glory');
      } else { addXp(a.skill, Math.floor(a.xp * 0.3)); Toast.show('💢', 'Burnt!', 'Ruined a ' + itemName(a.output)); }
    } else if (a.item) {
      bankAdd(a.item, dbl ? 2 : 1); addXp(a.skill, a.xp);
      rollRareDrops(a);
    } else {
      addXp(a.skill, dbl ? Math.round(a.xp * 1.5) : a.xp); // firemaking: no item, so double = bonus xp
    }
    addMastery(a.id, a.xp);
    S.actionsDone++;
    return true;
  }
  // Roll an action's rare gem table (with amulet bonus); announce finds.
  function rollRareDrops(a, quiet) {
    if (!a.rare) return;
    for (const r of a.rare) {
      if (Math.random() < r.chance * rareBonus()) {
        bankAdd(r.item, 1);
        AchievementSystem.unlock('r_uncut');
        if (!quiet) Toast.show(itemIcon(r.item), 'Rare find!', 'You found an ' + itemName(r.item) + '!', true);
      }
    }
  }

  function bestFood() {
    let best = null, heal = 0;
    Object.keys(S.bank).forEach(id => {
      const it = ITEMS[id];
      if (it && it.type === 'food' && bankCount(id) > 0 && it.heal > heal) { heal = it.heal; best = id; }
    });
    return best;
  }
  function autoEat() {
    const f = bestFood(); if (!f) return false;
    bankRemove(f, 1); cmb.php = Math.min(maxHp(), cmb.php + foodHeal(f));
    return true;
  }

  function killMonster(m) {
    addXp(styleSkill(), m.xp);
    addXp('hitpoints', Math.round(m.xp * 0.33));
    const coins = m.coins[0] + Math.floor(Math.random() * (m.coins[1] - m.coins[0] + 1));
    bankAdd('coins', coins);
    (m.drops || []).forEach(d => {
      if (Math.random() < d.chance) {
        const q = d.min + Math.floor(Math.random() * (d.max - d.min + 1));
        bankAdd(d.item, q);
        const it = ITEMS[d.item];
        Toast.show(it.icon, 'Rare drop!', `${q}× ${it.name}`, true);
        if (it.type === 'gear') maybeAutoEquip(d.item);
      }
    });
    S.kills++;
    const cb = combatLevel(); if (cb > (S.maxCombat || 0)) S.maxCombat = cb;
    checkAchievements();
    cmb.mhp = m.hp; // respawn another
  }

  function combatTick(dt) {
    const m = MONSTER[S.action.id];
    if (!cmb || cmb.id !== m.id) cmb = { id: m.id, mhp: m.hp, php: maxHp(), pAtk: PATK_INT, mAtk: m.interval, flash: 0 };
    if (cmb.flash > 0) cmb.flash = Math.max(0, cmb.flash - dt);
    // player attack
    cmb.pAtk -= dt;
    if (cmb.pAtk <= 0) {
      cmb.pAtk += PATK_INT;
      const hit = Math.random() < hitChance(playerAtkRoll(), m.def + 8);
      const dmg = hit ? 1 + Math.floor(Math.random() * playerMaxHit()) : 0;
      cmb.mhp -= dmg; cmb.flash = 0.15;
      const area = document.getElementById('rl-enemy-area');
      if (area) { const r = area.getBoundingClientRect(); floatNum(r.left + r.width / 2, r.top + r.height / 3, dmg || 'miss', dmg ? '#e05555' : '#9090b0'); }
      if (cmb.mhp <= 0) { killMonster(m); return; }
    }
    // monster attack
    cmb.mAtk -= dt;
    if (cmb.mAtk <= 0) {
      cmb.mAtk += m.interval;
      const hit = Math.random() < hitChance(m.acc + 8, playerDefRoll());
      const dmg = hit ? Math.floor(Math.random() * (m.maxHit + 1)) : 0;
      cmb.php -= dmg;
      if (cmb.php <= maxHp() * 0.45) autoEat();
      if (cmb.php <= 0) {
        if (!autoEat()) { // no food left → retreat
          Toast.show('💀', 'You were defeated', 'Out of food — combat stopped. Cook some!');
          Haptics.vibrate([90, 50, 90]);
          S.action = null; cmb = null;
        }
      }
    }
  }

  tickFn = function(dt) {
    if (!S || !S.action) return;
    if (S.action.type === 'combat') {
      combatTick(dt);
    } else {
      const a = ACTION[S.action.id];
      if (!a) { S.action = null; return; }
      progress += dt;
      const eff = actionEffTime(a);
      let guard = 0;
      while (progress >= eff && S.action && guard++ < 50) { progress -= eff; if (!completeSkillCycle(a)) { progress = 0; break; } }
    }
    renderThrottle += dt;
    if (renderThrottle >= 0.25) {
      renderThrottle = 0;
      if (document.getElementById('screen-dungeon').classList.contains('active')) {
        renderActiveHeader();
        if (activeTab === 'bank') renderBankTab();
      }
    }
  };

  /* ── Equipment actions ───────────────────────────────────────── */
  function maybeAutoEquip(id) {
    const it = ITEMS[id]; if (!it || it.type !== 'gear') return;
    if (it.slot === 'amulet') return; // amulets are a build choice — equip manually
    const cur = equippedItem(it.slot);
    if (!cur || (it.tier || 0) > (cur.tier || 0)) S.equip[it.slot] = id;
  }
  window.IdleRealm_equip = function(id) {
    const it = ITEMS[id]; if (!it || it.type !== 'gear' || bankCount(id) < 1) return;
    S.equip[it.slot] = id;
    Toast.show(it.icon, 'Equipped', it.name);
    Haptics.vibrate(30);
    renderBankTab(); renderActiveHeader();
  };
  window.IdleRealm_sell = function(id) {
    const it = ITEMS[id]; if (!it || id === 'coins') return;
    const q = bankCount(id); if (q < 1) return;
    const gold = (it.value || 1) * q;
    bankRemove(id, q); bankAdd('coins', gold);
    Toast.show('🪙', 'Sold ' + q + '× ' + it.name, '+' + Fmt.format(gold) + ' coins');
    renderBankTab();
  };
  window.IdleRealm_buyShop = function(id) {
    const def = shopDef(id); if (!def) return;
    const lvl = shopLvl(id);
    if (lvl >= def.max) return;
    const cost = shopCost(def, lvl);
    if (bankCount('coins') < cost) { Toast.show('🪙', 'Not enough coins', `Need ${Fmt.format(cost)} coins`); return; }
    bankRemove('coins', cost);
    if (!S.shop) S.shop = {};
    S.shop[id] = lvl + 1;
    AchievementSystem.unlock('r_store');
    Toast.show(def.icon, def.name + ' → Lv.' + (lvl + 1), def.fmt(lvl + 1));
    Haptics.vibrate(40);
    renderStoreTab(); renderTopbar(); renderActiveHeader();
  };

  /* ── Achievements ────────────────────────────────────────────── */
  function registerAchievements() {
    AchievementSystem.register('r_first',   '🪵','First Harvest',   'Gather your first resource.',  'Start a gathering skill');
    AchievementSystem.register('r_smith',   '🔨','Apprentice Smith','Smith your first bar.',        'Mine ore, then smelt it');
    AchievementSystem.register('r_cook',    '🍳','Line Cook',       'Cook your first food.',        'Fish, then cook it');
    AchievementSystem.register('r_kill10',  '⚔️','Blooded',         'Defeat 10 monsters.',          'Start a fight');
    AchievementSystem.register('r_kill500', '💀','Monster Hunter',  'Defeat 500 monsters.',         'Keep fighting');
    AchievementSystem.register('r_cb50',    '🛡️','Warrior',         'Reach combat level 50.',       'Train combat skills');
    AchievementSystem.register('r_total300','📜','Jack of Trades',  'Reach total level 300.',       'Level many skills');
    AchievementSystem.register('r_total750','🏅','Master',          'Reach total level 750.',       'The long grind');
    AchievementSystem.register('r_99',      '🌟','Maxed a Skill',   'Reach level 99 in any skill.', 'Grind to 99');
    AchievementSystem.register('r_rare',    '💎','Lucky',           'Receive a rare monster drop.', 'Fight tough monsters');
    AchievementSystem.register('r_mith',    '🔵','Mithril Smith',   'Forge any Mithril gear.',      'Smith at level 58+');
    AchievementSystem.register('r_uncut',   '🔹','Gem in the Rough', 'Find an uncut gem while gathering.', 'Gather a lot — gems are rare');
    AchievementSystem.register('r_gem',     '💍','Lapidary',        'Cut a gem.',                   'Find then cut a gem');
    AchievementSystem.register('r_amulet',  '📿','Jeweller',        'Craft an amulet.',             'Cut a gem, then craft');
    AchievementSystem.register('r_glory',   '🏵️','For Glory',        'Craft the Amulet of Glory.',   'Needs a Dragonstone');
    AchievementSystem.register('r_mastery', '🎯','Master of One',    'Max an action to mastery 50.', 'Repeat one action a lot');
    AchievementSystem.register('r_store',   '🛒','Big Spender',      'Buy a Store upgrade.',         'Sell loot, spend coins');
  }
  function checkAchievements() {
    if (S.kills >= 10)  AchievementSystem.unlock('r_kill10');
    if (S.kills >= 500) AchievementSystem.unlock('r_kill500');
    if (combatLevel() >= 50) AchievementSystem.unlock('r_cb50');
    const tl = totalLevel();
    if (tl >= 300) AchievementSystem.unlock('r_total300');
    if (tl >= 750) AchievementSystem.unlock('r_total750');
    if (SKILLS.some(s => skillLevel(s.id) >= MAX_LEVEL)) AchievementSystem.unlock('r_99');
    if (bankCount('ore_copper') || bankCount('log_normal') || bankCount('fish_shrimp')) AchievementSystem.unlock('r_first');
    ['bar_bronze','bar_iron','bar_steel','bar_mithril'].forEach(b => { if (bankCount(b)) AchievementSystem.unlock('r_smith'); });
    ['food_shrimp','food_trout','food_salmon','food_lobster','food_sword'].forEach(f => { if (bankCount(f)) AchievementSystem.unlock('r_cook'); });
    ['weapon_mithril','armor_mithril','tool_mithril'].forEach(g => { if (bankCount(g) || S.equip.weapon===g || S.equip.armor===g || S.equip.tool===g) AchievementSystem.unlock('r_mith'); });
    if (bankCount('gem_dragon')) AchievementSystem.unlock('r_rare');
  }

  /* ── Offline progress ────────────────────────────────────────── */
  function applyOfflineProgress(save) {
    const d = save.data;
    if (!d.action) return;
    const S0 = S; S = d; // run all helpers against the raw save
    let summary = '', elapsed = 0;
    try {
      elapsed = Math.min((Date.now() - (save.savedAt || Date.now())) / 1000, offlineCap());
      if (elapsed < 60) return;
      const gxp = globalXpMul();
      if (d.action.type === 'skill') {
        const a = ACTION[d.action.id];
        if (a) {
          const eff = actionEffTime(a);
          let cycles = Math.floor(elapsed / eff);
          if (a.inputs) { // limited by available inputs
            const maxByInput = Math.min.apply(null, Object.keys(a.inputs).map(k => Math.floor(bankCount(k) / a.inputs[k])));
            cycles = Math.min(cycles, maxByInput);
          }
          if (cycles > 0) {
            let made = 0, xp = 0;
            for (let i = 0; i < cycles; i++) {
              if (a.inputs) { if (!hasInputs(a.inputs)) break; spendInputs(a.inputs); }
              const dbl = Math.random() < masteryDouble(a.id);
              if (a.output) { const burn = a.burn && Math.random() < cookBurnChance(a); if (!burn) { bankAdd(a.output, dbl ? 2 : 1); made++; xp += a.xp; } else xp += Math.floor(a.xp * 0.3); }
              else if (a.item) { bankAdd(a.item, dbl ? 2 : 1); made++; xp += a.xp; rollRareDrops(a, true); }
              else { xp += dbl ? Math.round(a.xp * 1.5) : a.xp; made++; }
            }
            d.skillsXp[a.skill] = (d.skillsXp[a.skill] || 0) + Math.round(xp * gxp);
            d.mastery = d.mastery || {}; d.mastery[a.id] = (d.mastery[a.id] || 0) + cycles * a.xp;
            summary = `${SKILL[a.skill].name}: +${Fmt.format(Math.round(xp * gxp))} XP · ${Fmt.format(made)}× ${a.item ? itemName(a.item) : a.output ? itemName(a.output) : 'actions'}`;
          }
        }
      } else if (d.action.type === 'combat') {
        const m = MONSTER[d.action.id];
        if (m) {
          const dps = playerDps(m);
          const ttk = Math.max(1, m.hp / Math.max(0.01, dps));
          let kills = Math.floor(elapsed / ttk);
          // sustain: cap by food healing vs damage taken
          const dmgPerSec = (m.maxHit / 2) * hitChance(m.acc + 8, playerDefRoll()) / m.interval;
          let foodPool = 0; Object.keys(d.bank).forEach(id => { const it = ITEMS[id]; if (it && it.type === 'food') foodPool += foodHeal(id) * bankCount(id); });
          const sustainSecs = (maxHp() + foodPool) / Math.max(0.01, dmgPerSec);
          if (sustainSecs < elapsed) kills = Math.min(kills, Math.floor(sustainSecs / ttk));
          if (kills > 0) {
            const sx = Math.round(m.xp * kills * gxp), hx = Math.round(m.xp * 0.33 * kills * gxp);
            d.skillsXp[styleSkill()] = (d.skillsXp[styleSkill()] || 0) + sx;
            d.skillsXp.hitpoints = (d.skillsXp.hitpoints || 0) + hx;
            const coins = Math.round((m.coins[0] + m.coins[1]) / 2 * kills);
            bankAdd('coins', coins);
            (m.drops || []).forEach(dr => { const got = Math.floor(kills * dr.chance + Math.random()); if (got > 0) bankAdd(dr.item, got * (((dr.min + dr.max) >> 1) || 1)); });
            // consume the food that was used (cheapest first)
            let need = Math.max(0, dmgPerSec * Math.min(elapsed, kills * ttk) - maxHp());
            const foods = Object.keys(d.bank).filter(id => ITEMS[id] && ITEMS[id].type === 'food').sort((a, b) => ITEMS[a].heal - ITEMS[b].heal);
            for (const fid of foods) { while (need > 0 && bankCount(fid) > 0) { bankRemove(fid, 1); need -= foodHeal(fid); } }
            d.kills = (d.kills || 0) + kills;
            summary = `Combat: ${Fmt.format(kills)} kills · +${Fmt.format(sx)} ${styleName()} XP · +${Fmt.format(coins)} 🪙`;
          }
        }
      }
    } finally { S = S0; }
    if (!summary) return;
    if (!Settings.get('offlineModal')) { Toast.show('🌙', 'Welcome back', summary); return; }
    Modal.show({
      title: '🌙 Welcome back',
      body: `You were away <strong>${Fmt.time(elapsed)}</strong> and kept working:<br><br>${summary}`,
      actions: [{ label: '⚔️ Continue', cls: 'btn-primary' }]
    });
  }

  /* ── Load / save ─────────────────────────────────────────────── */
  function loadGame() {
    SaveSystem.registerMigrations(GAME_ID, {});
    const save = SaveSystem.read(GAME_ID, SAVE_VERSION);
    if (save && save.data && save.data.schema === 'realm') {
      applyOfflineProgress(save);
      S = Object.assign(defaultState(), save.data);
    } else {
      // No save, or an old Idle Dungeon save → start fresh in the new system
      S = defaultState();
    }
    S.bank  = S.bank || { coins: 25 };
    S.equip = Object.assign({ weapon: null, armor: null, tool: null, amulet: null }, S.equip || {});
    S.mastery = S.mastery || {};
    S.shop = S.shop || {};
    if (!S.skillsXp) S.skillsXp = defaultState().skillsXp;
    SKILLS.forEach(s => { if (typeof S.skillsXp[s.id] !== 'number') S.skillsXp[s.id] = (s.id === 'hitpoints' ? xpForLevel(10) : 0); });
    progress = 0; cmb = null;
    if (S.action && S.action.type === 'combat') { const m = MONSTER[S.action.id]; if (m) cmb = { id: m.id, mhp: m.hp, php: maxHp(), pAtk: PATK_INT, mAtk: m.interval, flash: 0 }; }
    S.savedAt = Date.now();
  }
  function saveGame() { S.savedAt = Date.now(); SaveSystem.write(GAME_ID, SAVE_VERSION, S); }

  /* ── Rendering ───────────────────────────────────────────────── */
  let activeTab = localStorage.getItem('rl_tab') || 'skills';

  window.IdleRealm_tab = function(tab, btn) {
    activeTab = tab; localStorage.setItem('rl_tab', tab);
    document.querySelectorAll('#screen-dungeon .tab-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderAll();
  };
  function syncTabButtons() {
    document.querySelectorAll('#screen-dungeon .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === activeTab));
  }

  function xpBar(id) {
    const lvl = skillLevel(id), xp = skillXp(id);
    const cur = xpForLevel(lvl), next = xpForLevel(lvl + 1);
    const pct = lvl >= MAX_LEVEL ? 100 : Math.max(0, (xp - cur) / (next - cur) * 100);
    return { lvl, pct, xp, next };
  }
  // Expected XP/sec a skill action yields (accounts for cooking burn)
  function actionXpRate(a) {
    let perCycle = a.xp;
    if (a.output && a.burn) { const bc = cookBurnChance(a); perCycle = a.xp * (1 - bc) + Math.floor(a.xp * 0.3) * bc; }
    return perCycle / actionEffTime(a);
  }
  // Seconds until the next level in `skillId` at the given xp/sec (null if maxed/idle)
  function etaToLevel(skillId, xpPerSec) {
    const lvl = skillLevel(skillId);
    if (lvl >= MAX_LEVEL || xpPerSec <= 0) return null;
    return (xpForLevel(lvl + 1) - skillXp(skillId)) / xpPerSec;
  }
  // The next still-locked action in a skill (for "next unlock" ETA)
  function nextUnlock(skillId) {
    const lvl = skillLevel(skillId);
    return ACTIONS.filter(a => a.skill === skillId && a.lvl > lvl).sort((a, b) => a.lvl - b.lvl)[0] || null;
  }
  // Compact ETA line for the active skill action
  function skillEtaLine(a) {
    const rate = actionXpRate(a);
    const tl = etaToLevel(a.skill, rate);
    let parts = [];
    parts.push(tl != null ? `⏳ Lv.${skillLevel(a.skill) + 1} in <b>${Fmt.time(tl)}</b>` : '⏳ <b class="text-gold">maxed</b>');
    const nu = nextUnlock(a.skill);
    if (nu && rate > 0) parts.push(`🔓 ${nu.name} in <b>${Fmt.time((xpForLevel(nu.lvl) - skillXp(a.skill)) / rate)}</b>`);
    return parts.join(' · ');
  }
  function foodCount() { return Object.keys(S.bank).reduce((n, id) => n + ((ITEMS[id] && ITEMS[id].type === 'food') ? bankCount(id) : 0), 0); }
  // ETA line for combat: time to next level of the trained style skill
  function combatEtaLine(m) {
    const kps = playerDps(m) / m.hp;                 // kills per second
    const tl = etaToLevel(styleSkill(), kps * m.xp);
    const sk = SKILL[styleSkill()];
    if (tl == null) return `⏳ ${sk.name} <b class="text-gold">maxed</b> · ~${Fmt.time(1 / kps)}/kill`;
    return `⏳ ${sk.name} Lv.${skillLevel(styleSkill()) + 1} in <b>${Fmt.time(tl)}</b> · ~${Fmt.time(1 / kps)}/kill`;
  }

  function renderActiveHeader() {
    const el = document.getElementById('rl-active');
    if (!el) return;
    if (!S.action) {
      el.innerHTML = `<div style="padding:14px;text-align:center;color:var(--text2)">💤 Idle. Pick a skill or a monster below to start — only one action runs at a time.</div>`;
      return;
    }
    if (S.action.type === 'combat') {
      const m = MONSTER[S.action.id];
      const mp = cmb ? Math.max(0, cmb.mhp / m.hp * 100) : 100;
      const pp = cmb ? Math.max(0, cmb.php / maxHp() * 100) : 100;
      el.innerHTML = `
        <div style="font-size:12px;color:var(--text2);margin-bottom:6px">⚔️ Fighting · ${m.zone} · Style: <b>${styleName()}</b> <button class="bld-level" style="float:right" onclick="IdleRealm_stop()">⏹ Stop</button></div>
        <div id="rl-enemy-area" style="text-align:center;font-size:46px;line-height:1;${cmb && cmb.flash > 0 ? 'filter:brightness(1.7)' : ''}">${m.icon}</div>
        <div style="font-size:12px;color:var(--text2);text-align:center;margin:4px 0 2px">${m.name} · ${cmb ? Fmt.format(Math.max(0, Math.ceil(cmb.mhp))) : m.hp} / ${m.hp} HP</div>
        <div class="progress-bar"><div class="progress-fill" style="width:${mp}%;background:var(--red)"></div></div>
        <div style="font-size:12px;color:var(--text2);margin:8px 0 2px">❤️ You · ${cmb ? Fmt.format(Math.max(0, Math.ceil(cmb.php))) : maxHp()} / ${maxHp()} HP · 🍖 ${foodCount()} food</div>
        <div class="progress-bar" style="height:8px"><div class="progress-fill green" style="width:${pp}%"></div></div>
        <div style="font-size:12px;color:var(--text2);margin-top:6px">${combatEtaLine(m)}</div>`;
    } else {
      const a = ACTION[S.action.id];
      const eff = actionEffTime(a);
      const b = xpBar(a.skill);
      el.innerHTML = `
        <div style="font-size:12px;color:var(--text2);margin-bottom:6px">${a.icon} Training <b>${SKILL[a.skill].name}</b> · ${a.name} <button class="bld-level" style="float:right" onclick="IdleRealm_stop()">⏹ Stop</button></div>
        <div style="display:flex;justify-content:space-between;font-size:13px">
          <span>Lv. <b>${b.lvl}</b>${b.lvl < MAX_LEVEL ? ` <span style="color:var(--text2)">→ ${Fmt.format(b.next)} xp</span>` : ' <span class="text-gold">MAX</span>'}</span>
          <span class="text-green">+${a.xp} xp / ${eff.toFixed(1)}s</span>
        </div>
        <div class="progress-bar" style="height:8px;margin-top:4px"><div class="progress-fill" style="width:${b.pct}%;background:var(--accent)"></div></div>
        <div class="progress-bar" style="height:5px;margin-top:4px"><div class="progress-fill green" style="width:${Math.min(100, progress / eff * 100)}%"></div></div>
        <div style="font-size:12px;color:var(--text2);margin-top:6px">${skillEtaLine(a)}</div>
        <div style="font-size:11px;color:var(--text2);margin-top:2px">🎯 Mastery Lv.${masteryLevel(a.id)}/${MASTERY_CAP} · ${Math.round(masterySpeed(a.id) * 100)}% faster · ${Math.round(masteryDouble(a.id) * 100)}% double</div>`;
    }
  }

  function renderTopbar() {
    const el = document.getElementById('rl-topbar');
    if (!el) return;
    el.innerHTML = `🪙 <b class="text-gold">${Fmt.format(bankCount('coins'))}</b>
      <span style="color:var(--text2)">·</span> ⚔️ CB <b>${combatLevel()}</b>
      <span style="color:var(--text2)">·</span> 📊 Total <b>${totalLevel()}</b>`;
  }

  // Skills tab: each non-combat skill with its actions
  function renderSkillsTab() {
    const list = document.getElementById('rl-content');
    if (!list || activeTab !== 'skills') return;
    let html = '<div style="padding:10px;display:flex;flex-direction:column;gap:6px">';
    SKILLS.filter(s => s.kind !== 'combat').forEach(s => {
      const b = xpBar(s.id);
      html += `<div class="menu-section-title" style="padding:8px 2px 2px">${s.icon} ${s.name} <span style="color:var(--text2);font-weight:400">Lv.${b.lvl}</span>
        <div class="progress-bar" style="height:4px;margin-top:3px"><div class="progress-fill" style="width:${b.pct}%;background:var(--accent)"></div></div></div>`;
      ACTIONS.filter(a => a.skill === s.id).forEach(a => {
        const locked = skillLevel(s.id) < a.lvl;
        const active = S.action && S.action.type === 'skill' && S.action.id === a.id;
        const inputTxt = a.inputs ? Object.keys(a.inputs).map(k => `${a.inputs[k]}× ${itemIcon(k)}`).join(' ') + ' → ' : '';
        const outTxt = a.item ? itemIcon(a.item) + ' ' + itemName(a.item) : a.output ? itemIcon(a.output) + ' ' + itemName(a.output) : 'XP only';
        html += `<button class="upgrade-item ${active ? '' : (locked ? 'locked' : 'can-buy')}" onclick="IdleRealm_selectAction('${a.id}')" style="${active ? 'border-color:var(--accent)' : ''}">
            <div class="upg-icon">${a.icon}</div>
            <div class="upg-info">
              <div class="upg-name">${a.name} ${active ? '<span class="text-accent" style="font-size:11px">● active</span>' : ''}</div>
              <div style="font-size:12px;color:var(--text2)">${locked ? `🔒 Lv.${a.lvl}` : `${inputTxt}${outTxt}`}</div>
              ${!locked && masteryLevel(a.id) > 0 ? `<div style="font-size:11px;color:var(--accent)">🎯 Mastery ${masteryLevel(a.id)}</div>` : ''}
            </div>
            <div style="text-align:right;flex-shrink:0;font-size:12px"><div class="text-green">+${a.xp} xp</div><div style="color:var(--text2)">${a.time.toFixed(1)}s</div></div>
          </button>`;
      });
    });
    html += '</div>';
    list.innerHTML = html;
  }

  function renderCombatTab() {
    const list = document.getElementById('rl-content');
    if (!list || activeTab !== 'combat') return;
    const styles = [['attack', 'Accurate', '⚔️'], ['strength', 'Aggressive', '💪'], ['defence', 'Defensive', '🛡️']];
    let html = '<div style="padding:10px;display:flex;flex-direction:column;gap:6px">';
    html += `<div style="font-size:12px;color:var(--text2)">Combat style — which skill your kills train (Hitpoints always shares):</div>
      <div style="display:flex;gap:6px">${styles.map(([id, nm, ic]) => `<button class="buy-amt-btn ${S.combatStyle === id ? 'active' : ''}" style="flex:1" onclick="IdleRealm_setStyle('${id}')">${ic} ${nm}</button>`).join('')}</div>`;
    ZONES.forEach(z => {
      html += `<div class="menu-section-title" style="padding:8px 2px 2px">📍 ${z}</div>`;
      MONSTERS.filter(m => m.zone === z).forEach(m => {
        const locked = combatLevel() < m.reqCb;
        const active = S.action && S.action.type === 'combat' && S.action.id === m.id;
        const dropTxt = (m.drops || []).length ? ' · drops ' + m.drops.map(d => itemIcon(d.item)).join('') : '';
        html += `<button class="upgrade-item ${active ? '' : (locked ? 'locked' : 'can-buy')}" onclick="IdleRealm_fight('${m.id}')" style="${active ? 'border-color:var(--accent)' : ''}">
            <div class="upg-icon">${m.icon}</div>
            <div class="upg-info">
              <div class="upg-name">${m.name} ${active ? '<span class="text-accent" style="font-size:11px">● fighting</span>' : ''}</div>
              <div style="font-size:12px;color:var(--text2)">${locked ? `🔒 Combat Lv.${m.reqCb}` : `${m.hp} HP · max hit ${m.maxHit} · +${m.xp} xp${dropTxt}`}</div>
            </div>
            <div style="flex-shrink:0;font-size:12px;color:var(--text2)">CB ${m.reqCb}</div>
          </button>`;
      });
    });
    html += '</div>';
    list.innerHTML = html;
  }

  function renderBankTab() {
    const list = document.getElementById('rl-content');
    if (!list || activeTab !== 'bank') return;
    const ids = Object.keys(S.bank).filter(id => bankCount(id) > 0);
    const order = { currency: 0, gear: 1, food: 2, bar: 3, ore: 4, log: 5, raw: 6, treasure: 7 };
    ids.sort((a, b) => (order[(ITEMS[a] || {}).type] ?? 9) - (order[(ITEMS[b] || {}).type] ?? 9));
    let html = '<div style="padding:10px;display:flex;flex-direction:column;gap:6px">';
    html += `<div style="font-size:12px;color:var(--text2)">Bank — tap gear to equip, or sell items for coins.</div>`;
    ids.forEach(id => {
      const it = ITEMS[id] || { name: id, icon: '❔' };
      const isGear = it.type === 'gear';
      const equipped = isGear && S.equip[it.slot] === id;
      let sub = '';
      if (isGear) {
        if (it.slot === 'weapon') sub = `+${it.acc} acc / +${it.str} str`;
        else if (it.slot === 'armor') sub = `+${it.def} def`;
        else if (it.slot === 'tool') sub = `+${Math.round(it.speed * 100)}% gather`;
        else if (it.slot === 'amulet') sub = [it.acc?`+${it.acc} acc`:'', it.str?`+${it.str} str`:'', it.gspeed?`+${Math.round(it.gspeed*100)}% gather`:'', it.rare?`+${Math.round(it.rare*100)}% rare drops`:''].filter(Boolean).join(', ');
      }
      else if (it.type === 'food') sub = `heals ${foodHeal(id)}`;
      else if (id !== 'coins') sub = `${it.value || 1} ea`;
      html += `<div class="upgrade-item" style="${equipped ? 'border-color:var(--accent)' : ''}">
          <div class="upg-icon">${it.icon}</div>
          <div class="upg-info"><div class="upg-name">${it.name} <span style="color:var(--text2);font-size:12px">×${Fmt.format(bankCount(id))}</span> ${equipped ? '<span class="text-accent" style="font-size:11px">equipped</span>' : ''}</div>
            <div style="font-size:12px;color:var(--text2)">${sub}</div></div>
          <div style="display:flex;gap:4px;flex-shrink:0">
            ${isGear && !equipped ? `<button class="bld-level can-buy" onclick="IdleRealm_equip('${id}')">Equip</button>` : ''}
            ${id !== 'coins' ? `<button class="bld-level" onclick="IdleRealm_sell('${id}')" style="color:var(--gold)">🪙${Fmt.format((it.value || 1) * bankCount(id))}</button>` : ''}
          </div>
        </div>`;
    });
    html += '</div>';
    list.innerHTML = html;
  }

  function renderStatsTab() {
    const list = document.getElementById('rl-content');
    if (!list || activeTab !== 'stats') return;
    let html = '<div style="padding:10px;display:flex;flex-direction:column;gap:8px">';
    const eq = ['weapon', 'armor', 'tool', 'amulet'].map(sl => { const it = equippedItem(sl); return `${sl}: ${it ? it.icon + ' ' + it.name : '—'}`; }).join(' · ');
    html += `<div style="font-size:12px;color:var(--text2)">Equipped — ${eq}</div>`;
    html += `<div class="stat-row"><span class="text-muted">Combat level</span><span class="text-accent">${combatLevel()}</span></div>`;
    html += `<div class="stat-row"><span class="text-muted">Total level</span><span>${totalLevel()} / ${SKILLS.length * 99}</span></div>`;
    html += `<div class="stat-row"><span class="text-muted">Max hit / Max HP</span><span>${playerMaxHit()} / ${maxHp()}</span></div>`;
    html += `<div class="stat-row"><span class="text-muted">Monsters slain</span><span>${Fmt.format(S.kills || 0)}</span></div>`;
    SKILLS.forEach(s => {
      const b = xpBar(s.id);
      html += `<div style="margin-top:2px">
        <div style="display:flex;justify-content:space-between;font-size:13px"><span>${s.icon} ${s.name}</span><span>Lv.${b.lvl} <span style="color:var(--text2);font-size:11px">${Fmt.format(b.xp)} xp</span></span></div>
        <div class="progress-bar" style="height:5px;margin-top:2px"><div class="progress-fill" style="width:${b.pct}%;background:${s.kind === 'combat' ? 'var(--red)' : 'var(--accent)'}"></div></div></div>`;
    });
    html += '</div>';
    list.innerHTML = html;
  }

  function renderStoreTab() {
    const list = document.getElementById('rl-content');
    if (!list || activeTab !== 'store') return;
    let html = '<div style="padding:10px;display:flex;flex-direction:column;gap:6px">';
    html += `<div style="font-size:12px;color:var(--text2)">General Store — spend 🪙 coins (from selling loot & monster kills) on permanent upgrades.</div>`;
    SHOP.forEach(def => {
      const lvl = shopLvl(def.id);
      const maxed = lvl >= def.max;
      const cost = shopCost(def, lvl);
      const aff = !maxed && bankCount('coins') >= cost;
      html += `<button class="upgrade-item ${maxed ? '' : (aff ? 'can-buy' : 'locked')}" ${maxed ? '' : `onclick="IdleRealm_buyShop('${def.id}')"`}>
          <div class="upg-icon">${def.icon}</div>
          <div class="upg-info">
            <div class="upg-name">${def.name} <span style="color:var(--text2);font-size:12px">Lv.${lvl}/${def.max}</span></div>
            <div style="font-size:12px;color:var(--text2)">${def.fmt(Math.max(1, lvl))}${!maxed ? ` <span style="color:var(--green)">→ ${def.fmt(lvl + 1)}</span>` : ''}</div>
          </div>
          <div class="text-gold" style="font-size:13px;flex-shrink:0">${maxed ? 'MAX' : '🪙 ' + Fmt.format(cost)}</div>
        </button>`;
    });
    html += '</div>';
    list.innerHTML = html;
  }

  function renderAll() {
    if (!S) return;
    renderTopbar(); renderActiveHeader();
    if (activeTab === 'skills') renderSkillsTab();
    else if (activeTab === 'combat') renderCombatTab();
    else if (activeTab === 'bank') renderBankTab();
    else if (activeTab === 'store') renderStoreTab();
    else if (activeTab === 'stats') renderStatsTab();
  }

  /* ── Help ────────────────────────────────────────────────────── */
  window.IdleRealm_help = function() {
    Modal.show({
      title: 'ℹ️ How Idle Realm works',
      body: `
        <p>This is an <b>idle skiller</b>. You train <b>one action at a time</b> — pick a gathering/production task in <b>Skills</b>, or a monster in <b>Combat</b>. It keeps running while the app is closed (up to 24h).</p>
        <p class="mt-8"><b>Gathering</b> (🪓🎣⛏️) yields raw materials. <b>Production</b> (🔥🍳🔨) turns them into goods: smelt ore → bars → <b>gear</b>, and cook fish → <b>food</b>.</p>
        <p class="mt-8"><b>Combat</b> uses your gear and auto-eats food when hurt. Pick a <b>style</b> — Accurate (Attack), Aggressive (Strength) or Defensive (Defence) — to choose which combat skill levels. Run out of food and you retreat, so keep cooking!</p>
        <p class="mt-8"><b>Rare drops:</b> gathering can yield uncut <b>gems</b> 🔹 (mining is best). Cut them at the forge and craft <b>📿 amulets</b> — a separate equip slot and a real build choice (Power, Accuracy, Foraging, or the dragonstone-only <b>Glory</b>).</p>
        <p class="mt-8"><b>Synergies:</b> smithed <b>tools</b> + an Amulet of Foraging speed gathering (and boost rare drops); <b>Mining</b> level speeds Smithing; <b>Firemaking</b> + Cooking cut burning; and your <b>Cooking</b> level makes every food heal more. Everything feeds everything.</p>
        <p class="mt-8">Every skill grinds to <b>level 99</b> on the classic curve, and loot is <b>rare</b> on purpose — this is a long game. Have fun.</p>
      `,
      actions: [{ label: 'Got it', cls: 'btn-primary' }]
    });
  };

  /* ── Build UI ────────────────────────────────────────────────── */
  function buildUI() {
    const el = document.getElementById('screen-dungeon');
    el.innerHTML = `
      <style>
        #rl-main { display:flex; flex-direction:column; height:100%; }
        #rl-head { flex-shrink:0; padding:12px 14px; background:var(--bg2); border-bottom:1px solid var(--border); }
        #rl-topbar { font-size:14px; margin-bottom:8px; }
        #rl-active { min-height:60px; }
        #rl-content-wrap { flex:1; display:flex; flex-direction:column; min-height:0; }
        #rl-content { flex:1; overflow-y:auto; }
        #screen-dungeon .buy-amt-btn { padding:5px 10px; border-radius:var(--radius-sm); font-size:12px; font-weight:600; background:var(--bg3); border:1px solid var(--border); color:var(--text2); }
        #screen-dungeon .buy-amt-btn.active { background:var(--accent); border-color:var(--accent); color:#fff; }
        #screen-dungeon .upgrade-item.can-buy { border-color:var(--green); }
        #screen-dungeon .upgrade-item.can-buy:active { border-color:var(--accent); }
        #screen-dungeon .bld-level { padding:4px 9px; margin-left:0; }
        #screen-dungeon .bld-level.can-buy { border-color:var(--green); color:var(--green); }
      </style>
      <div id="rl-main">
        <div id="rl-head">
          <div id="rl-topbar"></div>
          <div id="rl-active"></div>
        </div>
        <div id="rl-content-wrap">
          <div class="tab-bar" style="overflow-x:auto;white-space:nowrap;display:flex">
            <button class="tab-btn" data-tab="skills" style="min-width:72px" onclick="IdleRealm_tab('skills',this)">🛠️ Skills</button>
            <button class="tab-btn" data-tab="combat" style="min-width:72px" onclick="IdleRealm_tab('combat',this)">⚔️ Combat</button>
            <button class="tab-btn" data-tab="bank"   style="min-width:64px" onclick="IdleRealm_tab('bank',this)">🎒 Bank</button>
            <button class="tab-btn" data-tab="store"  style="min-width:64px" onclick="IdleRealm_tab('store',this)">🛒 Store</button>
            <button class="tab-btn" data-tab="stats"  style="min-width:64px" onclick="IdleRealm_tab('stats',this)">📊 Stats</button>
          </div>
          <div id="rl-content"></div>
        </div>
      </div>`;
  }

  /* ── Register with Router ────────────────────────────────────── */
  Router.register('dungeon', {
    title: '⚔️ Idle Realm',
    onHelp: () => IdleRealm_help(),
    onEnter: () => {
      loadGame();
      buildUI();
      registerAchievements();
      syncTabButtons();
      checkAchievements();
      renderAll();
      Ticker.add(tickFn);
      autosaveTimer = setInterval(() => saveGame(), AUTOSAVE_MS);
    },
    onLeave: () => {
      saveGame();
      Ticker.remove(tickFn);
      clearInterval(autosaveTimer);
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && document.getElementById('screen-dungeon')?.classList.contains('active')) saveGame();
  });
})(); // end IdleRealm
