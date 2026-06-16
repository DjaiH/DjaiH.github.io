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
    { id:'slayer',     name:'Slayer',     icon:'💀', kind:'slayer' },
  ];
  const SKILL = Object.fromEntries(SKILLS.map(s => [s.id, s]));

  /* ── Items ───────────────────────────────────────────────────── */
  const ITEMS = {
    coins:       { name:'Coins',          icon:'🪙', type:'currency' },
    // logs (8 tiers)
    log_normal:  { name:'Logs',           icon:'🪵', type:'log',  value:2 },
    log_oak:     { name:'Oak Logs',       icon:'🪵', type:'log',  value:6 },
    log_willow:  { name:'Willow Logs',    icon:'🪵', type:'log',  value:14 },
    log_teak:    { name:'Teak Logs',      icon:'🪵', type:'log',  value:22 },
    log_maple:   { name:'Maple Logs',     icon:'🪵', type:'log',  value:35 },
    log_mahogany:{ name:'Mahogany Logs',  icon:'🪵', type:'log',  value:55 },
    log_yew:     { name:'Yew Logs',       icon:'🪵', type:'log',  value:90 },
    log_magic:   { name:'Magic Logs',     icon:'🪵', type:'log',  value:150 },
    // raw fish (8 tiers)
    fish_shrimp: { name:'Raw Shrimp',     icon:'🦐', type:'raw',  value:2 },
    fish_sardine:{ name:'Raw Sardine',    icon:'🐟', type:'raw',  value:4 },
    fish_trout:  { name:'Raw Trout',      icon:'🐟', type:'raw',  value:6 },
    fish_salmon: { name:'Raw Salmon',     icon:'🐟', type:'raw',  value:14 },
    fish_tuna:   { name:'Raw Tuna',       icon:'🐟', type:'raw',  value:22 },
    fish_lobster:{ name:'Raw Lobster',    icon:'🦞', type:'raw',  value:30 },
    fish_sword:  { name:'Raw Swordfish',  icon:'🐠', type:'raw',  value:55 },
    fish_shark:  { name:'Raw Shark',      icon:'🦈', type:'raw',  value:95 },
    // cooked food (heal in combat)
    food_shrimp: { name:'Shrimp',         icon:'🦐', type:'food', heal:30,  value:4 },
    food_sardine:{ name:'Sardine',        icon:'🐟', type:'food', heal:45,  value:7 },
    food_trout:  { name:'Trout',          icon:'🐟', type:'food', heal:70,  value:10 },
    food_salmon: { name:'Salmon',         icon:'🐟', type:'food', heal:120, value:22 },
    food_tuna:   { name:'Tuna',           icon:'🐟', type:'food', heal:160, value:34 },
    food_lobster:{ name:'Lobster',        icon:'🦞', type:'food', heal:200, value:45 },
    food_sword:  { name:'Swordfish',      icon:'🐠', type:'food', heal:280, value:80 },
    food_shark:  { name:'Shark',          icon:'🦈', type:'food', heal:400, value:150 },
    // ores (8 nodes)
    ore_copper:  { name:'Copper Ore',     icon:'🟤', type:'ore',  value:3 },
    ore_tin:     { name:'Tin Ore',        icon:'⚪', type:'ore',  value:3 },
    ore_iron:    { name:'Iron Ore',       icon:'🔴', type:'ore',  value:10 },
    ore_coal:    { name:'Coal',           icon:'⚫', type:'ore',  value:16 },
    ore_gold:    { name:'Gold Ore',       icon:'🟡', type:'ore',  value:70 },
    ore_mithril: { name:'Mithril Ore',    icon:'🔵', type:'ore',  value:48 },
    ore_adamantite:{ name:'Adamantite Ore',icon:'🟩', type:'ore', value:110 },
    ore_runite:  { name:'Runite Ore',     icon:'🟦', type:'ore',  value:260 },
    // bars (6 metal tiers)
    bar_bronze:  { name:'Bronze Bar',     icon:'🟫', type:'bar',  value:8 },
    bar_iron:    { name:'Iron Bar',       icon:'⬜', type:'bar',  value:24 },
    bar_steel:   { name:'Steel Bar',      icon:'◻️', type:'bar',  value:60 },
    bar_mithril: { name:'Mithril Bar',    icon:'🟦', type:'bar',  value:160 },
    bar_adamant: { name:'Adamant Bar',    icon:'🟩', type:'bar',  value:360 },
    bar_rune:    { name:'Rune Bar',       icon:'🟪', type:'bar',  value:800 },
    // gear (slot weapon/armor/tool) — 6 metal tiers
    weapon_bronze: { name:'Bronze Sword',     icon:'🗡️', type:'gear', slot:'weapon', tier:1, acc:6,  str:6,  value:40 },
    weapon_iron:   { name:'Iron Sword',       icon:'🗡️', type:'gear', slot:'weapon', tier:2, acc:12, str:11, value:120 },
    weapon_steel:  { name:'Steel Sword',      icon:'⚔️', type:'gear', slot:'weapon', tier:3, acc:22, str:20, value:340 },
    weapon_mithril:{ name:'Mithril Sword',    icon:'⚔️', type:'gear', slot:'weapon', tier:4, acc:38, str:34, value:900 },
    weapon_adamant:{ name:'Adamant Sword',    icon:'⚔️', type:'gear', slot:'weapon', tier:5, acc:58, str:52, value:2200 },
    weapon_rune:   { name:'Rune Sword',       icon:'⚔️', type:'gear', slot:'weapon', tier:6, acc:82, str:74, value:5000 },
    armor_bronze:  { name:'Bronze Platebody', icon:'🛡️', type:'gear', slot:'armor',  tier:1, def:10, value:50 },
    armor_iron:    { name:'Iron Platebody',   icon:'🛡️', type:'gear', slot:'armor',  tier:2, def:20, value:150 },
    armor_steel:   { name:'Steel Platebody',  icon:'🛡️', type:'gear', slot:'armor',  tier:3, def:36, value:420 },
    armor_mithril: { name:'Mithril Platebody',icon:'🛡️', type:'gear', slot:'armor',  tier:4, def:60, value:1100 },
    armor_adamant: { name:'Adamant Platebody',icon:'🛡️', type:'gear', slot:'armor',  tier:5, def:92, value:2600 },
    armor_rune:    { name:'Rune Platebody',   icon:'🛡️', type:'gear', slot:'armor',  tier:6, def:132,value:6000 },
    tool_bronze:   { name:'Bronze Toolkit',   icon:'🛠️', type:'gear', slot:'tool',   tier:1, speed:0.06, value:60 },
    tool_iron:     { name:'Iron Toolkit',     icon:'🛠️', type:'gear', slot:'tool',   tier:2, speed:0.12, value:180 },
    tool_steel:    { name:'Steel Toolkit',    icon:'🛠️', type:'gear', slot:'tool',   tier:3, speed:0.20, value:480 },
    tool_mithril:  { name:'Mithril Toolkit',  icon:'🛠️', type:'gear', slot:'tool',   tier:4, speed:0.30, value:1300 },
    tool_adamant:  { name:'Adamant Toolkit',  icon:'🛠️', type:'gear', slot:'tool',   tier:5, speed:0.42, value:3000 },
    tool_rune:     { name:'Rune Toolkit',     icon:'🛠️', type:'gear', slot:'tool',   tier:6, speed:0.55, value:6500 },
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
    // ─── Unique super-rare drops (manual-equip build pieces; drop < 0.01%) ───
    // Special weapons (weapon slot, but never auto-equipped — your choice)
    weapon_dragonblade: { name:'Dragonblade',      icon:'🐉', type:'gear', slot:'weapon', unique:true, tier:7, acc:110, str:100, value:60000, trait:'Forged from a dragon — huge damage' },
    weapon_abyssal:     { name:'Abyssal Edge',     icon:'🌀', type:'gear', slot:'weapon', unique:true, tier:8, acc:150, str:135, gxp:0.05, value:120000, trait:'+5% XP from kills' },
    // Rings (new slot)
    ring_power:   { name:'Ring of Power',    icon:'💍', type:'gear', slot:'ring', unique:true, tier:1, acc:30, str:30, value:40000, trait:'Raw combat might' },
    ring_fortune: { name:'Ring of Fortune',  icon:'💍', type:'gear', slot:'ring', unique:true, tier:2, rare:1.0, gspeed:0.10, value:60000, trait:'+100% rare-drop chance, +10% gathering' },
    ring_scholar: { name:'Ring of the Scholar', icon:'💍', type:'gear', slot:'ring', unique:true, tier:2, gxp:0.07, value:60000, trait:'+7% XP from everything' },
    // Hats (new slot)
    hat_slayer:   { name:"Slayer's Helm",    icon:'🪖', type:'gear', slot:'hat', unique:true, tier:2, acc:18, str:18, def:20, slayerPts:2, value:50000, trait:'+2 Slayer points per task' },
    hat_anglers:  { name:"Angler's Hat",     icon:'🎣', type:'gear', slot:'hat', unique:true, tier:1, gspeed:0.12, gxp:0.03, value:30000, trait:'+12% gathering speed, +3% XP' },
    hat_wisdom:   { name:'Crown of Wisdom',  icon:'👑', type:'gear', slot:'hat', unique:true, tier:3, gxp:0.10, def:15, value:90000, trait:'+10% XP from everything' },
  };
  // Skill capes — earned at level 99, a 'cape' equip slot. Each gives +5% global
  // XP plus a perk for its own domain; the Max Cape (all 99) gives +10% and all perks.
  SKILLS.forEach((s, i) => { ITEMS['cape_' + s.id] = { name: s.name + ' Cape', icon: '🎽', type: 'gear', slot: 'cape', tier: i + 1, gxp: 0.05, perkSkill: s.id, perkType: s.kind, value: 5000 }; });
  ITEMS['cape_max'] = { name: 'Max Cape', icon: '🧥', type: 'gear', slot: 'cape', tier: 99, gxp: 0.10, perkSkill: 'all', perkType: 'all', value: 50000 };
  function itemName(id) { return (ITEMS[id] || {}).name || id; }
  function itemIcon(id) { return (ITEMS[id] || {}).icon || '❔'; }

  /* ── Slayer rewards (spend Slayer points earned from tasks) ───── */
  const SLAYER_REWARDS = [
    { id:'sl_dmg',  name:"Slayer's Edge", icon:'⚔️', max:10, base:3, mul:1.6, fmt:l=>`+${l*4}% combat damage` },
    { id:'sl_speed',name:'Bloodlust',     icon:'⚡', max:5,  base:5, mul:1.8, fmt:l=>`+${l*3}% gathering speed` },
    { id:'sl_auto', name:'Slayer Contract',icon:'📜', max:1, base:8, mul:1, fmt:()=>'Auto-assign the next task on completion' },
  ];
  function slayerLvlOf(id) { return (S.slayer && S.slayer.rewards && S.slayer.rewards[id]) || 0; }
  function slayerRewardDef(id) { return SLAYER_REWARDS.find(r => r.id === id); }
  function slayerRewardCost(def, lvl) { return Math.floor(def.base * Math.pow(def.mul, lvl)); }

  /* ── Skill actions (gathering + production) ─────────────────────
        type gather  → produces 1 item every `time` s
        type produce → consumes `inputs`, makes `output` (cooking can burn) */
  const ACTIONS = [
    // Woodcutting (8)
    { id:'wc_normal',  skill:'woodcutting', name:'Normal Tree',  icon:'🌳', lvl:1,  xp:8,   time:3.0, item:'log_normal' },
    { id:'wc_oak',     skill:'woodcutting', name:'Oak Tree',     icon:'🌳', lvl:15, xp:16,  time:3.6, item:'log_oak' },
    { id:'wc_willow',  skill:'woodcutting', name:'Willow Tree',  icon:'🌳', lvl:30, xp:32,  time:4.2, item:'log_willow' },
    { id:'wc_teak',    skill:'woodcutting', name:'Teak Tree',    icon:'🌳', lvl:36, xp:45,  time:4.6, item:'log_teak' },
    { id:'wc_maple',   skill:'woodcutting', name:'Maple Tree',   icon:'🌳', lvl:45, xp:62,  time:5.0, item:'log_maple' },
    { id:'wc_mahogany',skill:'woodcutting', name:'Mahogany Tree',icon:'🌲', lvl:55, xp:88,  time:5.6, item:'log_mahogany' },
    { id:'wc_yew',     skill:'woodcutting', name:'Yew Tree',     icon:'🌲', lvl:70, xp:135, time:6.4, item:'log_yew' },
    { id:'wc_magic',   skill:'woodcutting', name:'Magic Tree',   icon:'🎄', lvl:85, xp:220, time:7.4, item:'log_magic' },
    // Fishing (8)
    { id:'fs_shrimp',  skill:'fishing', name:'Net Shrimp',       icon:'🦐', lvl:1,  xp:7,   time:3.0, item:'fish_shrimp' },
    { id:'fs_sardine', skill:'fishing', name:'Bait Sardine',     icon:'🐟', lvl:5,  xp:12,  time:3.2, item:'fish_sardine' },
    { id:'fs_trout',   skill:'fishing', name:'Fly Trout',        icon:'🐟', lvl:20, xp:24,  time:3.8, item:'fish_trout' },
    { id:'fs_salmon',  skill:'fishing', name:'Fly Salmon',       icon:'🐟', lvl:30, xp:38,  time:4.2, item:'fish_salmon' },
    { id:'fs_tuna',    skill:'fishing', name:'Harpoon Tuna',     icon:'🐟', lvl:40, xp:55,  time:4.8, item:'fish_tuna' },
    { id:'fs_lobster', skill:'fishing', name:'Cage Lobster',     icon:'🦞', lvl:45, xp:68,  time:5.2, item:'fish_lobster' },
    { id:'fs_sword',   skill:'fishing', name:'Harpoon Swordfish',icon:'🐠', lvl:55, xp:95,  time:5.8, item:'fish_sword' },
    { id:'fs_shark',   skill:'fishing', name:'Harpoon Shark',    icon:'🦈', lvl:76, xp:160, time:6.8, item:'fish_shark' },
    // Mining (8)
    { id:'mn_copper',  skill:'mining', name:'Copper Vein',   icon:'🟤', lvl:1,  xp:8,   time:3.0, item:'ore_copper' },
    { id:'mn_tin',     skill:'mining', name:'Tin Vein',      icon:'⚪', lvl:1,  xp:8,   time:3.0, item:'ore_tin' },
    { id:'mn_iron',    skill:'mining', name:'Iron Vein',     icon:'🔴', lvl:15, xp:18,  time:3.6, item:'ore_iron' },
    { id:'mn_coal',    skill:'mining', name:'Coal Seam',     icon:'⚫', lvl:30, xp:30,  time:4.2, item:'ore_coal' },
    { id:'mn_gold',    skill:'mining', name:'Gold Vein',     icon:'🟡', lvl:40, xp:50,  time:4.8, item:'ore_gold' },
    { id:'mn_mithril', skill:'mining', name:'Mithril Vein',  icon:'🔵', lvl:50, xp:70,  time:5.4, item:'ore_mithril' },
    { id:'mn_adamant', skill:'mining', name:'Adamantite Vein',icon:'🟩', lvl:65, xp:110, time:6.2, item:'ore_adamantite' },
    { id:'mn_runite',  skill:'mining', name:'Runite Vein',   icon:'🟦', lvl:80, xp:180, time:7.2, item:'ore_runite' },
    // Firemaking (8) — burns logs for XP
    { id:'fm_normal',  skill:'firemaking', name:'Burn Logs',          icon:'🔥', lvl:1,  xp:12,  time:2.2, inputs:{ log_normal:1 } },
    { id:'fm_oak',     skill:'firemaking', name:'Burn Oak Logs',      icon:'🔥', lvl:15, xp:24,  time:2.6, inputs:{ log_oak:1 } },
    { id:'fm_willow',  skill:'firemaking', name:'Burn Willow Logs',   icon:'🔥', lvl:30, xp:45,  time:3.0, inputs:{ log_willow:1 } },
    { id:'fm_teak',    skill:'firemaking', name:'Burn Teak Logs',     icon:'🔥', lvl:36, xp:60,  time:3.2, inputs:{ log_teak:1 } },
    { id:'fm_maple',   skill:'firemaking', name:'Burn Maple Logs',    icon:'🔥', lvl:45, xp:82,  time:3.6, inputs:{ log_maple:1 } },
    { id:'fm_mahogany',skill:'firemaking', name:'Burn Mahogany Logs', icon:'🔥', lvl:55, xp:115, time:4.0, inputs:{ log_mahogany:1 } },
    { id:'fm_yew',     skill:'firemaking', name:'Burn Yew Logs',      icon:'🔥', lvl:70, xp:175, time:4.6, inputs:{ log_yew:1 } },
    { id:'fm_magic',   skill:'firemaking', name:'Burn Magic Logs',    icon:'🔥', lvl:85, xp:280, time:5.2, inputs:{ log_magic:1 } },
    // Cooking (8) — raw → food, can burn
    { id:'ck_shrimp',  skill:'cooking', name:'Cook Shrimp',    icon:'🦐', lvl:1,  xp:10,  time:2.2, inputs:{ fish_shrimp:1 },  output:'food_shrimp',  burn:0.30 },
    { id:'ck_sardine', skill:'cooking', name:'Cook Sardine',   icon:'🐟', lvl:5,  xp:16,  time:2.4, inputs:{ fish_sardine:1 }, output:'food_sardine', burn:0.29 },
    { id:'ck_trout',   skill:'cooking', name:'Cook Trout',     icon:'🐟', lvl:20, xp:28,  time:2.8, inputs:{ fish_trout:1 },   output:'food_trout',   burn:0.27 },
    { id:'ck_salmon',  skill:'cooking', name:'Cook Salmon',    icon:'🐟', lvl:30, xp:42,  time:3.0, inputs:{ fish_salmon:1 },  output:'food_salmon',  burn:0.25 },
    { id:'ck_tuna',    skill:'cooking', name:'Cook Tuna',      icon:'🐟', lvl:40, xp:58,  time:3.4, inputs:{ fish_tuna:1 },    output:'food_tuna',    burn:0.24 },
    { id:'ck_lobster', skill:'cooking', name:'Cook Lobster',   icon:'🦞', lvl:45, xp:72,  time:3.6, inputs:{ fish_lobster:1 }, output:'food_lobster', burn:0.23 },
    { id:'ck_sword',   skill:'cooking', name:'Cook Swordfish', icon:'🐠', lvl:55, xp:100, time:4.0, inputs:{ fish_sword:1 },   output:'food_sword',   burn:0.22 },
    { id:'ck_shark',   skill:'cooking', name:'Cook Shark',     icon:'🦈', lvl:80, xp:165, time:4.6, inputs:{ fish_shark:1 },   output:'food_shark',   burn:0.20 },
    // Smithing — smelt bars (6)
    { id:'sm_bronze', skill:'smithing', name:'Smelt Bronze', icon:'🟫', lvl:1,  xp:10,  time:3.0, inputs:{ ore_copper:1, ore_tin:1 },     output:'bar_bronze' },
    { id:'sm_iron',   skill:'smithing', name:'Smelt Iron',   icon:'⬜', lvl:15, xp:20,  time:3.4, inputs:{ ore_iron:1 },                  output:'bar_iron' },
    { id:'sm_steel',  skill:'smithing', name:'Smelt Steel',  icon:'◻️', lvl:30, xp:35,  time:3.8, inputs:{ ore_iron:1, ore_coal:2 },      output:'bar_steel' },
    { id:'sm_mithril',skill:'smithing', name:'Smelt Mithril',icon:'🟦', lvl:50, xp:70,  time:4.6, inputs:{ ore_mithril:1, ore_coal:4 },   output:'bar_mithril' },
    { id:'sm_adamant',skill:'smithing', name:'Smelt Adamant',icon:'🟩', lvl:70, xp:130, time:5.4, inputs:{ ore_adamantite:1, ore_coal:6 },output:'bar_adamant' },
    { id:'sm_rune',   skill:'smithing', name:'Smelt Runite', icon:'🟪', lvl:85, xp:230, time:6.4, inputs:{ ore_runite:1, ore_coal:8 },    output:'bar_rune' },
    // Smithing — forge gear (6 tiers × weapon/tool/armor)
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
    { id:'fg_weapon_adamant',skill:'smithing', name:'Forge Adamant Sword',   icon:'⚔️', lvl:70, xp:220, time:5.6, inputs:{ bar_adamant:1 }, output:'weapon_adamant' },
    { id:'fg_tool_adamant',  skill:'smithing', name:'Forge Adamant Toolkit', icon:'🛠️', lvl:72, xp:320, time:5.6, inputs:{ bar_adamant:2 }, output:'tool_adamant' },
    { id:'fg_armor_adamant', skill:'smithing', name:'Forge Adamant Platebody',icon:'🛡️',lvl:75, xp:430, time:6.0, inputs:{ bar_adamant:3 }, output:'armor_adamant' },
    { id:'fg_weapon_rune',   skill:'smithing', name:'Forge Rune Sword',      icon:'⚔️', lvl:85, xp:380, time:6.0, inputs:{ bar_rune:1 },    output:'weapon_rune' },
    { id:'fg_tool_rune',     skill:'smithing', name:'Forge Rune Toolkit',    icon:'🛠️', lvl:87, xp:520, time:6.0, inputs:{ bar_rune:2 },    output:'tool_rune' },
    { id:'fg_armor_rune',    skill:'smithing', name:'Forge Rune Platebody',  icon:'🛡️', lvl:90, xp:700, time:6.4, inputs:{ bar_rune:3 },    output:'armor_rune' },
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
  // Mining is the prime gem source (gold veins richest); woodcutting (bird nests)
  // and fishing (oysters) yield gems only rarely. Higher tiers roll a bit better.
  [['mn_copper',1],['mn_tin',1],['mn_iron',1.4],['mn_coal',1.8],['mn_gold',3.5],['mn_mithril',2.6],['mn_adamant',3.2],['mn_runite',4.0],
   ['wc_normal',0.4],['wc_oak',0.5],['wc_willow',0.6],['wc_teak',0.65],['wc_maple',0.7],['wc_mahogany',0.8],['wc_yew',0.9],['wc_magic',1.1],
   ['fs_shrimp',0.4],['fs_sardine',0.45],['fs_trout',0.5],['fs_salmon',0.6],['fs_tuna',0.65],['fs_lobster',0.7],['fs_sword',0.8],['fs_shark',1.0]]
    .forEach(([id, mult]) => { if (ACTION[id]) ACTION[id].rare = gemTable(mult); });
  // Ultra-rare unique drops from specific gathering actions (chance < 0.01%)
  [['mn_runite', 'ring_fortune', 0.00006], ['wc_magic', 'ring_scholar', 0.00007],
   ['wc_magic', 'hat_wisdom', 0.00004], ['fs_shark', 'hat_anglers', 0.00009],
   ['mn_runite', 'hat_wisdom', 0.00003]]
    .forEach(([id, item, chance]) => { if (ACTION[id]) (ACTION[id].rare = ACTION[id].rare || []).push({ item, chance }); });

  /* ── Monsters (combat). reqCb gates by combat level. 6 zones. ─── */
  const MONSTERS = [
    // Greenfields
    { id:'chicken', name:'Chicken',      icon:'🐔', zone:'Greenfields', reqCb:1,  hp:6,    maxHit:1,  acc:2,  def:1,  xp:5,   coins:[1,4],    interval:2.4 },
    { id:'rat',     name:'Giant Rat',    icon:'🐀', zone:'Greenfields', reqCb:1,  hp:12,   maxHit:2,  acc:4,  def:3,  xp:9,   coins:[2,6],    interval:2.4 },
    { id:'cow',     name:'Cow',          icon:'🐄', zone:'Greenfields', reqCb:3,  hp:20,   maxHit:3,  acc:6,  def:5,  xp:13,  coins:[3,9],    interval:2.5 },
    { id:'wolf',    name:'Wolf',         icon:'🐺', zone:'Greenfields', reqCb:6,  hp:34,   maxHit:4,  acc:9,  def:8,  xp:20,  coins:[4,12],   interval:2.6 },
    // Stonebreak Caves
    { id:'goblin',  name:'Goblin',       icon:'👺', zone:'Stonebreak',  reqCb:12, hp:55,   maxHit:6,  acc:16, def:14, xp:32,  coins:[8,22],   interval:2.6, drops:[{ item:'ore_iron', min:1, max:2, chance:0.10 }] },
    { id:'skeleton',name:'Skeleton',     icon:'💀', zone:'Stonebreak',  reqCb:16, hp:72,   maxHit:8,  acc:22, def:19, xp:44,  coins:[12,30],  interval:2.6, drops:[{ item:'ore_coal', min:1, max:2, chance:0.12 }] },
    { id:'bandit',  name:'Bandit',       icon:'🥷', zone:'Stonebreak',  reqCb:20, hp:90,   maxHit:9,  acc:28, def:24, xp:55,  coins:[18,44],  interval:2.6, drops:[{ item:'bar_iron', min:1, max:1, chance:0.06 }, { item:'weapon_iron', min:1, max:1, chance:0.012 }] },
    { id:'hobgob',  name:'Hobgoblin',    icon:'👹', zone:'Stonebreak',  reqCb:30, hp:140,  maxHit:13, acc:42, def:40, xp:90,  coins:[30,70],  interval:2.8, drops:[{ item:'ore_coal', min:1, max:3, chance:0.12 }, { item:'armor_iron', min:1, max:1, chance:0.012 }] },
    // Frostpeak
    { id:'icewolf', name:'Ice Wolf',     icon:'🐺', zone:'Frostpeak',   reqCb:38, hp:190,  maxHit:16, acc:54, def:50, xp:120, coins:[44,96],  interval:2.8, drops:[{ item:'ore_mithril', min:1, max:1, chance:0.07 }] },
    { id:'troll',   name:'Mountain Troll',icon:'🧌',zone:'Frostpeak',   reqCb:42, hp:230,  maxHit:19, acc:62, def:58, xp:150, coins:[55,120], interval:3.0, drops:[{ item:'ore_mithril', min:1, max:2, chance:0.08 }, { item:'weapon_steel', min:1, max:1, chance:0.01 }] },
    { id:'yeti',    name:'Yeti',         icon:'❄️', zone:'Frostpeak',   reqCb:50, hp:300,  maxHit:23, acc:78, def:72, xp:200, coins:[72,160], interval:3.0, drops:[{ item:'bar_mithril', min:1, max:1, chance:0.06 }, { item:'armor_steel', min:1, max:1, chance:0.01 }] },
    { id:'ogre',    name:'Ogre',         icon:'👿', zone:'Frostpeak',   reqCb:55, hp:360,  maxHit:26, acc:88, def:80, xp:240, coins:[90,200], interval:3.0, drops:[{ item:'ore_adamantite', min:1, max:2, chance:0.06 }, { item:'weapon_mithril', min:1, max:1, chance:0.008 }] },
    // Emberdeep
    { id:'imp',     name:'Imp',          icon:'👺', zone:'Emberdeep',   reqCb:60, hp:430,  maxHit:30, acc:102,def:94, xp:300, coins:[120,260],interval:3.0, drops:[{ item:'ore_adamantite', min:1, max:2, chance:0.08 }, { item:'armor_mithril', min:1, max:1, chance:0.008 }] },
    { id:'demon',   name:'Lesser Demon', icon:'😈', zone:'Emberdeep',   reqCb:70, hp:560,  maxHit:36, acc:120,def:112,xp:400, coins:[160,340],interval:3.0, drops:[{ item:'bar_adamant', min:1, max:1, chance:0.06 }, { item:'weapon_adamant', min:1, max:1, chance:0.006 }, { item:'gem_dragon', min:1, max:1, chance:0.001 }] },
    { id:'hellhound',name:'Hellhound',   icon:'🐕', zone:'Emberdeep',   reqCb:78, hp:700,  maxHit:43, acc:144,def:136,xp:520, coins:[210,440],interval:3.0, drops:[{ item:'ore_runite', min:1, max:1, chance:0.05 }, { item:'armor_adamant', min:1, max:1, chance:0.006 }] },
    // Dragon's Lair
    { id:'green_dragon', name:'Green Dragon', icon:'🐉', zone:"Dragon's Lair", reqCb:85, hp:880,  maxHit:50, acc:170,def:160,xp:700,  coins:[300,650],  interval:3.2, drops:[{ item:'weapon_rune', min:1, max:1, chance:0.006 }, { item:'gem_dragon', min:1, max:1, chance:0.003 }] },
    { id:'red_dragon',   name:'Red Dragon',   icon:'🐲', zone:"Dragon's Lair", reqCb:95, hp:1150, maxHit:60, acc:210,def:200,xp:900,  coins:[420,880],  interval:3.2, drops:[{ item:'armor_rune', min:1, max:1, chance:0.006 }, { item:'gem_dragon', min:1, max:1, chance:0.005 }] },
    // The Abyss
    { id:'wyrm',    name:'Abyssal Wyrm', icon:'🪱', zone:'The Abyss',   reqCb:105,hp:1500, maxHit:72, acc:260,def:250,xp:1200, coins:[600,1200], interval:3.4, drops:[{ item:'bar_rune', min:1, max:2, chance:0.06 }, { item:'gem_dragon', min:1, max:1, chance:0.006 }] },
    { id:'kraken',  name:'Kraken',       icon:'🦑', zone:'The Abyss',   reqCb:115,hp:2000, maxHit:88, acc:320,def:310,xp:1600, coins:[900,1800], interval:3.4, drops:[{ item:'weapon_rune', min:1, max:1, chance:0.01 }, { item:'armor_rune', min:1, max:1, chance:0.01 }, { item:'gem_dragon', min:1, max:2, chance:0.01 }] },
  ];
  const MONSTER = Object.fromEntries(MONSTERS.map(m => [m.id, m]));
  const ZONES = [...new Set(MONSTERS.map(m => m.zone))];
  // Ultra-rare unique drops from specific monsters (chance < 0.01%)
  [['green_dragon', 'weapon_dragonblade', 0.00006], ['red_dragon', 'weapon_dragonblade', 0.00009],
   ['wyrm', 'weapon_abyssal', 0.00005], ['kraken', 'weapon_abyssal', 0.00008],
   ['troll', 'ring_power', 0.00005], ['ogre', 'ring_power', 0.00007], ['demon', 'ring_power', 0.00009],
   ['demon', 'hat_slayer', 0.00007], ['hellhound', 'hat_slayer', 0.00009],
   ['kraken', 'ring_fortune', 0.00006]]
    .forEach(([mid, item, chance]) => { const m = MONSTER[mid]; if (m) (m.drops = m.drops || []).push({ item, min: 1, max: 1, chance }); });

  /* ── State ───────────────────────────────────────────────────── */
  let S = null, tickFn = null, autosaveTimer = null;
  let progress = 0;            // seconds accumulated on the active action (transient)
  let cmb = null;              // transient combat state { id, mhp, php, pAtk, mAtk, flash }
  let headerThrottle = 0, contentThrottle = 0;
  let contentTouching = false; // user is touching the tab list — pause re-renders
  let hiddenAt = 0;            // timestamp the screen was hidden (for away catch-up)

  function defaultState() {
    const skillsXp = {};
    SKILLS.forEach(s => { skillsXp[s.id] = (s.id === 'hitpoints') ? xpForLevel(10) : 0; });
    return {
      schema:      'realm',          // marker: distinguishes the reworked save
      skillsXp,
      bank:        { coins: 25 },
      equip:       { weapon: null, armor: null, tool: null, amulet: null, cape: null, ring: null, hat: null },
      action:      null,             // { type:'skill', id } | { type:'combat', id }
      combatStyle: 'attack',         // attack | strength | defence (Accurate/Aggressive/Defensive)
      mastery:     {},               // actionId -> mastery xp (per-action progression)
      shop:        {},               // shop upgrade id -> level (coin sink)
      slayer:      { task: null, left: 0, total: 0, points: 0, done: 0, rewards: {} },
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
  function maxHp() { return Math.floor(skillLevel('hitpoints') * 10 * (1 + 0.04 * shopLvl('bulwark'))); }
  function addXp(id, amount) {
    if (!amount) return;
    amount = Math.round(amount * globalXpMul());   // Tome of Learning
    const before = skillLevel(id);
    S.skillsXp[id] = skillXp(id) + amount;
    const after = skillLevel(id);
    if (after > before) {
      Toast.show(SKILL[id].icon, SKILL[id].name + ' Level ' + after + '!', after >= MAX_LEVEL ? 'Maxed — 99!' : '', after >= MAX_LEVEL);
      Haptics.vibrate([40, 30, 60]);
      if (before < MAX_LEVEL && after >= MAX_LEVEL) grantCape(id);
      checkAchievements();
    }
  }
  // Grant a skill's cape at 99 (and the Max Cape once every skill is 99).
  function grantCape(id) {
    if (!bankCount('cape_' + id) && S.equip.cape !== 'cape_' + id) {
      bankAdd('cape_' + id, 1);
      AchievementSystem.unlock('r_cape');
      Toast.show('🎽', SKILL[id].name + ' Cape!', 'Equip it from the Bank — capes give +5% XP & a perk', true);
    }
    if (SKILLS.every(s => skillLevel(s.id) >= MAX_LEVEL) && !bankCount('cape_max') && S.equip.cape !== 'cape_max') {
      bankAdd('cape_max', 1);
      AchievementSystem.unlock('r_maxcape');
      Toast.show('🧥', 'MAX CAPE!', 'Every skill at 99 — the ultimate cape', true);
    }
  }

  // Safety net: grant capes for any skill already at 99 but missing its cape
  // (covers reaching 99 via offline progress, which bypasses addXp/grantCape).
  function reconcileCapes() {
    SKILLS.forEach(s => { if (skillLevel(s.id) >= MAX_LEVEL) grantCape(s.id); });
  }

  /* ── Bank helpers ────────────────────────────────────────────── */
  // Bag space limits how many distinct *material* stacks you can hold
  // (gear/gems/amulets/capes never count and are never blocked). When full,
  // a brand-new material is auto-sold for coins instead of lost.
  const BAG_BASE = 30;
  const MATERIAL_TYPES = { log: 1, raw: 1, food: 1, ore: 1, bar: 1 };
  function isMaterial(id) { return !!MATERIAL_TYPES[(ITEMS[id] || {}).type]; }
  function bankSlotsMax() { return BAG_BASE + 5 * shopLvl('bagspace'); }
  function bankSlotsUsed() { return Object.keys(S.bank).filter(k => isMaterial(k) && S.bank[k] > 0).length; }
  function bankCount(id) { return (S.bank && S.bank[id]) || 0; }
  function bankAdd(id, q) {
    if (id !== 'coins' && isMaterial(id) && bankCount(id) === 0 && bankSlotsUsed() >= bankSlotsMax()) {
      const gold = ((ITEMS[id] || {}).value || 1) * q;          // bag full → auto-sell the new material
      S.bank.coins = (S.bank.coins || 0) + gold;
      Toast.show('🎒', 'Bag full', `Sold ${q}× ${itemName(id)} +${Fmt.format(gold)}🪙`);
      return;
    }
    S.bank[id] = bankCount(id) + q;
  }
  function bankRemove(id, q) { const n = bankCount(id) - q; if (n > 0) S.bank[id] = n; else delete S.bank[id]; }
  function hasInputs(inputs) { return Object.keys(inputs).every(k => bankCount(k) >= inputs[k]); }
  function spendInputs(inputs) { Object.keys(inputs).forEach(k => bankRemove(k, inputs[k])); }

  /* ── Equipment / derived combat bonuses ──────────────────────── */
  function equippedItem(slot) { const id = S.equip[slot]; return id ? ITEMS[id] : null; }
  function bonus(slot, key)   { const it = equippedItem(slot); return (it && it[key]) || 0; }
  // Sum a numeric bonus across ALL equipped slots (weapon/armor/tool/amulet/
  // cape/ring/hat) — lets new slots and unique items contribute everywhere.
  function eqSum(key) { let t = 0; for (const sl in S.equip) { const it = equippedItem(sl); if (it && typeof it[key] === 'number') t += it[key]; } return t; }
  // Human-readable list of a gear item's bonuses (used in Bank, Codex, Hero).
  function gearDesc(it) {
    if (!it) return '';
    const p = [];
    if (it.acc) p.push(`+${it.acc} acc`);
    if (it.str) p.push(`+${it.str} str`);
    if (it.def) p.push(`+${it.def} def`);
    if (it.speed) p.push(`+${Math.round(it.speed * 100)}% gather`);
    if (it.gspeed) p.push(`+${Math.round(it.gspeed * 100)}% gather`);
    if (it.rare) p.push(`+${Math.round(it.rare * 100)}% rare`);
    if (it.gxp) p.push(`+${Math.round(it.gxp * 100)}% XP`);
    if (it.slayerPts) p.push(`+${it.slayerPts} slayer pts`);
    return p.join(' · ');
  }
  function toolSpeed()        { return eqSum('speed') + eqSum('gspeed'); }
  // Skill-cape perks: does the worn cape help this skill / combat / cooking?
  function capeHelps(skillId) { const c = equippedItem('cape'); return !!c && (c.perkSkill === skillId || c.perkSkill === 'all'); }
  function capeCombat()       { const c = equippedItem('cape'); return c && (c.perkType === 'combat' || c.perkType === 'all') ? 0.05 : 0; }

  // Gathering/production speed: tool + skill level, capped. Synergies:
  //  - mining level speeds Smithing; firemaking level cuts cooking burn.
  function actionEffTime(a) {
    let bonusPct = Math.min(0.30, skillLevel(a.skill) * 0.0025);   // up to -30% from level
    bonusPct += masterySpeed(a.id);                                // per-action mastery
    if (capeHelps(a.skill)) bonusPct += 0.15;                      // matching skill cape
    if (a.skill === 'woodcutting' || a.skill === 'fishing' || a.skill === 'mining') bonusPct += toolSpeed() + 0.03 * shopLvl('gloves') + 0.03 * slayerLvlOf('sl_speed');
    else bonusPct += 0.05 * shopLvl('haste'); // Swift Cooking — production skills (fire/cook/smith)
    if (a.skill === 'smithing') bonusPct += Math.min(0.20, skillLevel('mining') * 0.002); // mining→smithing synergy
    return Math.max(0.3, a.time * (1 - Math.min(0.75, bonusPct)));
  }
  function cookBurnChance(a) {
    if (capeHelps('cooking')) return 0; // Cooking cape never burns
    return Math.max(0, a.burn - skillLevel('cooking') * 0.01 - skillLevel('firemaking') * 0.003);
  }
  // Rare-drop multiplier: Foraging/Fortune gear + Lucky Charm boost gem chances.
  function rareBonus() { return 1 + eqSum('rare') + 0.06 * shopLvl('lucky'); }
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
    { id:'gloves',  name:'Gathering Gloves', icon:'🧤', max:10, base:500,   mul:1.8, fmt:l=>`+${l*3}% gathering speed` },
    { id:'tome',    name:'Tome of Learning', icon:'📖', max:10, base:2000,  mul:2.0, fmt:l=>`+${l*2}% XP from everything` },
    { id:'stomach', name:'Iron Stomach',     icon:'🍖', max:10, base:900,   mul:1.7, fmt:l=>`+${l*5}% food healing` },
    { id:'whet',    name:'Whetstone',        icon:'🎯', max:10, base:1500,  mul:1.9, fmt:l=>`+${l*3}% combat damage` },
    { id:'keen',    name:'Keen Edge',        icon:'🗡️', max:10, base:1500,  mul:1.9, fmt:l=>`+${l*3}% combat accuracy` },
    { id:'bulwark', name:'Bulwark Training', icon:'🛡️', max:10, base:1800,  mul:1.9, fmt:l=>`+${l*4}% max HP` },
    { id:'lucky',   name:'Lucky Charm',      icon:'🍀', max:10, base:2500,  mul:2.0, fmt:l=>`+${l*6}% rare-drop chance` },
    { id:'magnet',  name:'Coin Magnet',      icon:'💰', max:10, base:1200,  mul:1.8, fmt:l=>`+${l*6}% coins from kills` },
    { id:'haste',   name:'Swift Cooking',    icon:'⚗️', max:5,  base:3000,  mul:2.1, fmt:l=>`-${l*5}% production time` },
    { id:'bagspace',name:'Bag Space',        icon:'🎒', max:10, base:800,   mul:1.7, fmt:l=>`+${l*5} bag slots (${BAG_BASE + l*5} total)` },
    { id:'charm',   name:'Offline Charm',    icon:'⏳', max:12, base:1200,  mul:1.6, fmt:l=>`+${l*2}h offline cap (${24 + l*2}h total)` },
  ];
  function shopLvl(id) { return (S.shop && S.shop[id]) || 0; }
  function shopDef(id) { return SHOP.find(s => s.id === id); }
  function shopCost(def, lvl) { return Math.floor(def.base * Math.pow(def.mul, lvl)); }
  function globalXpMul()  { return 1 + 0.02 * shopLvl('tome') + eqSum('gxp'); }
  function combatDmgMul() { return 1 + 0.03 * shopLvl('whet') + 0.04 * slayerLvlOf('sl_dmg') + capeCombat(); }
  function combatAccMul() { return 1 + 0.03 * shopLvl('keen'); }
  function coinMul()      { return 1 + 0.06 * shopLvl('magnet'); }
  function offlineCap()   { return OFFLINE_CAP + shopLvl('charm') * 7200; }

  /* ── Combat math ─────────────────────────────────────────────── */
  // Max hit grows smoothly with Strength (kept as a float so every level moves
  // it visibly; the damage roll and display use it directly).
  function playerMaxHit() { return (1 + (skillLevel('strength') + eqSum('str')) * 0.3) * combatDmgMul(); }
  function playerAtkRoll() { return (skillLevel('attack') + 8) * (1 + eqSum('acc') / 48) * combatAccMul(); }
  function playerDefRoll() { return (skillLevel('defence') + eqSum('def') + 8); }
  function hitChance(atkRoll, defRoll) { return atkRoll / (atkRoll + defRoll); }
  // Combat XP per kill scales with both HP and defence (difficulty), so tougher
  // monsters give the best XP/sec — not the weakest ones you trivially one-shot.
  function monsterXp(m) { return Math.round(m.hp * 0.5 + m.def * 5); }
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
        const it = ITEMS[r.item];
        if (it && it.unique) {
          AchievementSystem.unlock('r_unique');
          if (!quiet) Toast.show(it.icon, '★ UNIQUE drop! ★', it.name + ' — equip from the Bank', true);
        } else {
          AchievementSystem.unlock('r_uncut');
          if (!quiet) Toast.show(itemIcon(r.item), 'Rare find!', 'You found an ' + itemName(r.item) + '!', true);
        }
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
    const mx = monsterXp(m);
    addXp(styleSkill(), mx);
    addXp('hitpoints', Math.round(mx * 0.33));
    const coins = Math.round((m.coins[0] + Math.floor(Math.random() * (m.coins[1] - m.coins[0] + 1))) * coinMul());
    bankAdd('coins', coins);
    (m.drops || []).forEach(d => {
      if (Math.random() < d.chance) {
        const q = d.min + Math.floor(Math.random() * (d.max - d.min + 1));
        bankAdd(d.item, q);
        const it = ITEMS[d.item];
        if (it.unique) { AchievementSystem.unlock('r_unique'); Toast.show(it.icon, '★ UNIQUE drop! ★', it.name + ' — equip from the Bank', true); }
        else Toast.show(it.icon, 'Rare drop!', `${q}× ${it.name}`, true);
        if (it.type === 'gear') maybeAutoEquip(d.item);
      }
    });
    S.kills++;
    // Slayer: progress the assigned task when fighting the right monster
    if (S.slayer && S.slayer.task === m.id && S.slayer.left > 0) {
      addXp('slayer', Math.round(monsterXp(m) * 0.8));
      S.slayer.left--;
      if (S.slayer.left <= 0) completeSlayerTask(m);
    }
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
    if (!document.getElementById('screen-dungeon').classList.contains('active')) return;
    // Header/progress bar updates often (smooth); the tab list rebuilds less
    // often and never mid-touch, to avoid tap-loss and scroll jank.
    headerThrottle += dt;
    if (headerThrottle >= 0.25) { headerThrottle = 0; renderTopbar(); renderActiveHeader(); }
    contentThrottle += dt;
    if (contentThrottle >= 0.6) { contentThrottle = 0; liveRenderTab(); }
  };
  // Re-render the open tab, preserving scroll; skipped while the user is
  // touching the list so a tap or scroll is never interrupted.
  function liveRenderTab() {
    if (contentTouching) return;
    const area = document.getElementById('rl-content');
    const top = area ? area.scrollTop : 0;
    renderActiveTab();
    if (area) area.scrollTop = top;
  }

  /* ── Slayer tasks ────────────────────────────────────────────── */
  function completeSlayerTask(m) {
    // Base points + Slayer cape perk (+1) + Slayer's Helm perk (+slayerPts)
    const pts = 1 + Math.floor(combatLevel() / 8) + (capeHelps('slayer') ? 1 : 0) + eqSum('slayerPts');
    const bonus = Math.round(m.coins[1] * S.slayer.total * 0.5);
    S.slayer.points = (S.slayer.points || 0) + pts;
    S.slayer.done = (S.slayer.done || 0) + 1;
    bankAdd('coins', bonus);
    AchievementSystem.unlock('r_slayer');
    if (S.slayer.done >= 50) AchievementSystem.unlock('r_slayer50');
    Toast.show('💀', 'Task complete!', `+${pts} Slayer points · +${Fmt.format(bonus)} 🪙`, true);
    Haptics.vibrate([60, 40, 90]);
    if (slayerLvlOf('sl_auto')) {
      assignSlayerTask();              // Slayer Contract: roll a new random task…
      // …and follow it — switch your active fight to the new task monster.
      if (S.action && S.action.type === 'combat' && S.slayer.task) {
        const nm = MONSTER[S.slayer.task];
        const php = cmb ? cmb.php : maxHp();
        S.action = { type: 'combat', id: S.slayer.task };
        cmb = { id: nm.id, mhp: nm.hp, php: Math.min(php, maxHp()), pAtk: PATK_INT, mAtk: nm.interval, flash: 0 };
      }
    } else { S.slayer.task = null; S.slayer.left = 0; }
  }
  function assignSlayerTask() {
    const cb = combatLevel();
    const pool = MONSTERS.filter(m => m.reqCb <= cb);
    if (!pool.length) return;
    const m = pool[Math.floor(Math.random() * pool.length)];
    const total = 15 + Math.floor(cb / 2) + Math.floor(Math.random() * 11);
    S.slayer.task = m.id; S.slayer.left = total; S.slayer.total = total;
    Toast.show('💀', 'New Slayer task', `Defeat ${total}× ${m.name}`);
  }
  window.IdleRealm_newTask = function() {
    if (S.slayer.task && S.slayer.left > 0) { Toast.show('💀', 'Finish your task first', `${S.slayer.left}× ${MONSTER[S.slayer.task].name} left`); return; }
    assignSlayerTask();
    renderSlayerTab(); renderActiveHeader();
  };
  // Abandon the current task and roll a new one (prevents being stuck on a task
  // you can't clear — e.g. an auto-assigned monster that's too tough).
  window.IdleRealm_rerollTask = function() {
    assignSlayerTask();
    renderSlayerTab(); renderActiveHeader();
  };
  window.IdleRealm_buySlayer = function(id) {
    const def = slayerRewardDef(id); if (!def) return;
    const lvl = slayerLvlOf(id);
    if (lvl >= def.max) return;
    const cost = slayerRewardCost(def, lvl);
    if ((S.slayer.points || 0) < cost) { Toast.show('💀', 'Not enough points', `Need ${cost} Slayer points`); return; }
    S.slayer.points -= cost;
    if (!S.slayer.rewards) S.slayer.rewards = {};
    S.slayer.rewards[id] = lvl + 1;
    Toast.show(def.icon, def.name + (def.max > 1 ? ' → Lv.' + (lvl + 1) : ''), def.fmt(lvl + 1));
    Haptics.vibrate(40);
    renderSlayerTab();
  };

  /* ── Equipment actions ───────────────────────────────────────── */
  function maybeAutoEquip(id) {
    const it = ITEMS[id]; if (!it || it.type !== 'gear') return;
    // Build-choice slots and unique drops are never auto-equipped — your call.
    if (it.unique || it.slot === 'amulet' || it.slot === 'cape' || it.slot === 'ring' || it.slot === 'hat') return;
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
    const have = bankCount(id); if (have < 1) return;
    const q = sellAmt === 'all' ? have : Math.min(parseInt(sellAmt), have);
    if (q < 1) return;
    const gold = (it.value || 1) * q;
    bankRemove(id, q); bankAdd('coins', gold);
    Toast.show('🪙', 'Sold ' + q + '× ' + it.name, '+' + Fmt.format(gold) + ' coins');
    renderBankTab(); renderTopbar();
  };
  window.IdleRealm_setSellAmt = function(v) { sellAmt = v; localStorage.setItem('rl_sellAmt', v); renderBankTab(); };
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
    AchievementSystem.register('r_unique',  '🌟','One of a Kind',    'Find a unique super-rare item.', 'Fight & gather a LOT — odds are tiny');
    AchievementSystem.register('r_mastery', '🎯','Master of One',    'Max an action to mastery 50.', 'Repeat one action a lot');
    AchievementSystem.register('r_store',   '🛒','Big Spender',      'Buy a Store upgrade.',         'Sell loot, spend coins');
    AchievementSystem.register('r_slayer',  '💀','Slayer',           'Complete a Slayer task.',      'Take a task, then fight');
    AchievementSystem.register('r_slayer50','☠️','Master Slayer',    'Complete 50 Slayer tasks.',    'Keep taking tasks');
    AchievementSystem.register('r_cape',    '🎽','Capeworthy',       'Earn a skill cape (level 99).','Max any skill');
    AchievementSystem.register('r_maxcape', '🧥','Completionist',    'Earn the Max Cape (all 99).',  'Max every skill');
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

  /* ── Offline / away progress ─────────────────────────────────── */
  // Simulate `rawElapsedSec` of the active action on state `d` (mutates it).
  // Returns { summary, elapsed } or null if nothing happened. Used both for
  // load-time offline catch-up and for screen-locked-while-open catch-up.
  function runCatchUp(d, rawElapsedSec) {
    if (!d.action) return null;
    const S0 = S; S = d; // run all helpers against the target state
    let summary = '', elapsed = 0;
    try {
      elapsed = Math.min(rawElapsedSec, offlineCap());
      if (elapsed < 60) return null;
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
            const mx = monsterXp(m);
            const sx = Math.round(mx * kills * gxp), hx = Math.round(mx * 0.33 * kills * gxp);
            d.skillsXp[styleSkill()] = (d.skillsXp[styleSkill()] || 0) + sx;
            d.skillsXp.hitpoints = (d.skillsXp.hitpoints || 0) + hx;
            const coins = Math.round((m.coins[0] + m.coins[1]) / 2 * kills * coinMul());
            bankAdd('coins', coins);
            (m.drops || []).forEach(dr => { const got = Math.floor(kills * dr.chance + Math.random()); if (got > 0) bankAdd(dr.item, got * (((dr.min + dr.max) >> 1) || 1)); });
            // Slayer task progress (was previously skipped offline)
            let slayerNote = '';
            if (d.slayer && d.slayer.task === m.id && d.slayer.left > 0) {
              const taskKills = Math.min(kills, d.slayer.left);
              d.skillsXp.slayer = (d.skillsXp.slayer || 0) + Math.round(mx * 0.8 * taskKills * gxp);
              d.slayer.left -= taskKills;
              slayerNote = ` · 💀 ${Fmt.format(taskKills)} task kills`;
              if (d.slayer.left <= 0) { completeSlayerTask(m); slayerNote = ' · 💀 task complete'; }
            }
            // consume the food that was used (cheapest first)
            let need = Math.max(0, dmgPerSec * Math.min(elapsed, kills * ttk) - maxHp());
            const foods = Object.keys(d.bank).filter(id => ITEMS[id] && ITEMS[id].type === 'food').sort((a, b) => ITEMS[a].heal - ITEMS[b].heal);
            for (const fid of foods) { while (need > 0 && bankCount(fid) > 0) { bankRemove(fid, 1); need -= foodHeal(fid); } }
            d.kills = (d.kills || 0) + kills;
            summary = `Combat: ${Fmt.format(kills)} kills · +${Fmt.format(sx)} ${styleName()} XP · +${Fmt.format(coins)} 🪙${slayerNote}`;
          }
        }
      }
    } finally { S = S0; }
    return summary ? { summary, elapsed } : null;
  }
  // Welcome-back popup/toast for a catch-up result.
  function announceCatchUp(res) {
    if (!res) return;
    if (!Settings.get('offlineModal')) { Toast.show('🌙', 'Welcome back', res.summary); return; }
    Modal.show({
      title: '🌙 Welcome back',
      body: `You were away <strong>${Fmt.time(res.elapsed)}</strong> and kept working:<br><br>${res.summary}`,
      actions: [{ label: '⚔️ Continue', cls: 'btn-primary' }]
    });
  }
  function applyOfflineProgress(save) {
    announceCatchUp(runCatchUp(save.data, (Date.now() - (save.savedAt || Date.now())) / 1000));
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
    S.equip = Object.assign({ weapon: null, armor: null, tool: null, amulet: null, cape: null, ring: null, hat: null }, S.equip || {});
    S.mastery = S.mastery || {};
    S.shop = S.shop || {};
    S.slayer = Object.assign({ task: null, left: 0, total: 0, points: 0, done: 0, rewards: {} }, S.slayer || {});
    if (!S.skillsXp) S.skillsXp = defaultState().skillsXp;
    SKILLS.forEach(s => { if (typeof S.skillsXp[s.id] !== 'number') S.skillsXp[s.id] = (s.id === 'hitpoints' ? xpForLevel(10) : 0); });
    progress = 0; cmb = null;
    if (S.action && S.action.type === 'combat') { const m = MONSTER[S.action.id]; if (m) cmb = { id: m.id, mhp: m.hp, php: maxHp(), pAtk: PATK_INT, mAtk: m.interval, flash: 0 }; }
    S.savedAt = Date.now();
  }
  function saveGame() { S.savedAt = Date.now(); SaveSystem.write(GAME_ID, SAVE_VERSION, S); }

  /* ── Rendering ───────────────────────────────────────────────── */
  let activeTab = localStorage.getItem('rl_tab') || 'skills';
  let sellAmt = localStorage.getItem('rl_sellAmt') || '1';
  const expandedDrops = new Set();   // monster ids whose drop table is expanded
  window.IdleRealm_toggleDrops = function(id) { expandedDrops.has(id) ? expandedDrops.delete(id) : expandedDrops.add(id); renderCombatTab(); };

  window.IdleRealm_tab = function(tab, btn) {
    activeTab = tab; localStorage.setItem('rl_tab', tab);
    syncTabButtons();
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
  // Expected XP/sec a skill action yields (accounts for cooking burn + global XP mult)
  function actionXpRate(a) {
    let perCycle = a.xp;
    if (a.output && a.burn) { const bc = cookBurnChance(a); perCycle = a.xp * (1 - bc) + Math.floor(a.xp * 0.3) * bc; }
    return perCycle * globalXpMul() / actionEffTime(a);
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
  // Compact ETA line for the active skill action: next level, next unlock, and 99
  function skillEtaLine(a) {
    const rate = actionXpRate(a);            // xp/sec
    const lvl = skillLevel(a.skill);
    const parts = [];
    const tl = etaToLevel(a.skill, rate);
    parts.push(tl != null ? `⏳ Lv.${lvl + 1} in <b>${Fmt.time(tl)}</b>` : '⏳ <b class="text-gold">maxed</b>');
    const nu = nextUnlock(a.skill);
    if (nu && rate > 0) parts.push(`🔓 ${nu.name} in <b>${Fmt.time((xpForLevel(nu.lvl) - skillXp(a.skill)) / rate)}</b>`);
    if (lvl < MAX_LEVEL && rate > 0) {
      const rem = xpForLevel(MAX_LEVEL) - skillXp(a.skill);
      const perCycleXp = rate * actionEffTime(a);         // xp per completed action
      const acts = Math.ceil(rem / perCycleXp);
      parts.push(`🏁 99 in <b>${Fmt.time(rem / rate)}</b>${(a.item || a.output) ? ` · ~${Fmt.format(acts)} more` : ''}`);
    }
    return parts.join(' · ');
  }
  // ETA to the next mastery level for the active action (mastery xp = a.xp/cycle)
  function masteryEtaLine(a) {
    const lvl = masteryLevel(a.id);
    if (lvl >= MASTERY_CAP) return 'MAX';
    const rate = a.xp / actionEffTime(a);   // mastery xp per second
    if (rate <= 0) return '';
    const need = masteryXpForLevel(lvl + 1) - masteryXp(a.id);
    return `⏳ next ${Fmt.time(need / rate)}`;
  }
  function foodCount() { return Object.keys(S.bank).reduce((n, id) => n + ((ITEMS[id] && ITEMS[id].type === 'food') ? bankCount(id) : 0), 0); }
  // For input-consuming actions: how many of each material are left and how
  // long until the action runs out at the current rate.
  function inputsLine(a) {
    if (!a.inputs) return '';
    const eff = actionEffTime(a);
    let minCycles = Infinity;
    const parts = Object.keys(a.inputs).map(k => {
      const have = bankCount(k), per = a.inputs[k];
      const cyc = Math.floor(have / per);
      if (cyc < minCycles) minCycles = cyc;
      const low = have < per;
      return `<span style="${low ? 'color:var(--red)' : ''}">${itemIcon(k)} ${Fmt.format(have)}</span>`;
    });
    const empty = (minCycles === Infinity || minCycles <= 0) ? '<span style="color:var(--red)">empty!</span>' : `runs out in <b>${Fmt.time(minCycles * eff)}</b>`;
    return `📦 ${parts.join(' · ')} · ${empty}`;
  }
  // ETA line for combat: time to next level (and to 99) of the trained style skill
  function combatEtaLine(m) {
    const kps = playerDps(m) / m.hp;                 // kills per second
    const xpPerSec = kps * monsterXp(m) * globalXpMul();
    const sk = SKILL[styleSkill()], lvl = skillLevel(styleSkill());
    if (lvl >= MAX_LEVEL || xpPerSec <= 0) return `⏳ ${sk.name} <b class="text-gold">maxed</b> · ~${Fmt.time(1 / kps)}/kill`;
    const tl = (xpForLevel(lvl + 1) - skillXp(styleSkill())) / xpPerSec;
    const t99 = (xpForLevel(MAX_LEVEL) - skillXp(styleSkill())) / xpPerSec;
    return `⏳ ${sk.name} Lv.${lvl + 1} in <b>${Fmt.time(tl)}</b> · 🏁 99 in <b>${Fmt.time(t99)}</b> · ~${Fmt.time(1 / kps)}/kill`;
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
        <div style="font-size:12px;color:var(--text2);margin:8px 0 2px">❤️ You · ${cmb ? Fmt.format(Math.max(0, Math.ceil(cmb.php))) : maxHp()} / ${maxHp()} HP · 🍖 ${foodCount()} food · 💥 max hit ${playerMaxHit().toFixed(1)}</div>
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
        ${a.inputs ? `<div style="font-size:11px;color:var(--text2);margin-top:2px">${inputsLine(a)}</div>` : ''}
        <div style="font-size:11px;color:var(--text2);margin-top:2px">🎯 Mastery Lv.${masteryLevel(a.id)}/${MASTERY_CAP} · ${Math.round(masterySpeed(a.id) * 100)}% faster · ${Math.round(masteryDouble(a.id) * 100)}% double · ${masteryEtaLine(a)}</div>`;
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
  // Skills that have trainable actions (the picker entries)
  const TRAINABLE = SKILLS.filter(s => ACTIONS.some(a => a.skill === s.id));
  let selectedSkill = localStorage.getItem('rl_skill') || 'woodcutting';
  if (!TRAINABLE.some(s => s.id === selectedSkill)) selectedSkill = 'woodcutting';
  window.IdleRealm_pickSkill = function(id) { selectedSkill = id; localStorage.setItem('rl_skill', id); renderSkillsTab(); };

  // Sub-grouping for the (long) Smithing action list; null = no subheader.
  function actionGroup(a) {
    if (a.skill !== 'smithing') return null;
    if (a.id.startsWith('sm_')) return 'Smelt Bars';
    if (a.id.startsWith('fg_weapon')) return 'Forge Weapons';
    if (a.id.startsWith('fg_armor')) return 'Forge Armour';
    if (a.id.startsWith('fg_tool')) return 'Forge Tools';
    if (a.id.startsWith('cut_')) return 'Cut Gems';
    if (a.id.startsWith('amu_')) return 'Craft Amulets';
    return null;
  }
  function renderSkillsTab() {
    const list = document.getElementById('rl-content');
    if (!list || activeTab !== 'skills') return;
    // Skill picker (acts as a sidebar/dropdown): one chip per trainable skill
    let html = '<div style="padding:8px 10px 0">';
    html += `<div style="display:flex;gap:6px;flex-wrap:wrap">${TRAINABLE.map(s => {
      const active = s.id === selectedSkill;
      return `<button class="buy-amt-btn ${active ? 'active' : ''}" onclick="IdleRealm_pickSkill('${s.id}')">${s.icon} ${s.name} <span style="opacity:.7">${skillLevel(s.id)}</span></button>`;
    }).join('')}</div></div>`;
    // Selected skill's actions only
    const s = SKILL[selectedSkill];
    const b = xpBar(s.id);
    html += '<div style="padding:10px;display:flex;flex-direction:column;gap:6px">';
    html += `<div class="menu-section-title" style="padding:2px 2px">${s.icon} ${s.name} <span style="color:var(--text2);font-weight:400">Lv.${b.lvl}${b.lvl < MAX_LEVEL ? ` · ${Fmt.format(b.xp)}/${Fmt.format(b.next)} xp` : ' · MAX'}</span>
      <div class="progress-bar" style="height:4px;margin-top:3px"><div class="progress-fill" style="width:${b.pct}%;background:var(--accent)"></div></div></div>`;
    let lastGroup = null;
    ACTIONS.filter(a => a.skill === s.id).forEach(a => {
      const g = actionGroup(a);                       // subheaders (Smithing only)
      if (g && g !== lastGroup) { lastGroup = g; html += `<div style="font-size:11px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:0.05em;padding:6px 2px 0">${g}</div>`; }
      const locked = skillLevel(s.id) < a.lvl;
      const active = S.action && S.action.type === 'skill' && S.action.id === a.id;
      const inputTxt = a.inputs ? Object.keys(a.inputs).map(k => `${a.inputs[k]}× ${itemIcon(k)}(${Fmt.format(bankCount(k))})`).join(' ') + ' → ' : '';
      const outId = a.item || a.output;
      const outTxt = a.item ? itemIcon(a.item) + ' ' + itemName(a.item) : a.output ? itemIcon(a.output) + ' ' + itemName(a.output) : 'XP only';
      const ownTxt = outId ? `<div style="color:var(--gold)">🎒 ${Fmt.format(bankCount(outId))}</div>` : '';
      html += `<button class="upgrade-item ${active ? '' : (locked ? 'locked' : 'can-buy')}" onclick="IdleRealm_selectAction('${a.id}')" style="${active ? 'border-color:var(--accent)' : ''}">
          <div class="upg-icon">${a.icon}</div>
          <div class="upg-info">
            <div class="upg-name">${a.name} ${active ? '<span class="text-accent" style="font-size:11px">● active</span>' : ''}</div>
            <div style="font-size:12px;color:var(--text2)">${locked ? `🔒 Lv.${a.lvl}` : `${inputTxt}${outTxt}`}</div>
            ${!locked && masteryLevel(a.id) > 0 ? `<div style="font-size:11px;color:var(--accent)">🎯 Mastery ${masteryLevel(a.id)}</div>` : ''}
          </div>
          <div style="text-align:right;flex-shrink:0;font-size:12px"><div class="text-green">+${a.xp} xp</div><div style="color:var(--text2)">${a.time.toFixed(1)}s</div>${ownTxt}</div>
        </button>`;
    });
    html += '</div>';
    list.innerHTML = html;
  }

  function renderSlayerTab() {
    const list = document.getElementById('rl-content');
    if (!list || activeTab !== 'slayer') return;
    const sl = S.slayer;
    const b = xpBar('slayer');
    let html = '<div style="padding:10px;display:flex;flex-direction:column;gap:8px">';
    html += `<div class="menu-section-title" style="padding:2px 2px">💀 Slayer <span style="color:var(--text2);font-weight:400">Lv.${b.lvl}</span>
      <div class="progress-bar" style="height:4px;margin-top:3px"><div class="progress-fill" style="width:${b.pct}%;background:var(--red)"></div></div></div>`;
    // Current task card
    if (sl.task && sl.left > 0) {
      const m = MONSTER[sl.task];
      const pct = sl.total ? (sl.total - sl.left) / sl.total * 100 : 0;
      const fighting = S.action && S.action.type === 'combat' && S.action.id === sl.task;
      html += `<div style="background:var(--bg2);border:1px solid var(--red);border-radius:var(--radius-sm);padding:12px">
          <div style="font-size:14px;font-weight:600">${m.icon} Slay ${m.name}</div>
          <div style="font-size:12px;color:var(--text2);margin:2px 0 6px"><b>${sl.left}</b> of ${sl.total} remaining</div>
          <div class="progress-bar" style="height:6px"><div class="progress-fill" style="width:${pct}%;background:var(--red)"></div></div>
          <div style="display:flex;gap:8px;margin-top:8px">
            <button class="btn btn-primary" style="flex:1" onclick="IdleRealm_fight('${sl.task}')">${fighting ? '⚔️ Fighting…' : '⚔️ Fight this task'}</button>
            <button class="buy-amt-btn" onclick="IdleRealm_rerollTask()" title="Abandon this task for a new one">🔁 Reroll</button>
          </div>
        </div>`;
    } else {
      html += `<div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px">
          <div style="font-size:13px;color:var(--text2)">No active task. Take one for Slayer XP, bonus coins and Slayer points.</div>
          <button class="btn btn-primary mt-8" onclick="IdleRealm_newTask()">💀 New Task</button>
        </div>`;
    }
    html += `<div style="display:flex;justify-content:space-between;font-size:13px;padding:2px"><span class="text-muted">Slayer points</span><span class="text-accent">💀 ${Fmt.format(sl.points || 0)} · ${sl.done || 0} tasks done</span></div>`;
    html += '<div class="menu-section-title" style="padding:6px 2px 2px">Slayer Rewards</div>';
    SLAYER_REWARDS.forEach(def => {
      const lvl = slayerLvlOf(def.id);
      const maxed = lvl >= def.max;
      const cost = slayerRewardCost(def, lvl);
      const aff = !maxed && (sl.points || 0) >= cost;
      html += `<button class="upgrade-item ${maxed ? '' : (aff ? 'can-buy' : 'locked')}" ${maxed ? '' : `onclick="IdleRealm_buySlayer('${def.id}')"`}>
          <div class="upg-icon">${def.icon}</div>
          <div class="upg-info">
            <div class="upg-name">${def.name} ${def.max > 1 ? `<span style="color:var(--text2);font-size:12px">Lv.${lvl}/${def.max}</span>` : (maxed ? '<span style="color:var(--green);font-size:12px">✓</span>' : '')}</div>
            <div style="font-size:12px;color:var(--text2)">${def.fmt(Math.max(1, lvl))}</div>
          </div>
          <div class="text-accent" style="font-size:13px;flex-shrink:0">${maxed ? 'Owned' : '💀 ' + cost}</div>
        </button>`;
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
        const hasDrops = (m.drops || []).length > 0;
        const open = expandedDrops.has(m.id);
        html += `<div class="upgrade-item" style="${active ? 'border-color:var(--accent)' : (locked ? 'opacity:0.55' : '')}">
            <div class="upg-icon">${m.icon}</div>
            <div class="upg-info">
              <div class="upg-name">${m.name} ${active ? '<span class="text-accent" style="font-size:11px">● fighting</span>' : ''}</div>
              <div style="font-size:12px;color:var(--text2)">${locked ? `🔒 Combat Lv.${m.reqCb}` : `${Fmt.format(m.hp)} HP · enemy hits ≤${m.maxHit} · +${Fmt.format(monsterXp(m))} xp · 🪙${m.coins[0]}-${m.coins[1]}`}</div>
            </div>
            <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0;align-items:flex-end">
              <button class="bld-level ${locked ? 'locked' : 'can-buy'}" onclick="IdleRealm_fight('${m.id}')">${active ? '⚔️ ●' : 'Fight'}</button>
              ${hasDrops ? `<button class="bld-level" onclick="IdleRealm_toggleDrops('${m.id}')">${open ? '▾ drops' : '▸ drops'}</button>` : ''}
            </div>
          </div>`;
        if (open && hasDrops) {
          html += `<div style="margin:-2px 2px 4px;padding:8px 10px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-sm);font-size:12px">
            <div style="color:var(--text2);margin-bottom:3px">Drop table (per kill):</div>
            ${m.drops.map(d => `<div style="display:flex;justify-content:space-between"><span>${itemIcon(d.item)} ${itemName(d.item)}${d.max > 1 ? ` ×${d.min}-${d.max}` : ''}</span><span class="${d.chance >= 0.05 ? 'text-green' : 'text-gold'}">${dropPct(d.chance)}</span></div>`).join('')}
          </div>`;
        }
      });
    });
    html += '</div>';
    list.innerHTML = html;
  }
  function dropPct(c) { return c >= 0.01 ? Math.round(c * 100) + '%' : (c * 100).toFixed(1) + '%'; }

  function renderBankTab() {
    const list = document.getElementById('rl-content');
    if (!list || activeTab !== 'bank') return;
    const ids = Object.keys(S.bank).filter(id => bankCount(id) > 0);
    // Sort: gear first (equipped, then unique, then highest tier — best on top),
    // then coins, food, gems, materials.
    const order = { gear: 0, currency: 1, food: 2, gem: 3, uncut: 4, bar: 5, ore: 6, log: 7, raw: 8, treasure: 9 };
    const isEq = id => Object.values(S.equip).indexOf(id) >= 0;
    ids.sort((a, b) => {
      const A = ITEMS[a] || {}, B = ITEMS[b] || {};
      const ta = order[A.type] ?? 10, tb = order[B.type] ?? 10;
      if (ta !== tb) return ta - tb;
      if (A.type === 'gear') {
        if (isEq(a) !== isEq(b)) return isEq(a) ? -1 : 1;
        if (!!A.unique !== !!B.unique) return A.unique ? -1 : 1;
        if ((B.tier || 0) !== (A.tier || 0)) return (B.tier || 0) - (A.tier || 0);
        return (A.slot || '').localeCompare(B.slot || '');
      }
      return (B.value || 0) - (A.value || 0);
    });
    let html = '<div style="padding:10px;display:flex;flex-direction:column;gap:6px">';
    const slotsFull = bankSlotsUsed() >= bankSlotsMax();
    html += `<div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--text2)">
        <span>Tap gear to equip, or sell items for coins.</span>
        <span style="${slotsFull ? 'color:var(--red)' : ''}">🎒 ${bankSlotsUsed()}/${bankSlotsMax()} slots</span>
      </div>`;
    // Sell-amount selector — choose how many to sell per tap
    const amts = [['1', '×1'], ['10', '×10'], ['100', '×100'], ['1000', '×1000'], ['all', 'All']];
    html += `<div style="display:flex;gap:6px;align-items:center"><span style="font-size:12px;color:var(--text2)">Sell</span>${amts.map(([v, l]) => `<button class="buy-amt-btn ${sellAmt === v ? 'active' : ''}" onclick="IdleRealm_setSellAmt('${v}')">${l}</button>`).join('')}</div>`;
    ids.forEach(id => {
      const it = ITEMS[id] || { name: id, icon: '❔' };
      const isGear = it.type === 'gear';
      const equipped = isGear && S.equip[it.slot] === id;
      const have = bankCount(id);
      const nSell = sellAmt === 'all' ? have : Math.min(parseInt(sellAmt), have);
      let sub = '';
      if (isGear) {
        if (it.slot === 'cape') sub = `+${Math.round((it.gxp || 0) * 100)}% XP` + (it.perkSkill === 'all' ? ' + all perks' : ` + ${SKILL[it.perkSkill] ? SKILL[it.perkSkill].name : ''} perk`);
        else sub = gearDesc(it);
        if (it.unique) sub = '★ ' + sub;
      }
      else if (it.type === 'food') sub = `heals ${foodHeal(id)}`;
      else if (id !== 'coins') sub = `${it.value || 1} ea`;
      html += `<div class="upgrade-item" style="${equipped ? 'border-color:var(--accent)' : ''}">
          <div class="upg-icon">${it.icon}</div>
          <div class="upg-info"><div class="upg-name">${it.name} <span style="color:var(--text2);font-size:12px">×${Fmt.format(bankCount(id))}</span> ${equipped ? '<span class="text-accent" style="font-size:11px">equipped</span>' : ''}</div>
            <div style="font-size:12px;color:var(--text2)">${sub}</div></div>
          <div style="display:flex;gap:4px;flex-shrink:0">
            ${isGear && !equipped ? `<button class="bld-level can-buy" onclick="IdleRealm_equip('${id}')">Equip</button>` : ''}
            ${id !== 'coins' ? `<button class="bld-level" onclick="IdleRealm_sell('${id}')" style="color:var(--gold)">🪙${Fmt.format((it.value || 1) * nSell)}${sellAmt !== 'all' && have > nSell ? ` ×${nSell}` : ''}</button>` : ''}
          </div>
        </div>`;
    });
    html += '</div>';
    list.innerHTML = html;
  }

  // Short human description of what an item does / is for.
  function itemEffect(id) {
    const it = ITEMS[id]; if (!it) return '';
    if (it.slot === 'cape')   return `Cape · +${Math.round((it.gxp || 0) * 100)}% XP` + (it.perkSkill === 'all' ? ' + all perks' : ` + ${SKILL[it.perkSkill] ? SKILL[it.perkSkill].name : ''} perk`);
    if (it.type === 'gear') {
      const slotName = { weapon:'Weapon', armor:'Armor', tool:'Tool', amulet:'Amulet', ring:'Ring', hat:'Hat' }[it.slot] || 'Gear';
      return (it.unique ? '★ Unique ' : '') + slotName + ' · ' + gearDesc(it) + (it.trait ? ` — ${it.trait}` : '');
    }
    if (it.type === 'food')   return `Food · heals ${it.heal} (more with Cooking)`;
    if (it.type === 'log')    return 'Logs · burn for Firemaking XP';
    if (it.type === 'raw')    return 'Raw fish · cook into food';
    if (it.type === 'ore')    return 'Ore · smelt into bars';
    if (it.type === 'bar')    return 'Bar · forge into gear';
    if (it.type === 'uncut')  return 'Uncut gem · cut at the forge';
    if (it.type === 'gem')    return 'Cut gem · craft into amulets';
    if (it.type === 'currency') return 'Currency';
    return it.type || '';
  }
  function renderItemsTab() {
    const list = document.getElementById('rl-content');
    if (!list || activeTab !== 'items') return;
    const groups = [
      ['Weapons', id => ITEMS[id].slot === 'weapon'],
      ['Armor',   id => ITEMS[id].slot === 'armor'],
      ['Tools',   id => ITEMS[id].slot === 'tool'],
      ['Amulets', id => ITEMS[id].slot === 'amulet'],
      ['Rings',   id => ITEMS[id].slot === 'ring'],
      ['Hats',    id => ITEMS[id].slot === 'hat'],
      ['Capes',   id => ITEMS[id].slot === 'cape'],
      ['Food',    id => ITEMS[id].type === 'food'],
      ['Raw fish',id => ITEMS[id].type === 'raw'],
      ['Logs',    id => ITEMS[id].type === 'log'],
      ['Ores',    id => ITEMS[id].type === 'ore'],
      ['Bars',    id => ITEMS[id].type === 'bar'],
      ['Gems',    id => ITEMS[id].type === 'uncut' || ITEMS[id].type === 'gem'],
    ];
    const ids = Object.keys(ITEMS);
    let html = '<div style="padding:10px;display:flex;flex-direction:column;gap:6px">';
    html += `<div style="display:flex;justify-content:space-between;align-items:center">
        <span class="menu-section-title" style="padding:0">📖 Item Codex</span>
        <button class="buy-amt-btn" onclick="IdleRealm_tab('skills')">← Back</button>
      </div>
      <div style="font-size:12px;color:var(--text2)">Every item in the game, its effect, sell value, and how many you own (✓ = owned).</div>`;
    groups.forEach(([label, test]) => {
      const members = ids.filter(id => { try { return test(id); } catch { return false; } });
      if (!members.length) return;
      html += `<div class="menu-section-title" style="padding:8px 2px 2px">${label}</div>`;
      members.forEach(id => {
        const it = ITEMS[id], have = bankCount(id);
        html += `<div class="upgrade-item" style="${have ? 'border-color:var(--accent)' : ''}">
            <div class="upg-icon">${it.icon}</div>
            <div class="upg-info">
              <div class="upg-name">${it.name} ${have ? `<span class="text-accent" style="font-size:11px">✓ ${Fmt.format(have)}</span>` : ''}</div>
              <div style="font-size:12px;color:var(--text2)">${itemEffect(id)}</div>
            </div>
            <div style="flex-shrink:0;font-size:12px;color:var(--gold)">${it.value ? '🪙' + Fmt.format(it.value) : ''}</div>
          </div>`;
      });
    });
    html += '</div>';
    list.innerHTML = html;
  }

  function renderStatsTab() {
    const list = document.getElementById('rl-content');
    if (!list || activeTab !== 'stats') return;
    const card = (title, inner) => `<div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px">
        <div class="menu-section-title" style="padding:0 0 6px">${title}</div>${inner}</div>`;
    let html = '<div style="padding:10px;display:flex;flex-direction:column;gap:10px">';

    // ── Overview ──
    html += card('🦸 Overview', `
      <div class="stat-row"><span class="text-muted">Combat level</span><span class="text-accent" style="font-weight:700">${combatLevel()}</span></div>
      <div class="stat-row"><span class="text-muted">Total level</span><span>${Fmt.format(totalLevel())} / ${SKILLS.length * 99}</span></div>
      <div class="stat-row"><span class="text-muted">Monsters slain</span><span>${Fmt.format(S.kills || 0)}</span></div>
      <div class="stat-row"><span class="text-muted">Slayer · points / tasks</span><span>💀 ${Fmt.format((S.slayer && S.slayer.points) || 0)} / ${(S.slayer && S.slayer.done) || 0}</span></div>
      <div class="stat-row"><span class="text-muted">Coins</span><span class="text-gold">🪙 ${Fmt.format(bankCount('coins'))}</span></div>`);

    // ── Combat stats ──
    const critNote = '';
    html += card('⚔️ Combat', `
      <div class="stat-row"><span class="text-muted">Max hit</span><span>${playerMaxHit().toFixed(1)}</span></div>
      <div class="stat-row"><span class="text-muted">Max HP</span><span>❤️ ${maxHp()}</span></div>
      <div class="stat-row"><span class="text-muted">Accuracy rating</span><span>${Fmt.format(Math.round(playerAtkRoll()))}</span></div>
      <div class="stat-row"><span class="text-muted">Defence rating</span><span>${Fmt.format(Math.round(playerDefRoll()))}</span></div>
      <div class="stat-row"><span class="text-muted">Food in bank</span><span>🍖 ${foodCount()}</span></div>
      <div style="display:flex;gap:10px;margin-top:6px">${['attack', 'strength', 'defence', 'hitpoints'].map(id => {
        const b = xpBar(id);
        return `<div style="flex:1;text-align:center"><div style="font-size:16px">${SKILL[id].icon}</div><div style="font-size:12px;font-weight:600">${b.lvl}</div><div style="font-size:10px;color:var(--text2)">${SKILL[id].name}</div></div>`;
      }).join('')}</div>`);

    // ── Equipment ──
    const slotRow = (sl, label) => {
      const it = equippedItem(sl);
      let eff = '<span class="text-muted">— empty —</span>';
      if (it) {
        eff = (sl === 'cape')
          ? `+${Math.round((it.gxp || 0) * 100)}% XP` + (it.perkSkill === 'all' ? ' · all perks' : ` · ${SKILL[it.perkSkill] ? SKILL[it.perkSkill].name : ''} perk`)
          : gearDesc(it);
      }
      return `<div class="stat-row"><span>${it ? it.icon : '▫️'} <span class="text-muted">${label}</span> ${it ? it.name : ''}</span><span style="font-size:12px;color:var(--text2);text-align:right">${eff}</span></div>`;
    };
    html += card('🛡️ Equipment', ['weapon', 'armor', 'hat', 'tool', 'amulet', 'ring', 'cape'].map(sl => slotRow(sl, sl[0].toUpperCase() + sl.slice(1))).join(''));

    // ── All skills ──
    let skillsHtml = '';
    SKILLS.forEach(s => {
      const b = xpBar(s.id);
      skillsHtml += `<div style="margin-top:2px">
        <div style="display:flex;justify-content:space-between;font-size:13px"><span>${s.icon} ${s.name}</span><span>Lv.${b.lvl} <span style="color:var(--text2);font-size:11px">${Fmt.format(b.xp)} xp</span></span></div>
        <div class="progress-bar" style="height:5px;margin-top:2px"><div class="progress-fill" style="width:${b.pct}%;background:${s.kind === 'combat' ? 'var(--red)' : 'var(--accent)'}"></div></div></div>`;
    });
    html += card('📊 Skills', skillsHtml);

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

  function renderActiveTab() {
    if (activeTab === 'skills') renderSkillsTab();
    else if (activeTab === 'combat') renderCombatTab();
    else if (activeTab === 'slayer') renderSlayerTab();
    else if (activeTab === 'bank') renderBankTab();
    else if (activeTab === 'store') renderStoreTab();
    else if (activeTab === 'items') renderItemsTab();
    else if (activeTab === 'stats') renderStatsTab();
  }
  function renderAll() {
    if (!S) return;
    renderTopbar(); renderActiveHeader();
    renderActiveTab();
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
        <p class="mt-8"><b>💀 Slayer:</b> take a <b>task</b> (kill N of a monster) for Slayer XP, bonus coins and Slayer points — spend points on permanent perks. <b>🎽 Skill capes</b> drop when you hit <b>99</b> in a skill: a cape slot giving +5% XP plus a perk for its skill (Max Cape for all-99).</p>
        <p class="mt-8"><b>Mastery</b> rises per action (faster + double yields), and the <b>🛒 Store</b> spends coins on permanent boosts. Every skill grinds to <b>99</b> and loot is <b>rare</b> on purpose — a long game. Have fun.</p>
      `,
      actions: [
        { label: '📖 Item Codex', fn: () => IdleRealm_openItems() },
        { label: 'Got it', cls: 'btn-primary' }
      ]
    });
  };
  // The full item list, opened from the ℹ️ info button (no longer a tab).
  window.IdleRealm_openItems = function() {
    activeTab = 'items';
    localStorage.setItem('rl_tab', 'items');
    document.querySelectorAll('#screen-dungeon .tab-btn').forEach(b => b.classList.remove('active'));
    renderAll();
    const area = document.getElementById('rl-content');
    if (area) area.scrollTop = 0;
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
            <button class="tab-btn" data-tab="slayer" style="min-width:72px" onclick="IdleRealm_tab('slayer',this)">💀 Slayer</button>
            <button class="tab-btn" data-tab="bank"   style="min-width:64px" onclick="IdleRealm_tab('bank',this)">🎒 Bank</button>
            <button class="tab-btn" data-tab="store"  style="min-width:64px" onclick="IdleRealm_tab('store',this)">🛒 Store</button>
            <button class="tab-btn" data-tab="stats"  style="min-width:74px" onclick="IdleRealm_tab('stats',this)">🦸 Hero</button>
          </div>
          <div id="rl-content"></div>
        </div>
      </div>`;
    // Pause live re-renders while the user is scrolling/tapping the list.
    const area = document.getElementById('rl-content');
    if (area) {
      const on = () => { contentTouching = true; };
      const off = () => { setTimeout(() => { contentTouching = false; }, 350); };
      area.addEventListener('touchstart', on, { passive: true });
      area.addEventListener('touchend', off, { passive: true });
      area.addEventListener('pointerdown', on);
      area.addEventListener('pointerup', off);
    }
  }

  /* ── Register with Router ────────────────────────────────────── */
  Router.register('dungeon', {
    title: '⚔️ Idle Realm',
    onHelp: () => IdleRealm_help(),
    onEnter: () => {
      loadGame();
      buildUI();
      registerAchievements();
      reconcileCapes();   // grant any cape for a skill already at 99 (e.g. reached offline)
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

  // While the screen is open the rAF ticker pauses when the tab is hidden /
  // phone is locked — so time would be lost. Stamp the moment we hide, and on
  // return run the same catch-up we use for offline, so locked time counts.
  document.addEventListener('visibilitychange', () => {
    const active = document.getElementById('screen-dungeon')?.classList.contains('active');
    if (!active || !S) return;
    if (document.hidden) {
      hiddenAt = Date.now();
      saveGame();
    } else if (hiddenAt) {
      const res = runCatchUp(S, (Date.now() - hiddenAt) / 1000);
      hiddenAt = 0;
      progress = 0;                       // avoid double-counting the in-flight cycle
      if (S.action && S.action.type === 'combat' && cmb) cmb.php = maxHp(); // fresh after a long away gap
      S.savedAt = Date.now();
      announceCatchUp(res);
      renderAll();
    }
  });
})(); // end IdleRealm
