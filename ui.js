// 「炒了个菜」界面层:页面(首页/选关/教学/设置)+ 渲染 + 交互 + 动效 + 音效 + BGM + 中英双语
import { buildLevel, LEVELS, INGREDIENTS, RECIPES, mulberry32 } from './engine.js';

const VERSION = 'v1.0.0.7'; // 版本规则:每次改动末位 +1,大改动才进主位
const app = document.getElementById('app');

const store = {
  get(k, d) { try { const v = localStorage.getItem('clgc.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('clgc.' + k, JSON.stringify(v)); } catch { /* 隐私模式等 */ } },
};

// ———————————— 中英双语 ————————————
let lang = store.get('lang', 'zh');
const T = (zh, en) => (lang === 'zh' ? zh : en);
const iname = type => T(INGREDIENTS[type].name, INGREDIENTS[type].en);
const rname = ri => T(RECIPES[ri].name, RECIPES[ri].en);
const lvname = lv => T(LEVELS[lv].name, LEVELS[lv].en);
const toolName = k => T({ undo: '撤回', shuffle: '洗牌', pop: '弹出' }[k], { undo: 'Undo', shuffle: 'Shuffle', pop: 'Eject' }[k]);

// ———————————— 音频:WebAudio 合成,零外部资源 ————————————
let actx = null;
let muted = store.get('muted', false);
let sfxVol = store.get('sfxVol', 0.8);
let bgmVol = store.get('bgmVol', 0.5);

function ac() {
  if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
  if (actx.state === 'suspended') actx.resume();
  return actx;
}
function tone(freq, dur = .1, type = 'sine', gain = .12, delay = 0) {
  if (muted || sfxVol <= 0) return;
  try {
    const ctx = ac(), t = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(gain * sfxVol, t);
    g.gain.exponentialRampToValueAtTime(.001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t); o.stop(t + dur + .02);
  } catch { /* AudioContext 不可用则静默 */ }
}
// 轻柔的气声(钟形包络,缓起缓落,绝无“啪”的瞬态)≈ 远处温柔的欢呼
function softSwell(dur = .6, gain = .03, delay = 0) {
  if (muted || sfxVol <= 0) return;
  try {
    const ctx = ac();
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const env = Math.sin(Math.PI * i / len); // 钟形:慢慢起、慢慢落
      d[i] = (Math.random() * 2 - 1) * env * env;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = .5;
    const g = ctx.createGain();
    g.gain.value = gain * sfxVol;
    src.connect(bp); bp.connect(g); g.connect(ctx.destination);
    src.start(ctx.currentTime + delay);
  } catch { /* 忽略 */ }
}
const sfx = {
  select() { tone(660, .07, 'triangle', .08); },
  slot() { tone(430, .09, 'sine', .1); tone(320, .1, 'sine', .05, .04); },
  link() { tone(784, .09, 'triangle', .1); tone(1175, .12, 'triangle', .09, .06); },
  pair() { tone(880, .1, 'triangle', .1); tone(1319, .14, 'triangle', .09, .07); },
  cheer() { // 出菜欢呼:温暖的慢琶音(sine 柔音色)+ 远处轻轻的气声
    [523, 659, 784].forEach((f, i) => tone(f, .5, 'sine', .05, i * .07));
    tone(1047, .65, 'sine', .035, .22);
    softSwell(.7, .028, .08);
  },
  clink() { // 饮品碰杯:两下清脆玻璃声
    tone(1975, .12, 'triangle', .13);
    tone(2637, .3, 'sine', .07, .02);
    tone(2093, .13, 'triangle', .12, .13);
    tone(3136, .32, 'sine', .05, .15);
  },
  deny() { tone(180, .08, 'square', .05); },
  lose() { [392, 330, 262, 196].forEach((f, i) => tone(f, .18, 'sawtooth', .06, i * .13)); },
  win() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, .16, 'triangle', .12, i * .09)); },
};

// —— 背景音乐:约 1 分钟的梦幻钢琴小曲循环(参考奇迹暖暖式配器)——
// 背景:极轻的和弦铺底 + 低音(sine,缓起缓落);前景:钢琴音色的琶音与旋律
// 结构:4 小节前奏 + A 段(8)+ B 段(8)+ A' 段(8),共 28 小节 ≈ 60 秒
const BGM_STEP = .27; // 八分音符,约 111 BPM
const NOTE = {
  A2: 110, C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196, A3: 220, B3: 246.94,
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392, A4: 440, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880, B5: 987.77, C6: 1046.5,
};
// 和弦库:铺底音、低音、琶音音级
const CHORDS = {
  C: { pad: ['C4', 'E4', 'G4'], bass: 'C3', arp: ['C4', 'E4', 'G4', 'C5'] },
  G: { pad: ['B3', 'D4', 'G4'], bass: 'G3', arp: ['G3', 'B3', 'D4', 'G4'] },
  Am: { pad: ['A3', 'C4', 'E4'], bass: 'A2', arp: ['A3', 'C4', 'E4', 'A4'] },
  F: { pad: ['A3', 'C4', 'F4'], bass: 'F3', arp: ['F3', 'A3', 'C4', 'F4'] },
  Dm: { pad: ['A3', 'D4', 'F4'], bass: 'D3', arp: ['D3', 'F3', 'A3', 'D4'] },
  Em: { pad: ['B3', 'E4', 'G4'], bass: 'E3', arp: ['E3', 'G3', 'B3', 'E4'] },
};
const bar = (ch, mel = []) => ({ ...CHORDS[ch], mel }); // mel: [起步, 音名, 时值(步)]
const BGM_BARS = [
  // 前奏(只有铺底+琶音,末尾引出旋律)
  bar('C'), bar('F'), bar('C'), bar('G', [[4, 'D5', 2], [6, 'E5', 2]]),
  // A 段
  bar('C', [[0, 'E5', 3], [4, 'G5', 2], [6, 'A5', 2]]),
  bar('G', [[0, 'B5', 3], [4, 'G5', 4]]),
  bar('Am', [[0, 'A5', 2], [2, 'G5', 2], [4, 'E5', 4]]),
  bar('F', [[0, 'F5', 3], [4, 'G5', 2], [6, 'A5', 2]]),
  bar('C', [[0, 'G5', 3], [4, 'E5', 2], [6, 'D5', 2]]),
  bar('G', [[0, 'D5', 3], [4, 'B4', 4]]),
  bar('F', [[0, 'C5', 2], [2, 'D5', 2], [4, 'F5', 4]]),
  bar('C', [[0, 'E5', 6]]),
  // B 段(情绪轻轻扬起)
  bar('F', [[0, 'A5', 2], [2, 'G5', 2], [4, 'F5', 3]]),
  bar('G', [[0, 'G5', 2], [2, 'A5', 2], [4, 'B5', 3]]),
  bar('Em', [[0, 'G5', 3], [4, 'E5', 2], [6, 'D5', 2]]),
  bar('Am', [[0, 'C5', 2], [2, 'E5', 2], [4, 'A5', 4]]),
  bar('F', [[0, 'F5', 2], [2, 'E5', 2], [4, 'D5', 3]]),
  bar('G', [[0, 'D5', 2], [2, 'E5', 2], [4, 'G5', 3]]),
  bar('C', [[0, 'E5', 3], [4, 'C5', 4]]),
  bar('C', [[0, 'C5', 6]]),
  // A' 段(收束)
  bar('C', [[0, 'E5', 3], [4, 'G5', 2], [6, 'A5', 2]]),
  bar('G', [[0, 'B5', 3], [4, 'A5', 2], [6, 'G5', 2]]),
  bar('Am', [[0, 'A5', 2], [2, 'E5', 2], [4, 'C5', 4]]),
  bar('F', [[0, 'F5', 3], [4, 'A5', 3]]),
  bar('Dm', [[0, 'D5', 2], [2, 'F5', 2], [4, 'A5', 3]]),
  bar('G', [[0, 'G5', 2], [2, 'F5', 2], [4, 'D5', 3]]),
  bar('C', [[0, 'E5', 2], [2, 'D5', 2], [4, 'C5', 4]]),
  bar('C', [[0, 'C5', 7]]),
];
const ARP_ORDER = [0, 1, 2, 3, 2, 3, 2, 1]; // 竖琴式上下行
let bgmGain = null, bgmTimer = null;
function applyBgmVol() { if (bgmGain) bgmGain.gain.value = muted ? 0 : bgmVol * .55; }
// 背景柔音符:极缓起 + 缓落(铺底/低音用)
function bgmNote(f, t, dur, type, g, attack = .04) {
  const ctx = ac();
  const o = ctx.createOscillator(), gn = ctx.createGain();
  o.type = type; o.frequency.value = f;
  gn.gain.setValueAtTime(.0001, t);
  gn.gain.linearRampToValueAtTime(g, t + attack);
  gn.gain.exponentialRampToValueAtTime(.001, t + dur);
  o.connect(gn).connect(bgmGain);
  o.start(t); o.stop(t + dur + .03);
}
// 竖琴音色:纯正弦基频 + 一点点八度泛音,柔和拨弦起音,自然衰减(无刺耳谐波)
function harpNote(f, t, dur, g) {
  const ctx = ac();
  const gn = ctx.createGain();
  gn.gain.setValueAtTime(.0001, t);
  gn.gain.linearRampToValueAtTime(g, t + .018);
  gn.gain.exponentialRampToValueAtTime(.001, t + dur);
  gn.connect(bgmGain);
  [[1, 1], [2, .12]].forEach(([h, hg]) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f * h;
    const og = ctx.createGain();
    og.gain.value = hg;
    o.connect(og).connect(gn);
    o.start(t); o.stop(t + dur + .05);
  });
}
function loopBGM() {
  const ctx = ac();
  const t0 = ctx.currentTime + .06;
  const barDur = 8 * BGM_STEP;
  BGM_BARS.forEach((b, bi) => {
    const bt = t0 + bi * barDur;
    b.pad.forEach(n => bgmNote(NOTE[n], bt, barDur * .96, 'sine', .011, .5)); // 铺底更轻更缓
    bgmNote(NOTE[b.bass], bt, barDur * .9, 'sine', .032, .15);                 // 低音
    ARP_ORDER.forEach((ai, si) => {                                            // 钢琴琶音
      harpNote(NOTE[b.arp[ai]], bt + si * BGM_STEP, BGM_STEP * 2.4, .014);
    });
    b.mel.forEach(([s, n, len]) => {                                           // 钢琴旋律
      harpNote(NOTE[n], bt + s * BGM_STEP, len * BGM_STEP * 1.5, .048);
    });
  });
  bgmTimer = setTimeout(loopBGM, BGM_BARS.length * barDur * 1000 - 40);
}
function startBGM() {
  if (bgmTimer !== null) return;
  const ctx = ac();
  bgmGain = ctx.createGain();
  applyBgmVol();
  bgmGain.connect(ctx.destination);
  loopBGM();
}

// ———————————— 通用素材 ————————————
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
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20V4a2 2 0 00-2-2H6.5A2.5 2.5 0 004 4.5v15z"/><path d="M4 19.5A2.5 2.5 0 006.5 22H20v-5"/><path d="M9 7h7M9 11h5"/></svg>',
};

const LEVEL_META = {
  1: { icon: '🥚', rate: () => T('通过率 99%', '99% clear'), cls: 'easy', blurb: () => T('30 秒开火热灶', '30-second warm-up') },
  2: { icon: '🔪', rate: () => '≈65%', cls: 'easy', blurb: () => T('刀工渐稳,五层小塔', 'Five layers, steady hands') },
  3: { icon: '🥘', rate: () => '≈15%', cls: 'mid', blurb: () => T('散装食材多起来了', 'Loose ingredients pile up') },
  4: { icon: '🌶️', rate: () => '≈4%', cls: 'hard', blurb: () => T('地狱后厨,盲堆七层', 'Blind stacks, 7 deep') },
  5: { icon: '👑', rate: () => '<1%', cls: 'hard', blurb: () => T('四角盲堆,28 种食材', '4 corners, 28 ingredients') },
};

let game = null;
let levelId = 1;
let cell = 24;
let selected = null;
let tools = null;
let startTime = 0;
let tileEls = new Map();
let boardEl = null, svgEl = null, slotCellEls = [];
let hintTimer = null;
let levelTimer = null;
let deadline = 0;
let busy = false; // 入槽飞行动画期间锁输入,避免连点竞态
let rewardedDishes = 0;
const tutDone = {};
const toolRng = mulberry32((Date.now() % 2147483647) || 1);

// ———————————— 首页(主菜单) ————————————
function showHome() {
  clearInterval(levelTimer);
  document.body.classList.remove('in-game');
  game = null;
  window.__game = null;
  app.innerHTML = `
  <div class="screen home menu">
    <div class="title-wrap">
      <div class="mascot">🍳</div>
      <div class="title-art">
        <h1>${T('炒了个菜', 'Cook-a-Dish')}</h1>
        <span class="hang hang-berry">🍓</span>
        <span class="hang hang-ice">🍦</span>
      </div>
      <p class="tagline">${T('连连看 × 菜谱合成 · 可爱但不讲武德', 'Link & match × recipes · cute but ruthless')}</p>
    </div>
    <button class="menu-btn clay" data-go="play"><span class="mi">🎮</span>${T('开始做菜', 'Play')}</button>
    <button class="menu-btn clay" data-go="guide"><span class="mi">📖</span>${T('玩法教学', 'How to Play')}</button>
    <button class="menu-btn clay" data-go="settings"><span class="mi">⚙️</span>${T('设置', 'Settings')}</button>
    <p class="foot">🍉 ${T('瓜皮工作室', 'GuaPi Studio')} · ${VERSION}</p>
  </div>`;
  app.querySelectorAll('.menu-btn').forEach(b => b.addEventListener('click', () => {
    sfx.select();
    const go = b.dataset.go;
    if (go === 'play') showLevels();
    else if (go === 'guide') showInstructions();
    else showSettings();
  }));
}

// ———————————— 选关页 ————————————
function showLevels() {
  clearInterval(levelTimer);
  document.body.classList.remove('in-game');
  game = null;
  window.__game = null;
  const maxLv = store.get('maxLv', 1);
  const att = store.get('att', {});
  const cards = [1, 2, 3, 4, 5].map(lv => {
    const m = LEVEL_META[lv];
    const locked = lv > maxLv;
    const sub = locked
      ? T(`通过第 ${lv - 1} 关解锁`, `Clear level ${lv - 1} to unlock`)
      : `${att[lv] ? `${m.blurb()} · ${T(`已阵亡 ${att[lv]} 次`, `${att[lv]} wipes`)}` : m.blurb()} · ⏱ ${Math.round(LEVELS[lv].time / 60)}${T(' 分钟', ' min')}`;
    return `<button class="lv-card clay ${locked ? 'locked' : ''}" data-lv="${lv}">
      <span class="lv-emoji">${locked ? '🔒' : m.icon}</span>
      <span class="lv-info"><b>${lvname(lv)}</b><small>${sub}</small></span>
      <span class="lv-rate ${m.cls}">${m.rate()}</span>
    </button>`;
  }).join('');
  app.innerHTML = `
  <div class="screen home">
    <div class="topbar bare">
      <button class="icon-btn" id="btn-back" aria-label="${T('返回', 'Back')}">${ICONS.back}</button>
      <span class="lv-name">${T('选择关卡', 'Select Level')}</span>
      <span class="icon-spacer"></span>
    </div>
    ${cards}
    <p class="foot">${T('难度经数万局机器人实测校准,每一局都保证有解 🫡', 'Tuned with 10k+ bot runs — every deal is solvable 🫡')}</p>
  </div>`;
  app.querySelector('#btn-back').addEventListener('click', () => { sfx.select(); showHome(); });
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

// ———————————— 设置页 ————————————
function showSettings() {
  clearInterval(levelTimer);
  document.body.classList.remove('in-game');
  game = null;
  window.__game = null;
  app.innerHTML = `
  <div class="screen home menu">
    <div class="topbar bare">
      <button class="icon-btn" id="btn-back" aria-label="${T('返回', 'Back')}">${ICONS.back}</button>
      <span class="lv-name">⚙️ ${T('设置', 'Settings')}</span>
      <span class="icon-spacer"></span>
    </div>
    <div class="set-card clay">
      <div class="set-row"><span class="set-ic">🔊</span><label for="sfx-vol">${T('音效', 'Sound FX')}</label>
        <input type="range" id="sfx-vol" min="0" max="100" value="${Math.round(sfxVol * 100)}"></div>
      <div class="set-row"><span class="set-ic">🎵</span><label for="bgm-vol">${T('音乐', 'Music')}</label>
        <input type="range" id="bgm-vol" min="0" max="100" value="${Math.round(bgmVol * 100)}"></div>
      <div class="set-row"><span class="set-ic">🌐</span><label>${T('语言', 'Language')}</label>
        <span class="seg">
          <button class="${lang === 'zh' ? 'on' : ''}" data-lang="zh">中文</button>
          <button class="${lang === 'en' ? 'on' : ''}" data-lang="en">English</button>
        </span></div>
    </div>
    <p class="foot credits">🍉 ${T('瓜皮工作室', 'GuaPi Studio')} · ${VERSION}<br>
      <small>${T('用 ❤️ 和 🍚 制作', 'Made with ❤️ and 🍚')}</small></p>
  </div>`;
  app.querySelector('#btn-back').addEventListener('click', () => { sfx.select(); showHome(); });
  app.querySelector('#sfx-vol').addEventListener('input', e => {
    sfxVol = +e.target.value / 100;
    store.set('sfxVol', sfxVol);
  });
  app.querySelector('#sfx-vol').addEventListener('change', () => sfx.pair());
  app.querySelector('#bgm-vol').addEventListener('input', e => {
    bgmVol = +e.target.value / 100;
    store.set('bgmVol', bgmVol);
    applyBgmVol();
  });
  app.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => {
    if (lang === b.dataset.lang) return;
    lang = b.dataset.lang;
    store.set('lang', lang);
    sfx.select();
    showSettings();
  }));
}

// ———————————— 玩法教学(step by step 聚光灯引导) ————————————
function guideSteps() {
  return [
    {
      target: '.g-orders', scale: 1.12,
      art: '🐰<i>➜</i>🍛<i>➜</i>✅',
      zh: '完成顾客点单,才能过关', en: 'Cook every order to win',
    },
    {
      target: '.g-tiles', scale: 1.1,
      art: '<b class="ga-gold">🥚✨🥚</b>&emsp;<b class="ga-green">🥚💚🍚</b>',
      zh: '点两张发光的牌:金光 = 同款,绿光 = 菜谱搭子', en: 'Tap two glowing tiles: gold = same, green = recipe pair',
    },
    {
      target: '.g-slot', scale: 1.12,
      art: '🥚<i>➜</i>🧺<i>…</i>🥚<i>➜</i>💥',
      zh: '连不到的先放进备菜槽,同款或搭子相遇自动消;塞满 7 格就输', en: "Can't link? Hold it below — pairs clear on arrival. 7 tiles = lose",
    },
    {
      target: '.g-rot', scale: 2.1,
      art: '<span class="ga-rot"><span class="ga-bar"></span>🍅</span><i>➜</i>🤢',
      zh: '槽里的食材会变质!绿条走完就输,「弹出」能救', en: 'Held food rots! Empty bar = lose. “Eject” rescues it',
    },
    {
      target: '.g-recipe', scale: 1.18,
      art: '🥚<i>+</i>🍚<i>=</i>🍛',
      zh: '搭子合成菜品;点 📖 或点单卡片随时查配方', en: 'Pairs cook dishes — tap 📖 or order chips for recipes',
    },
  ];
}

let guideIdx = 0, guideClone = null;

function showInstructions() {
  clearInterval(levelTimer);
  document.body.classList.add('in-game');
  game = null;
  window.__game = null;
  guideIdx = 0;
  app.innerHTML = `
  <div class="screen guide">
    <div class="g-demo" aria-hidden="true">
      <div class="orderbar g-orders"><span class="ob-label">📋</span>
        <div class="ob-list">
          <span class="ob-chip">🐰🍛<b>0/1</b></span>
          <span class="ob-chip">🐱🍦<b>0/2</b></span>
        </div></div>
      <div class="g-tiles">
        <span class="d-tile glow" style="background:${TINTS[0]}">🥚</span>
        <span class="d-tile glow" style="background:${TINTS[0]}">🥚</span>
        <span class="d-gap"></span>
        <span class="d-tile glow2" style="background:${TINTS[8]}">🍓</span>
        <span class="d-tile glow2" style="background:${TINTS[9]}">🥛</span>
        <span class="d-gap"></span>
        <span class="d-tile covered" style="background:${TINTS[2]}">🍞</span>
        <span class="d-tile covered" style="background:${TINTS[3]}">🥬</span>
      </div>
      <div class="g-recipe clay">
        <div class="rb-row"><span>🥚</span><i>+</i><span>🍚</span><i>=</i><span>🍛</span></div>
        <div class="rb-row"><span>🍓</span><i>+</i><span>🥛</span><i>=</i><span>🍦</span></div>
      </div>
      <div class="slotbar clay g-slot">
        <div class="slot-cell"><div class="slot-tile" style="background:${TINTS[2]}">🍞<i class="fresh" style="width:78%;background:#6EE7B7"></i></div></div>
        <div class="slot-cell"><div class="slot-tile" style="background:${TINTS[3]}">🥬<i class="fresh" style="width:45%;background:#FCD34D"></i></div></div>
        <div class="slot-cell"><div class="slot-tile rotting g-rot" style="background:${TINTS[4]}">🍅<i class="fresh" style="width:12%;background:#FB7185"></i></div></div>
        ${'<div class="slot-cell"></div>'.repeat(4)}
      </div>
    </div>
    <div class="g-mask"></div>
    <div class="g-caption clay"><div class="g-art"></div><p class="g-text"></p></div>
    <button class="g-skip">${T('跳过', 'Skip')}</button>
    <div class="g-nav">
      <button class="g-btn" id="g-prev">←</button>
      <div class="g-dots">${guideSteps().map((_, i) => `<i data-i="${i}"></i>`).join('')}</div>
      <button class="g-btn primary" id="g-next">→</button>
    </div>
  </div>`;
  app.querySelector('.g-skip').addEventListener('click', () => { sfx.select(); showLevels(); });
  app.querySelector('#g-prev').addEventListener('click', () => { if (guideIdx > 0) { sfx.select(); guideStep(guideIdx - 1); } });
  app.querySelector('#g-next').addEventListener('click', () => {
    sfx.select();
    if (guideIdx < guideSteps().length - 1) guideStep(guideIdx + 1);
    else showLevels();
  });
  requestAnimationFrame(() => guideStep(0));
}

function guideStep(i) {
  const steps = guideSteps();
  guideIdx = i;
  const st = steps[i];
  if (guideClone) { guideClone.remove(); guideClone = null; }
  const target = app.querySelector(st.target);
  if (!target) return;
  const r = target.getBoundingClientRect();
  // 克隆目标区域,提到灰度遮罩之上并放大 —— 聚光灯效果
  guideClone = target.cloneNode(true);
  guideClone.classList.add('g-spot');
  guideClone.style.cssText += `;position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;margin:0;--gs:${st.scale}`;
  app.querySelector('.guide').appendChild(guideClone);
  // 说明卡:目标在上半屏放下方,反之放上方
  const cap = app.querySelector('.g-caption');
  cap.querySelector('.g-art').innerHTML = st.art;
  cap.querySelector('.g-text').textContent = T(st.zh, st.en);
  const vh = window.innerHeight;
  const cy = r.top + r.height / 2;
  cap.style.top = cy < vh / 2 ? Math.min(r.bottom + r.height * (st.scale - 1) / 2 + 24, vh - 220) + 'px' : '';
  cap.style.bottom = cy >= vh / 2 ? (vh - r.top + r.height * (st.scale - 1) / 2 + 24) + 'px' : '';
  if (cy < vh / 2) cap.style.removeProperty('bottom'); else cap.style.removeProperty('top');
  // 导航状态
  app.querySelectorAll('.g-dots i').forEach((d, di) => d.classList.toggle('on', di === i));
  app.querySelector('#g-prev').disabled = i === 0;
  app.querySelector('#g-next').textContent = i === steps.length - 1 ? '🍳 ' + T('开玩!', "Cook!") : '→';
}

// ———————————— 开局与对局渲染 ————————————
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
  clearInterval(levelTimer);
  deadline = startTime + (cfg.time || 300) * 1000;
  levelTimer = setInterval(tickClock, 250);
  const att = store.get('att', {});
  att[lv] = (att[lv] || 0) + 1;
  store.set('att', att);
  renderPlay();
  if (lv === 1 && !tutDone.start) {
    tutDone.start = 1;
    hint(T('📋 顶上是顾客点单!点一下卡片能看配方,做齐这些菜 + 清空牌面才能过关~',
      '📋 Orders up top! Tap a chip for its recipe. Cook them all + clear the board to win'), 5200);
    setTimeout(() => {
      if (game && levelId === 1 && game.status === 'playing') {
        hint(T('👆 点一张食材:同款发金光,菜谱搭子发绿光,点发光的那张就能消!',
          '👆 Tap a tile: same kind glows gold, recipe pairs glow green — tap a glowing one to clear!'), 6500);
      }
    }, 5400);
  }
}

function renderPlay() {
  document.body.classList.add('in-game');
  app.innerHTML = `
  <div class="screen play">
    <div class="topbar">
      <button class="icon-btn" id="btn-back" aria-label="${T('返回', 'Back')}">${ICONS.back}</button>
      <span class="lv-name">${lvname(levelId)}</span>
      <button class="icon-btn" id="btn-book" aria-label="${T('查看菜谱', 'Recipes')}">${ICONS.book}</button>
      <button class="icon-btn" id="btn-mute" aria-label="${T('声音开关', 'Toggle sound')}">${muted ? ICONS.mutedIcon : ICONS.sound}</button>
    </div>
    <div class="orderbar"><span class="ob-label">📋 ${T('点单', 'Orders')}</span><div class="ob-list"></div><span class="ob-dishes"></span></div>
    <div class="progress"><div class="progress-fill"></div><span class="progress-time">⏱</span><span class="progress-num"></span></div>
    <div class="board-wrap"><div class="board"><svg class="linksvg"></svg></div></div>
    <div class="tools">
      <button class="tool" data-tool="undo">${ICONS.undo}<span>${toolName('undo')}</span><i class="badge"></i></button>
      <button class="tool" data-tool="shuffle">${ICONS.shuffle}<span>${toolName('shuffle')}</span><i class="badge"></i></button>
      <button class="tool" data-tool="pop">${ICONS.pop}<span>${toolName('pop')}</span><i class="badge"></i></button>
    </div>
    <div class="slotbar clay">${'<div class="slot-cell"></div>'.repeat(game.slotCap)}</div>
    <div class="hintbar" hidden></div>
  </div>`;
  boardEl = app.querySelector('.board');
  svgEl = app.querySelector('.linksvg');
  slotCellEls = [...app.querySelectorAll('.slot-cell')];
  app.querySelector('#btn-back').addEventListener('click', () => { sfx.select(); showLevels(); });
  app.querySelector('#btn-book').addEventListener('click', () => showRecipes(null));
  app.querySelector('.ob-list').addEventListener('click', e => {
    const chip = e.target.closest('.ob-chip');
    if (chip) showRecipes(+chip.dataset.ri);
  });
  app.querySelector('#btn-mute').addEventListener('click', e => {
    muted = !muted;
    store.set('muted', muted);
    applyBgmVol();
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
    el.setAttribute('aria-label', iname(t.type));
    el.addEventListener('click', () => onTileClick(t));
    boardEl.appendChild(el);
    tileEls.set(t.id, el);
  }
}

// 倒计时:更新显示;到点判负
function tickClock() {
  if (!game || game.status !== 'playing') { clearInterval(levelTimer); return; }
  const el = app.querySelector('.progress-time');
  if (!el) return;
  const left = Math.max(0, deadline - Date.now());
  const s = Math.ceil(left / 1000);
  el.textContent = `⏱ ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  el.classList.toggle('urgent', left <= 30000);
  if (left <= 0) {
    clearInterval(levelTimer);
    game.timeUp();
    refresh();
    checkEnd();
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
      el.setAttribute('aria-label', iname(t.type));
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
  const ordersView = [...game.orders].sort((a, b) => (a.done >= a.need) - (b.done >= b.need)); // 完成的沉底
  app.querySelector('.ob-list').innerHTML = ordersView.map(o =>
    `<span class="ob-chip ${o.done >= o.need ? 'done' : ''}" data-ri="${o.recipe}" role="button" title="${T('点我看配方', 'Tap for recipe')}">${o.customer}${RECIPES[o.recipe].e}<b>${o.done}/${o.need}</b></span>`
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
  tut('link', T('漂亮!连不到的食材点一下会落进备菜槽,同款或搭子在槽里相遇也会消~',
    "Nice! Tiles you can't link drop into the hold — pairs there clear too"));
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
    if (res.paired) {
      if (res.recipe === null) tut('pair', T('同款在备菜槽相遇,自动消除,槽位不亏!', 'Same kind met in the hold — auto-cleared!'));
    } else {
      tut('slot', T('槽里的食材会掉新鲜度(看牌底的小绿条),变质或塞满 7 格都会输!',
        'Held food loses freshness (green bar below). Rot or 7 tiles = lose!'));
    }
    checkEnd();
  });
}

// 菜谱弹窗:highlight 为菜谱索引时只看这一道,null 则展示本关全部
function showRecipes(highlight) {
  if (!game) return;
  const list = LEVELS[levelId].typeList;
  const ris = highlight !== null
    ? [highlight]
    : RECIPES.map((_, i) => i).filter(i => list.includes(RECIPES[i].a) && list.includes(RECIPES[i].b));
  const rows = ris.map(ri => {
    const r = RECIPES[ri];
    return `<div class="rb-row ${ri === highlight ? 'hl' : ''}">
      <span>${INGREDIENTS[r.a].e}</span><i>+</i><span>${INGREDIENTS[r.b].e}</span><i>=</i><span>${r.e}</span>
      <small>${rname(ri)}</small></div>`;
  }).join('');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal clay recipe-book">
      <h2>${highlight !== null ? RECIPES[highlight].e + ' ' + T('怎么做?', 'How to cook?') : '📖 ' + T('本关菜谱', 'Recipes')}</h2>
      ${rows}
      <p class="m-line">${T('搭子食材选中后会发<b class="rb-green">绿光</b>:连线消除,或在备菜槽相遇,都会做出这道菜~',
        'Recipe pairs glow <b class="rb-green">green</b> — link them, or let them meet in the hold, to cook the dish')}</p>
      <button class="m-btn primary" data-act="close">${T('知道啦', 'Got it')}</button>
    </div>`;
  overlay.addEventListener('click', e => {
    if (e.target === overlay || (e.target.dataset && e.target.dataset.act === 'close')) overlay.remove();
  });
  document.body.appendChild(overlay);
  sfx.select();
}

// 出菜:欢呼/碰杯 + 菜品飞向点单栏 + 核销订单提示 + 每 3 道奖励一个道具
function onDish(recipeIdx, fromRect, orderRes) {
  const r = RECIPES[recipeIdx];
  if (r.drink) sfx.clink(); else sfx.cheer();
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
    hint(T(`🍳 出菜啦!${INGREDIENTS[r.a].e}+${INGREDIENTS[r.b].e}=${r.e} ${rname(recipeIdx)}!这就是顾客点的菜,点单栏 +1~`,
      `🍳 Dish up! ${INGREDIENTS[r.a].e}+${INGREDIENTS[r.b].e}=${r.e} ${rname(recipeIdx)} — order progress +1!`), 6000);
  } else if (orderRes && orderRes.completed) {
    hint(T(`${orderRes.order.customer} 顾客满意!${r.e} ${rname(recipeIdx)} 订单完成!`,
      `${orderRes.order.customer} Happy customer! ${r.e} ${rname(recipeIdx)} order done!`), 2800);
  } else if (orderRes) {
    hint(`📋 ${r.e} ${rname(recipeIdx)} ${T('出餐', 'served')} ${orderRes.order.done}/${orderRes.order.need}`, 2200);
  } else {
    hint(T(`叮!${r.e} ${rname(recipeIdx)} +1(没有对应点单,当员工餐吧)`,
      `Ding! ${r.e} ${rname(recipeIdx)} +1 (no order — staff meal!)`), 2200);
  }
  // 道具奖励
  while (game.dishes.length - rewardedDishes >= 3) {
    rewardedDishes += 3;
    const ks = Object.keys(tools).filter(k => tools[k] < 3);
    if (!ks.length) break;
    const k = ks[Math.floor(Math.random() * ks.length)];
    tools[k]++;
    setTimeout(() => hint(T(`🎁 出满 3 道菜,奖励道具:${toolName(k)} +1!`, `🎁 3 dishes served — bonus: ${toolName(k)} +1!`), 2600), 900);
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
  const canRevive = !won && game.snapshot && tools.undo > 0 && game.loseReason !== 'time'; // 超时无法靠撤回复活
  const dishStat = game.dishes.length ? ` · ${T('出品', 'dishes')} ${game.dishes.length}` : '';
  const loseInfo = {
    slot: { mascot: '😿', title: T('备菜槽满了…', 'Hold is full…') },
    spoil: { mascot: '🤢', title: T('食材变质了…', 'Food went bad…') },
    orders: { mascot: '😭', title: T('顾客没吃上…', 'Customers left hungry…') },
    time: { mascot: '⏰', title: T('时间到了…', "Time's up…") },
  };
  const loseTips = {
    spoil: T('食材在备菜槽里每走一步掉 1 格新鲜度,归零就坏——快满时用「弹出」把老食材送回牌面能重置新鲜度!',
      'Held food loses 1 freshness per move. Use “Eject” to send old tiles back and reset freshness!'),
    orders: T('食材都用完了,点单还没出齐——同款配对会吃掉菜谱食材,记得给顾客的菜留材料!',
      'Out of ingredients with orders unfinished — same-kind pairs eat recipe materials, save some for orders!'),
    time: T(`这关限时 ${Math.round(LEVELS[levelId].time / 60)} 分钟——下一把手速快一点,少纠结~`,
      `This level has a ${Math.round(LEVELS[levelId].time / 60)}-minute limit — play faster, hesitate less!`),
  };
  const loseLines = [
    T('后厨爆单,备菜槽全满了…', 'Kitchen slammed — hold is packed…'),
    T('这关实测通过率是个位数,不丢人', 'Single-digit clear rate here. No shame'),
    T('道具真的不用吗,大厨?', 'Chef, the power-ups exist for a reason'),
    T('灶台在偷笑,你忍吗?', 'The stove is laughing at you'),
    T('差一点点,回锅重造!', 'So close — back in the wok!'),
  ];
  let mascot, title, line, btns = '';
  if (won && levelId < 5) {
    mascot = '🥳';
    title = lvname(levelId).split('· ')[1] + T(',过!', ' — cleared!');
    line = T(`${lvname(levelId + 1)}已解锁,续火吗?`, `${lvname(levelId + 1)} unlocked. Keep the fire going?`);
    btns = `<button class="m-btn primary" data-act="next">${LEVEL_META[levelId + 1].icon} ${T('开下一灶', 'Next level')}</button>
            <button class="m-btn plain" data-act="home">${T('回首页', 'Home')}</button>`;
  } else if (won) {
    mascot = '👑';
    title = T('传说灶神,就是你!!', 'Kitchen God — it’s you!!');
    line = T('<1% 的通过率也拦不住你,快去好友群立牌坊', 'Not even a <1% clear rate could stop you. Go brag');
    btns = `<button class="m-btn primary" data-act="retry">${T('再封神一次', 'Once more')}</button>
            <button class="m-btn plain" data-act="home">${T('功成身退', 'Retire a legend')}</button>`;
  } else {
    const info = loseInfo[game.loseReason] || loseInfo.slot;
    mascot = info.mascot; title = info.title;
    line = loseTips[game.loseReason]
      || (levelId <= 2 ? T('别慌,前两关多试试就熟了~', 'No rush — the first levels are for practice') : loseLines[Math.floor(Math.random() * loseLines.length)]);
    btns = `${canRevive ? `<button class="m-btn primary" data-act="revive">💊 ${T('撤回复活(×1)', 'Undo & revive (×1)')}</button>` : ''}
            <button class="m-btn ${canRevive ? 'plain' : 'primary'}" data-act="retry">${T('再来一次', 'Try again')}</button>
            <button class="m-btn plain" data-act="home">${T('回首页', 'Home')}</button>`;
  }
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal clay">
      <div class="m-mascot">${mascot}</div>
      <h2>${title}</h2>
      <p class="m-line">${line}</p>
      <p class="m-stats">${T('点单', 'Orders')} ${game.orders.filter(o => o.done >= o.need).length}/${game.orders.length} · ${T('消除', 'Cleared')} ${done}/${game.total}${dishStat} · ${secs}s · ${T(`第 ${att[levelId] || 1} 次挑战`, `attempt ${att[levelId] || 1}`)}</p>
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
(function decorate() { // 菜单页的漂浮小装饰(对局中自动隐藏)
  const deco = document.getElementById('bg-deco');
  if (!deco) return;
  ['☁️', '🍓', '🥕', '⭐', '🍳', '☁️', '🧀', '🍋'].forEach((e, i) => {
    const s = document.createElement('span');
    s.className = 'deco';
    s.textContent = e;
    s.style.cssText = `left:${(i * 37 + 5) % 88}%;top:${(i * 31 + 4) % 86}%;font-size:${24 + (i % 3) * 9}px;animation-duration:${5 + (i % 4)}s;animation-delay:${(-i * 1.4).toFixed(1)}s`;
    deco.appendChild(s);
  });
})();

window.addEventListener('resize', () => { if (game) { layoutBoard(); refresh(); } });
document.addEventListener('pointerdown', () => { ac(); startBGM(); }, { once: true });
showHome();
