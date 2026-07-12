// 「炒了个菜」界面层:渲染 + 交互 + 动效 + 音效
import { buildLevel, LEVELS, INGREDIENTS, RECIPES, mulberry32 } from './engine.js';

const app = document.getElementById('app');

const store = {
  get(k, d) { try { const v = localStorage.getItem('clgc.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('clgc.' + k, JSON.stringify(v)); } catch { /* 隐私模式等 */ } },
};

// ———— 音效:WebAudio 现场合成,零外部资源 ————
let actx = null;
let muted = store.get('muted', false);
function ac() {
  if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
  if (actx.state === 'suspended') actx.resume();
  return actx;
}
function tone(freq, dur = .1, type = 'sine', gain = .12, delay = 0) {
  if (muted) return;
  try {
    const ctx = ac(), t = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(.001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t); o.stop(t + dur + .02);
  } catch { /* AudioContext 不可用则静默 */ }
}
const sfx = {
  select() { tone(660, .07, 'triangle', .08); },
  slot() { tone(430, .09, 'sine', .1); tone(320, .1, 'sine', .05, .04); },
  link() { tone(784, .09, 'triangle', .1); tone(1175, .12, 'triangle', .09, .06); },
  pair() { tone(880, .1, 'triangle', .1); tone(1319, .14, 'triangle', .09, .07); },
  dish() { [659, 880, 1319, 1760].forEach((f, i) => tone(f, .12, 'triangle', .11, i * .07)); },
  deny() { tone(180, .08, 'square', .05); },
  lose() { [392, 330, 262, 196].forEach((f, i) => tone(f, .18, 'sawtooth', .06, i * .13)); },
  win() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, .16, 'triangle', .12, i * .09)); },
};

const TINTS = ['#FFE3EC', '#FFF1D6', '#E3F4FF', '#E8F9E3', '#F3E8FF', '#FFFAD6', '#DFF6F0', '#FFE9DF', '#EBEBFF', '#FFEFF7'];
const tint = t => TINTS[t.type % TINTS.length];
const EMO = t => INGREDIENTS[t.type].e;

const ICONS = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  sound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H3v6h3l5 4V5z"/><path d="M15.5 9.5a4 4 0 010 5"/><path d="M18 7a7.5 7.5 0 010 10"/></svg>',
  mutedIcon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H3v6h3l5 4V5z"/><path d="M22 9l-6 6M16 9l6 6"/></svg>',
  undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 110 12h-3"/></svg>',
  shuffle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5"/><path d="M3 20L21 3"/><path d="M16 21h5v-5"/><path d="M13.5 13.5L21 21"/><path d="M3 4l6.5 6.5"/></svg>',
  pop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4"/><path d="M7 8l5-5 5 5"/><path d="M4 15v3a3 3 0 003 3h10a3 3 0 003-3v-3"/></svg>',
};

const LEVEL_META = {
  1: { icon: '🥚', rate: '通过率 99%', cls: 'easy', blurb: '30 秒开火热灶' },
  2: { icon: '🔪', rate: '≈65%', cls: 'easy', blurb: '刀工渐稳,五层小塔' },
  3: { icon: '🥘', rate: '≈15%', cls: 'mid', blurb: '散装食材多起来了' },
  4: { icon: '🌶️', rate: '≈4%', cls: 'hard', blurb: '地狱后厨,盲堆七层' },
  5: { icon: '👑', rate: '<1%', cls: 'hard', blurb: '四角盲堆,28 种食材' },
};

const LOSE_LINES = [
  '后厨爆单,备菜槽全满了…',
  '这关实测通过率是个位数,不丢人',
  '道具真的不用吗,大厨?',
  '灶台在偷笑,你忍吗?',
  '差一点点,回锅重造!',
];

const LOSE_INFO = {
  slot: { mascot: '😿', title: '备菜槽满了…' },
  spoil: { mascot: '🤢', title: '食材变质了…' },
  orders: { mascot: '😭', title: '顾客没吃上…' },
};
const LOSE_TIPS = {
  spoil: '食材在备菜槽里每走一步掉 1 格新鲜度,归零就坏——快满时用「弹出」把老食材送回牌面能重置新鲜度!',
  orders: '食材用完了,点单还没出齐——同款配对会吃掉菜谱食材,记得给顾客的菜留材料!',
};

const TOOL_NAMES = { undo: '撤回', shuffle: '洗牌', pop: '弹出' };

let game = null;
let levelId = 1;
let cell = 24;
let selected = null;
let tools = null;
let startTime = 0;
let tileEls = new Map();
let boardEl = null, svgEl = null, slotCellEls = [];
let hintTimer = null;
let busy = false; // 入槽飞行动画期间锁输入,避免连点竞态
let rewardedDishes = 0; // 已发过奖励的出菜数(每 3 道奖 1 个道具)
const tutDone = {};
const toolRng = mulberry32((Date.now() % 2147483647) || 1);

// ———————————— 首页 ————————————
function showHome() {
  game = null;
  window.__game = null;
  const maxLv = store.get('maxLv', 1);
  const att = store.get('att', {});
  const cards = [1, 2, 3, 4, 5].map(lv => {
    const m = LEVEL_META[lv];
    const locked = lv > maxLv;
    const sub = locked ? `通过第 ${lv - 1} 关解锁` : (att[lv] ? `${m.blurb} · 已阵亡 ${att[lv]} 次` : m.blurb);
    return `<button class="lv-card clay ${locked ? 'locked' : ''}" data-lv="${lv}">
      <span class="lv-emoji">${locked ? '🔒' : m.icon}</span>
      <span class="lv-info"><b>${LEVELS[lv].name}</b><small>${sub}</small></span>
      <span class="lv-rate ${m.cls}">${m.rate}</span>
    </button>`;
  }).join('');
  app.innerHTML = `
  <div class="screen home">
    <div class="title-wrap">
      <div class="mascot">🍳</div>
      <h1>炒了个菜</h1>
      <p class="tagline">连连看 × 菜谱合成 · 可爱但不讲武德</p>
    </div>
    <div class="rules clay">
      <p>✨ <b>同款</b>(金光)或<b>菜谱搭子</b>(绿光)连得通就消;搭子合成新菜:鸡蛋+米饭=蛋炒饭</p>
      <p>📋 完成顶部<b>顾客点单</b> + 清空牌面才算过关;每出 3 道菜送 1 个道具</p>
      <p>🧺 备菜槽 7 格;槽里的食材会掉<b>新鲜度</b>,变质/塞满都会输</p>
    </div>
    ${cards}
    <p class="foot">难度经数万局机器人实测校准,每一局都保证有解 🫡</p>
  </div>`;
  app.querySelectorAll('.lv-card').forEach(b => b.addEventListener('click', () => {
    const lv = +b.dataset.lv;
    if (lv > store.get('maxLv', 1)) {
      b.classList.add('wobble');
      setTimeout(() => b.classList.remove('wobble'), 450);
      sfx.deny();
      return;
    }
    startLevel(lv);
  }));
}

// ———————————— 开局 ————————————
function startLevel(lv) {
  levelId = lv;
  const cfg = LEVELS[lv];
  const seed = cfg.seeds[Math.floor(Math.random() * cfg.seeds.length)];
  game = buildLevel(lv, seed);
  game.trackHistory = true;
  window.__game = game;
  tools = { undo: 1, shuffle: 1, pop: 1 };
  selected = null;
  busy = false;
  rewardedDishes = 0;
  startTime = Date.now();
  const att = store.get('att', {});
  att[lv] = (att[lv] || 0) + 1;
  store.set('att', att);
  renderPlay();
  if (lv === 1 && !tutDone.start) {
    tutDone.start = 1;
    hint('📋 顶上是顾客点单!做出这些菜 + 清空牌面才能过关~', 5200);
    setTimeout(() => {
      if (game && levelId === 1 && game.status === 'playing') {
        hint('👆 点一张食材:同款发金光,菜谱搭子发绿光,点发光的那张就能消!', 6500);
      }
    }, 5400);
  }
}

function renderPlay() {
  app.innerHTML = `
  <div class="screen play">
    <div class="topbar">
      <button class="icon-btn" id="btn-back" aria-label="返回首页">${ICONS.back}</button>
      <span class="lv-name">${LEVELS[levelId].name}</span>
      <button class="icon-btn" id="btn-mute" aria-label="切换声音">${muted ? ICONS.mutedIcon : ICONS.sound}</button>
    </div>
    <div class="orderbar"><span class="ob-label">📋 点单</span><div class="ob-list"></div><span class="ob-dishes"></span></div>
    <div class="progress"><div class="progress-fill"></div><span class="progress-num"></span></div>
    <div class="board-wrap"><div class="board"><svg class="linksvg"></svg></div></div>
    <div class="tools">
      <button class="tool" data-tool="undo">${ICONS.undo}<span>撤回</span><i class="badge"></i></button>
      <button class="tool" data-tool="shuffle">${ICONS.shuffle}<span>洗牌</span><i class="badge"></i></button>
      <button class="tool" data-tool="pop">${ICONS.pop}<span>弹出</span><i class="badge"></i></button>
    </div>
    <div class="slotbar clay">${'<div class="slot-cell"></div>'.repeat(game.slotCap)}</div>
    <div class="hintbar" hidden></div>
  </div>`;
  boardEl = app.querySelector('.board');
  svgEl = app.querySelector('.linksvg');
  slotCellEls = [...app.querySelectorAll('.slot-cell')];
  app.querySelector('#btn-back').addEventListener('click', () => { sfx.select(); showHome(); });
  app.querySelector('#btn-mute').addEventListener('click', e => {
    muted = !muted;
    store.set('muted', muted);
    e.currentTarget.innerHTML = muted ? ICONS.mutedIcon : ICONS.sound;
    if (!muted) sfx.select();
  });
  app.querySelectorAll('.tool').forEach(b => b.addEventListener('click', () => useTool(b.dataset.tool)));
  layoutBoard();
  buildTiles();
  refresh();
}

function layoutBoard() {
  const wrap = app.querySelector('.board-wrap');
  if (!wrap) return;
  const { minX, maxX, minY, maxY } = game.extent;
  const cw = maxX - minX + 2, ch = maxY - minY + 2;
  cell = Math.max(14, Math.min(
    Math.floor(Math.min(wrap.clientWidth - 8, 470) / cw),
    Math.floor((wrap.clientHeight - 8) / ch),
  ));
  boardEl.style.width = cw * cell + 'px';
  boardEl.style.height = ch * cell + 'px';
  svgEl.setAttribute('viewBox', `0 0 ${cw * cell} ${ch * cell}`);
}
const px = x => (x - game.extent.minX) * cell;
const py = y => (y - game.extent.minY) * cell;

function buildTiles() {
  tileEls.forEach(el => el.remove());
  tileEls = new Map();
  for (const t of game.tiles) {
    const el = document.createElement('button');
    el.className = 'tile';
    el.style.background = tint(t);
    el.innerHTML = `<span class="face">${EMO(t)}</span>`;
    el.setAttribute('aria-label', INGREDIENTS[t.type].name);
    el.addEventListener('click', () => onTileClick(t));
    boardEl.appendChild(el);
    tileEls.set(t.id, el);
  }
}

// ———————————— 渲染 ————————————
function refresh() {
  if (!game) return;
  const glowGold = new Set(), glowGreen = new Set();
  if (selected && (selected.state !== 'board' || !game.isFree(selected))) selected = null;
  if (selected && game.status === 'playing') {
    for (const p of game.linkablePartners(selected)) {
      (p.type === selected.type ? glowGold : glowGreen).add(p.id);
    }
  }
  const size = cell * 2 - 3;
  for (const t of game.tiles) {
    const el = tileEls.get(t.id);
    if (t.state !== 'board') { el.style.display = 'none'; continue; }
    el.style.display = '';
    el.style.width = size + 'px';
    el.style.height = size + 'px';
    el.style.left = (px(t.x) + 1.5) + 'px';
    el.style.top = (py(t.y) + 1.5) + 'px';
    el.style.zIndex = t.layer * 100 + t.y;
    const face = el.querySelector('.face');
    face.style.fontSize = Math.round(cell * 1.05) + 'px';
    if (face.textContent !== EMO(t)) { // 洗牌/撤回后牌型会变,牌面要跟着换
      face.textContent = EMO(t);
      el.style.background = tint(t);
      el.setAttribute('aria-label', INGREDIENTS[t.type].name);
    }
    el.classList.toggle('covered', !game.isFree(t));
    el.classList.toggle('sel', selected === t);
    el.classList.toggle('glow', glowGold.has(t.id));
    el.classList.toggle('glow2', glowGreen.has(t.id));
  }
  // 备菜槽(带新鲜度条,快变质时告警)
  app.querySelector('.slotbar').classList.toggle('danger', game.slot.length >= game.slotCap - 1 && game.status === 'playing');
  slotCellEls.forEach((c, i) => {
    const id = game.slot[i];
    if (id === undefined) { c.innerHTML = ''; return; }
    const t = game.tiles[id];
    const pct = Math.max(0, Math.min(1, t.fresh / game.freshMax));
    const rotting = t.fresh <= 4;
    const spoiled = game.spoiledId === t.id;
    c.innerHTML = `<div class="slot-tile ${rotting ? 'rotting' : ''}" style="background:${tint(t)}">${spoiled ? '🤢' : EMO(t)}
      <i class="fresh" style="width:${Math.round(pct * 100)}%;background:${pct > .5 ? '#6EE7B7' : pct > .25 ? '#FCD34D' : '#FB7185'}"></i></div>`;
  });
  // 点单栏
  app.querySelector('.ob-list').innerHTML = game.orders.map(o =>
    `<span class="ob-chip ${o.done >= o.need ? 'done' : ''}">${o.customer}${RECIPES[o.recipe].e}<b>${o.done}/${o.need}</b></span>`
  ).join('');
  app.querySelector('.ob-dishes').textContent = game.dishes.length ? `🍽️×${game.dishes.length}` : '';
  // 进度
  const done = game.clearedCount();
  app.querySelector('.progress-fill').style.width = (done / game.total * 100) + '%';
  app.querySelector('.progress-num').textContent = `${done}/${game.total}`;
  // 道具
  app.querySelectorAll('.tool').forEach(b => {
    const k = b.dataset.tool;
    const n = tools[k];
    b.querySelector('.badge').textContent = '×' + n;
    b.disabled = n <= 0 || game.status !== 'playing' || (k === 'undo' && !game.snapshot);
  });
}

// ———————————— 交互 ————————————
function onTileClick(t) {
  if (!game || game.status !== 'playing' || busy) return;
  const el = tileEls.get(t.id);
  if (!game.isFree(t)) { wobble(el); sfx.deny(); return; }
  if (selected === t) { selected = null; slotMove(t); return; } // 再点一下自己 → 入槽
  if (selected) {
    const a = selected;
    const res = game.link(a, t);
    if (res) { selected = null; animateLink(a, t, res); return; }
  }
  // 选中 / 切换选中;没有可连的同伴就直接入槽
  const partners = game.linkablePartners(t);
  if (!partners.length) { selected = null; slotMove(t); return; }
  selected = t;
  sfx.select();
  refresh();
}

function animateLink(a, b, res) {
  sfx.link();
  const pts = res.path.map(([x, y]) => `${px(x) + cell / 2},${py(y) + cell / 2}`).join(' ');
  svgEl.innerHTML = `<polyline class="linkline ${res.recipe !== null ? 'recipe' : ''}" points="${pts}"/>`;
  for (const t of [a, b]) {
    const el = tileEls.get(t.id);
    el.classList.add('zap');
    burstAt(el.getBoundingClientRect());
  }
  tut('link', '漂亮!连不到的食材点一下会落进备菜槽,同款或搭子在槽里相遇也会消~');
  const bRect = tileEls.get(b.id).getBoundingClientRect();
  setTimeout(() => {
    svgEl.innerHTML = '';
    [a, b].forEach(t => tileEls.get(t.id).classList.remove('zap'));
    if (res.recipe !== null) onDish(res.recipe, bRect, res.order);
    refresh();
    checkEnd();
  }, 380);
}

function slotMove(t) {
  const el = tileEls.get(t.id);
  const from = el.getBoundingClientRect();
  const prevSlot = game.slot.slice();
  const res = game.sendToSlot(t);
  if (!res) return;
  const targetIdx = res.paired ? prevSlot.indexOf(res.matchId) : game.slot.length - 1;
  const to = slotCellEls[Math.max(0, targetIdx)].getBoundingClientRect();
  el.style.display = 'none';
  busy = true;
  fly(from, to, t, () => {
    busy = false;
    if (res.paired) { sfx.pair(); burstAt(to); } else { sfx.slot(); }
    if (res.recipe !== null) onDish(res.recipe, to, res.order);
    refresh();
    if (res.paired) { if (res.recipe === null) tut('pair', '同款在备菜槽相遇,自动消除,槽位不亏!'); }
    else tut('slot', '槽里的食材会掉新鲜度(看牌底的小绿条),变质或塞满 7 格都会输!');
    checkEnd();
  });
}

// 出菜:菜品飞向点单栏 + 核销订单提示 + 每 3 道奖励一个道具
function onDish(recipeIdx, fromRect, orderRes) {
  const r = RECIPES[recipeIdx];
  sfx.dish();
  const bar = app.querySelector('.orderbar');
  if (bar) {
    const to = bar.getBoundingClientRect();
    const g = document.createElement('div');
    g.className = 'ghost-dish';
    g.textContent = r.e;
    g.style.cssText = `left:${fromRect.left + fromRect.width / 2 - 16}px;top:${fromRect.top + fromRect.height / 2 - 16}px`;
    document.body.appendChild(g);
    requestAnimationFrame(() => {
      g.style.transform = `translate(${to.left + 60 - fromRect.left}px, ${to.top + to.height / 2 - fromRect.top - fromRect.height / 2}px) scale(.7)`;
      g.style.opacity = '.2';
    });
    setTimeout(() => g.remove(), 450);
  }
  if (levelId === 1 && !tutDone.dish) {
    tutDone.dish = 1;
    hint(`🍳 出菜啦!${INGREDIENTS[r.a].e}+${INGREDIENTS[r.b].e}=${r.e} ${r.name}!这就是顾客点的菜,点单栏 +1~`, 6000);
  } else if (orderRes && orderRes.completed) {
    hint(`${orderRes.order.customer} 顾客满意!${r.e} ${r.name} 订单完成!`, 2800);
  } else if (orderRes) {
    hint(`📋 ${r.e} ${r.name} 出餐 ${orderRes.order.done}/${orderRes.order.need}`, 2200);
  } else {
    hint(`叮!${r.e} ${r.name} +1(没有对应点单,当员工餐吧)`, 2200);
  }
  // 道具奖励
  while (game.dishes.length - rewardedDishes >= 3) {
    rewardedDishes += 3;
    const ks = Object.keys(tools).filter(k => tools[k] < 3);
    if (!ks.length) break;
    const k = ks[Math.floor(Math.random() * ks.length)];
    tools[k]++;
    setTimeout(() => hint(`🎁 出满 3 道菜,奖励道具:${TOOL_NAMES[k]} +1!`, 2600), 900);
  }
}

function fly(from, to, t, cb) {
  const g = document.createElement('div');
  g.className = 'ghost-tile';
  g.style.cssText = `left:${from.left}px;top:${from.top}px;width:${from.width}px;height:${from.height}px;background:${tint(t)};font-size:${Math.round(from.width * .55)}px`;
  g.textContent = EMO(t);
  document.body.appendChild(g);
  requestAnimationFrame(() => {
    const s = to.width / from.width;
    g.style.transform = `translate(${to.left - from.left + (to.width - from.width) / 2}px, ${to.top - from.top + (to.height - from.height) / 2}px) scale(${s})`;
  });
  setTimeout(() => { g.remove(); cb(); }, 300);
}

function useTool(kind) {
  if (!game || game.status !== 'playing' || busy || tools[kind] <= 0) { sfx.deny(); return; }
  if (kind === 'undo') {
    if (!game.undo()) { sfx.deny(); return; }
  } else if (kind === 'shuffle') {
    game.shuffle(toolRng);
    boardEl.classList.add('shake');
    setTimeout(() => boardEl && boardEl.classList.remove('shake'), 500);
  } else if (kind === 'pop') {
    if (!game.popOut()) { sfx.deny(); return; }
  }
  tools[kind]--;
  selected = null;
  sfx.slot();
  refresh();
}

// ———————————— 结算 ————————————
function checkEnd() {
  if (game.status === 'won') {
    if (levelId < 5) store.set('maxLv', Math.max(store.get('maxLv', 1), levelId + 1));
    else store.set('god', store.get('god', 0) + 1);
    setTimeout(() => { sfx.win(); confetti(); showModal(true); }, 350);
  } else if (game.status === 'lost') {
    setTimeout(() => { sfx.lose(); showModal(false); }, 500);
  }
}

function showModal(won) {
  const secs = Math.round((Date.now() - startTime) / 1000);
  const done = game.clearedCount();
  const att = store.get('att', {});
  const canRevive = !won && game.snapshot && tools.undo > 0;
  const dishStat = game.dishes.length ? ` · 出品 ${game.dishes.length} 道菜` : '';
  let mascot, title, line, btns = '';
  if (won && levelId < 5) {
    mascot = '🥳'; title = LEVELS[levelId].name.split('· ')[1] + ',过!';
    line = `${LEVELS[levelId + 1].name}已解锁,续火吗?`;
    btns = `<button class="m-btn primary" data-act="next">${LEVEL_META[levelId + 1].icon} 开下一灶</button>
            <button class="m-btn plain" data-act="home">回首页</button>`;
  } else if (won) {
    mascot = '👑'; title = '传说灶神,就是你!!';
    line = '<1% 的通过率也拦不住你,快去好友群立牌坊';
    btns = `<button class="m-btn primary" data-act="retry">再封神一次</button>
            <button class="m-btn plain" data-act="home">功成身退</button>`;
  } else {
    const info = LOSE_INFO[game.loseReason] || LOSE_INFO.slot;
    mascot = info.mascot; title = info.title;
    line = LOSE_TIPS[game.loseReason]
      || (levelId <= 2 ? '别慌,前两关多试试就熟了~' : LOSE_LINES[Math.floor(Math.random() * LOSE_LINES.length)]);
    btns = `${canRevive ? '<button class="m-btn primary" data-act="revive">💊 撤回复活(×1)</button>' : ''}
            <button class="m-btn ${canRevive ? 'plain' : 'primary'}" data-act="retry">再来一次</button>
            <button class="m-btn plain" data-act="home">回首页</button>`;
  }
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal clay">
      <div class="m-mascot">${mascot}</div>
      <h2>${title}</h2>
      <p class="m-line">${line}</p>
      <p class="m-stats">点单 ${game.orders.filter(o => o.done >= o.need).length}/${game.orders.length} · 消除 ${done}/${game.total}${dishStat} · 用时 ${secs} 秒 · 第 ${att[levelId] || 1} 次挑战</p>
      ${btns}
    </div>`;
  overlay.addEventListener('click', e => {
    const act = e.target.dataset && e.target.dataset.act;
    if (!act) return;
    overlay.remove();
    if (act === 'home') showHome();
    else if (act === 'next') startLevel(levelId + 1);
    else if (act === 'retry') startLevel(levelId);
    else if (act === 'revive') { tools.undo--; game.undo(); sfx.pair(); refresh(); }
  });
  document.body.appendChild(overlay);
}

// ———————————— 小动效 ————————————
function wobble(el) {
  el.classList.add('wobble');
  setTimeout(() => el.classList.remove('wobble'), 450);
}

function burstAt(rect) {
  const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
  const glyphs = ['✨', '⭐', '💫', '🌟'];
  for (let i = 0; i < 6; i++) {
    const s = document.createElement('span');
    s.className = 'star';
    const ang = Math.PI * 2 * i / 6 + Math.random();
    s.style.cssText = `left:${cx}px;top:${cy}px;--dx:${Math.cos(ang) * 34}px;--dy:${Math.sin(ang) * 34 - 12}px`;
    s.textContent = glyphs[i % glyphs.length];
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 600);
  }
}

function confetti() {
  const colors = ['#F9A8D4', '#FCD34D', '#A5B4FC', '#6EE7B7', '#FDA4AF'];
  for (let i = 0; i < 70; i++) {
    const p = document.createElement('i');
    p.className = 'confetti';
    p.style.cssText = `left:${Math.random() * 100}vw;background:${colors[i % colors.length]};animation-duration:${(2 + Math.random() * 1.8).toFixed(2)}s;animation-delay:${(Math.random() * .4).toFixed(2)}s;transform:rotate(${Math.floor(Math.random() * 360)}deg)`;
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 4400);
  }
}

function hint(text, dur = 5000) {
  const h = app.querySelector('.hintbar');
  if (!h) return;
  h.textContent = text;
  h.hidden = false;
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => { h.hidden = true; }, dur);
}

function tut(evt, text) {
  if (levelId !== 1 || tutDone[evt]) return;
  tutDone[evt] = 1;
  hint(text);
}

// ———————————— 启动 ————————————
window.addEventListener('resize', () => { if (game) { layoutBoard(); refresh(); } });
document.addEventListener('pointerdown', () => { if (!muted) ac(); }, { once: true });
showHome();
