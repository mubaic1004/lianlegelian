// 「连了个连」界面层:渲染 + 交互 + 动效 + 音效
import { buildLevel, LEVELS, EMOJIS, mulberry32 } from './engine.js';

const app = document.getElementById('app');

const store = {
  get(k, d) { try { const v = localStorage.getItem('llgl.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('llgl.' + k, JSON.stringify(v)); } catch { /* 隐私模式等 */ } },
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
  deny() { tone(180, .08, 'square', .05); },
  lose() { [392, 330, 262, 196].forEach((f, i) => tone(f, .18, 'sawtooth', .06, i * .13)); },
  win() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, .16, 'triangle', .12, i * .09)); },
};

const TINTS = ['#FFE3EC', '#FFF1D6', '#E3F4FF', '#E8F9E3', '#F3E8FF', '#FFFAD6', '#DFF6F0', '#FFE9DF', '#EBEBFF', '#FFEFF7'];
const tint = t => TINTS[t.type % TINTS.length];

const ICONS = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  sound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H3v6h3l5 4V5z"/><path d="M15.5 9.5a4 4 0 010 5"/><path d="M18 7a7.5 7.5 0 010 10"/></svg>',
  mutedIcon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H3v6h3l5 4V5z"/><path d="M22 9l-6 6M16 9l6 6"/></svg>',
  undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 110 12h-3"/></svg>',
  shuffle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5"/><path d="M3 20L21 3"/><path d="M16 21h5v-5"/><path d="M13.5 13.5L21 21"/><path d="M3 4l6.5 6.5"/></svg>',
  pop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4"/><path d="M7 8l5-5 5 5"/><path d="M4 15v3a3 3 0 003 3h10a3 3 0 003-3v-3"/></svg>',
};

const LOSE_LINES = [
  '这关实测通过率 ≈2%,输了不丢人',
  '就……再来亿次?',
  '撤回、洗牌、弹出,三个道具真的不用吗?',
  '牌堆在偷笑,你忍吗?',
  '差一点点了,下次一定!',
];

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
const tutDone = {};
const toolRng = mulberry32((Date.now() % 2147483647) || 1);

// ———————————— 首页 ————————————
function showHome() {
  game = null;
  window.__game = null;
  const unlocked = store.get('unlock2', false);
  const attempts = store.get('attempts2', 0);
  const wins2 = store.get('wins2', 0);
  const sub2 = unlocked
    ? (wins2 ? `已通关 ${wins2} 次,大佬!` : (attempts ? `已阵亡 ${attempts} 次` : '有本事就来'))
    : '先通过第 1 关解锁';
  app.innerHTML = `
  <div class="screen home">
    <div class="title-wrap">
      <div class="mascot">🐰</div>
      <h1>连了个连</h1>
      <p class="tagline">连连看 × 消消乐 · 可爱但不讲武德</p>
    </div>
    <div class="rules clay">
      <p>✨ 点两张<b>相同</b>且两折以内<b>连得通</b>的牌,直接消除(会发光提示)</p>
      <p>🧺 连不到的牌点一下进底部卡槽,同类<b>凑一对</b>即消;塞满 <b>7 格</b>就输啦</p>
    </div>
    <button class="lv-card clay" data-lv="1">
      <span class="lv-emoji">🌱</span>
      <span class="lv-info"><b>第 1 关 · 热热身</b><small>30 秒轻松拿捏</small></span>
      <span class="lv-rate easy">通过率 99%</span>
    </button>
    <button class="lv-card clay ${unlocked ? '' : 'locked'}" data-lv="2">
      <span class="lv-emoji">${unlocked ? '🌋' : '🔒'}</span>
      <span class="lv-info"><b>第 2 关 · 传说中的地狱</b><small>${sub2}</small></span>
      <span class="lv-rate hard">通过率 ≈2%</span>
    </button>
    <p class="foot">难度经 300×70 局机器人实测校准,每一局都保证有解 🫡</p>
  </div>`;
  app.querySelectorAll('.lv-card').forEach(b => b.addEventListener('click', () => {
    const lv = +b.dataset.lv;
    if (lv === 2 && !store.get('unlock2', false)) {
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
  startTime = Date.now();
  if (lv === 2) store.set('attempts2', store.get('attempts2', 0) + 1);
  renderPlay();
  if (lv === 1 && !tutDone.start) {
    tutDone.start = 1;
    hint('👆 点一张牌,能连上的同伴会发光,点发光的那张直接消除!', 6500);
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
    el.innerHTML = `<span class="face">${EMOJIS[t.type]}</span>`;
    el.setAttribute('aria-label', EMOJIS[t.type]);
    el.addEventListener('click', () => onTileClick(t));
    boardEl.appendChild(el);
    tileEls.set(t.id, el);
  }
}

// ———————————— 渲染 ————————————
function refresh() {
  if (!game) return;
  const glowIds = new Set();
  if (selected && (selected.state !== 'board' || !game.isFree(selected))) selected = null;
  if (selected && game.status === 'playing') {
    game.linkablePartners(selected).forEach(p => glowIds.add(p.id));
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
    if (face.textContent !== EMOJIS[t.type]) { // 洗牌/撤回后牌型会变,牌面要跟着换
      face.textContent = EMOJIS[t.type];
      el.style.background = tint(t);
      el.setAttribute('aria-label', EMOJIS[t.type]);
    }
    el.classList.toggle('covered', !game.isFree(t));
    el.classList.toggle('sel', selected === t);
    el.classList.toggle('glow', glowIds.has(t.id));
  }
  // 卡槽
  app.querySelector('.slotbar').classList.toggle('danger', game.slot.length >= game.slotCap - 1 && game.status === 'playing');
  slotCellEls.forEach((c, i) => {
    const id = game.slot[i];
    if (id === undefined) { c.innerHTML = ''; return; }
    const t = game.tiles[id];
    c.innerHTML = `<div class="slot-tile" style="background:${tint(t)}">${EMOJIS[t.type]}</div>`;
  });
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
  if (selected && selected.type === t.type) {
    const a = selected;
    const path = game.link(a, t);
    if (path) { selected = null; animateLink(a, t, path); return; }
  }
  // 选中 / 切换选中;没有可连的同伴就直接入槽
  const partners = game.linkablePartners(t);
  if (!partners.length) { selected = null; slotMove(t); return; }
  selected = t;
  sfx.select();
  refresh();
}

function animateLink(a, b, path) {
  sfx.link();
  const pts = path.map(([x, y]) => `${px(x) + cell / 2},${py(y) + cell / 2}`).join(' ');
  svgEl.innerHTML = `<polyline class="linkline" points="${pts}"/>`;
  for (const t of [a, b]) {
    const el = tileEls.get(t.id);
    el.classList.add('zap');
    burstAt(el.getBoundingClientRect());
  }
  tut('link', '漂亮!连不到的牌点一下会落进卡槽,同类凑一对也会消~');
  setTimeout(() => {
    svgEl.innerHTML = '';
    [a, b].forEach(t => tileEls.get(t.id).classList.remove('zap'));
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
    refresh();
    if (res.paired) tut('pair', '同类在卡槽里凑成一对,自动消除,槽位不亏!');
    else tut('slot', '卡槽只有 7 格,塞满就输咯,且行且珍惜 🧐');
    checkEnd();
  });
}

function fly(from, to, t, cb) {
  const g = document.createElement('div');
  g.className = 'ghost-tile';
  g.style.cssText = `left:${from.left}px;top:${from.top}px;width:${from.width}px;height:${from.height}px;background:${tint(t)};font-size:${Math.round(from.width * .55)}px`;
  g.textContent = EMOJIS[t.type];
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
    if (levelId === 1) store.set('unlock2', true);
    else store.set('wins2', store.get('wins2', 0) + 1);
    setTimeout(() => { sfx.win(); confetti(); showModal(true); }, 350);
  } else if (game.status === 'lost') {
    setTimeout(() => { sfx.lose(); showModal(false); }, 500);
  }
}

function showModal(won) {
  const secs = Math.round((Date.now() - startTime) / 1000);
  const done = game.clearedCount();
  const canRevive = !won && game.snapshot && tools.undo > 0;
  let mascot, title, line, btns = '';
  if (won && levelId === 1) {
    mascot = '🥳'; title = '热身完成!';
    line = '第 2 关已解锁,去会会传说中的地狱?';
    btns = `<button class="m-btn primary" data-act="next">🌋 挑战第 2 关</button>
            <button class="m-btn plain" data-act="home">回首页</button>`;
  } else if (won) {
    mascot = '🏆'; title = '你就是那 2%!!';
    line = '地狱难度通关,请立刻去好友群炫耀';
    btns = `<button class="m-btn primary" data-act="retry">再虐一次</button>
            <button class="m-btn plain" data-act="home">功成身退</button>`;
  } else {
    mascot = '😿'; title = '卡槽满了…';
    line = levelId === 2 ? LOSE_LINES[Math.floor(Math.random() * LOSE_LINES.length)] : '别慌,热身关多点几下就过~';
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
      <p class="m-stats">消除 ${done}/${game.total} · 用时 ${secs} 秒 · 连线 ${game.linkCount} 次${levelId === 2 ? ' · 第 ' + store.get('attempts2', 1) + ' 次挑战' : ''}</p>
      ${btns}
    </div>`;
  overlay.addEventListener('click', e => {
    const act = e.target.dataset && e.target.dataset.act;
    if (!act) return;
    overlay.remove();
    if (act === 'home') showHome();
    else if (act === 'next') startLevel(2);
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
