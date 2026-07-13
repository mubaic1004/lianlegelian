// 「炒了个菜」核心引擎 —— 纯逻辑,无 DOM,浏览器与 Node 通用
// 规则:多层牌堆(遮挡)× 连连看(两折内连线)× 7 格备菜槽
// 消除:同类配对,或“菜谱搭子”合成(鸡蛋+米饭=蛋炒饭)
// 目标:清空牌面 + 完成顶部顾客点单;槽内食材会掉新鲜度,变质即输

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

// ———————————————————————— 食材与菜谱 ————————————————————————
// 前 20 种食材两两组成 10 道菜谱(搭子互为“跨类配对”),后 12 种是只能同类配对的散装食材

export const INGREDIENTS = [
  { e: '🥚', name: '鸡蛋', en: 'Egg' }, { e: '🍚', name: '米饭', en: 'Rice' },
  { e: '🍞', name: '面包', en: 'Bread' }, { e: '🥬', name: '生菜', en: 'Lettuce' },
  { e: '🍅', name: '番茄', en: 'Tomato' }, { e: '🧀', name: '芝士', en: 'Cheese' },
  { e: '🌽', name: '玉米', en: 'Corn' }, { e: '🧈', name: '黄油', en: 'Butter' },
  { e: '🍓', name: '草莓', en: 'Strawberry' }, { e: '🥛', name: '牛奶', en: 'Milk' },
  { e: '🍋', name: '柠檬', en: 'Lemon' }, { e: '🧊', name: '冰块', en: 'Ice' },
  { e: '🥔', name: '土豆', en: 'Potato' }, { e: '🥩', name: '牛肉', en: 'Beef' },
  { e: '🐟', name: '鲜鱼', en: 'Fish' }, { e: '🦐', name: '鲜虾', en: 'Shrimp' },
  { e: '🍎', name: '苹果', en: 'Apple' }, { e: '🍯', name: '蜂蜜', en: 'Honey' },
  { e: '🍫', name: '巧克力', en: 'Chocolate' }, { e: '🍌', name: '香蕉', en: 'Banana' },
  { e: '🥕', name: '胡萝卜', en: 'Carrot' }, { e: '🍇', name: '葡萄', en: 'Grape' },
  { e: '🍄', name: '蘑菇', en: 'Mushroom' }, { e: '🥨', name: '椒盐卷饼', en: 'Pretzel' },
  { e: '🥦', name: '西兰花', en: 'Broccoli' }, { e: '🌰', name: '栗子', en: 'Chestnut' },
  { e: '🍪', name: '饼干', en: 'Cookie' }, { e: '🧅', name: '洋葱', en: 'Onion' },
  { e: '🥒', name: '黄瓜', en: 'Cucumber' }, { e: '🍆', name: '茄子', en: 'Eggplant' },
  { e: '🫑', name: '青椒', en: 'Pepper' }, { e: '🧄', name: '大蒜', en: 'Garlic' },
];

export const RECIPES = [
  { a: 0, b: 1, e: '🍛', name: '蛋炒饭', en: 'Egg Fried Rice' },
  { a: 2, b: 3, e: '🥪', name: '三明治', en: 'Sandwich' },
  { a: 4, b: 5, e: '🍕', name: '玛格丽特披萨', en: 'Margherita Pizza' },
  { a: 6, b: 7, e: '🍿', name: '黄油爆米花', en: 'Butter Popcorn' },
  { a: 8, b: 9, e: '🍦', name: '草莓奶昔', en: 'Strawberry Shake', drink: true },
  { a: 10, b: 11, e: '🍹', name: '冰柠特调', en: 'Iced Lemonade', drink: true },
  { a: 12, b: 13, e: '🍲', name: '土豆炖牛肉', en: 'Beef & Potato Stew' },
  { a: 14, b: 15, e: '🥘', name: '海鲜锅', en: 'Seafood Pot' },
  { a: 16, b: 17, e: '🥧', name: '蜂蜜苹果派', en: 'Honey Apple Pie' },
  { a: 18, b: 19, e: '🧁', name: '香蕉可可杯', en: 'Banana Cocoa Cup' },
];

export const PARTNER = {};   // 食材 → 菜谱搭子
export const RECIPE_OF = {}; // 食材 → 菜谱索引
RECIPES.forEach((r, i) => {
  PARTNER[r.a] = r.b; PARTNER[r.b] = r.a;
  RECIPE_OF[r.a] = i; RECIPE_OF[r.b] = i;
});

// 两种牌型能否消除:同类,或互为菜谱搭子
export function matches(t1, t2) { return t1 === t2 || PARTNER[t1] === t2; }

// ———————————————————————— 关卡布局 ————————————————————————
// 坐标为“细格”:一张牌占 2×2 细格,层间可错半张牌(1 细格)

function grid(layer, x0, y0, cols, rows, step) {
  const out = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      out.push({ x: x0 + c * step, y: y0 + r * step, layer });
  return out;
}

// 各关食材清单:菜谱搭子成对出现;高关卡散装食材占比更高、单种份数更少 → 更难
const R = i => [RECIPES[i].a, RECIPES[i].b];
const LONERS = [20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31];

export const LEVELS = {
  1: {
    name: '第 1 关 · 开火热灶', en: 'Level 1 · Light the Stove',
    typeList: [...R(0), ...R(1), ...R(4)], // 3 道菜谱,6 种食材
    orders: 2, fresh: 24, time: 120,
    seeds: [7],
    layout() {
      return [
        ...grid(1, 1, 3, 5, 4, 3), // 5×4,彼此留 1 格空隙,好连
        { x: 2, y: 4, layer: 2 }, { x: 10, y: 4, layer: 2 },
        { x: 2, y: 10, layer: 2 }, { x: 10, y: 10, layer: 2 },
      ]; // 24 张
    },
  },
  2: {
    name: '第 2 关 · 小试牛刀', en: 'Level 2 · First Chops',
    typeList: [...R(0), ...R(1), ...R(2), ...R(3), ...LONERS.slice(0, 6)], // 4 菜谱 + 6 散装
    orders: 3, fresh: 22, time: 180,
    seeds: [31, 38, 36, 10, 8, 30, 4, 18, 1], // bot 实测 55%~72%
    layout() {
      const pos = [];
      for (const L of [1, 3, 5]) pos.push(...grid(L, 3, 3, 4, 4, 2)); // 48
      for (const L of [2, 4]) pos.push(...grid(L, 4, 4, 3, 3, 2));    // 18
      for (let L = 1; L <= 3; L++) { pos.push({ x: 0, y: 5, layer: L }); pos.push({ x: 12, y: 5, layer: L }); } // 6
      pos.push(...grid(1, 1, 12, 6, 1, 2)); // 底部一排 6
      return pos; // 78 张
    },
  },
  3: {
    name: '第 3 关 · 渐入佳境', en: 'Level 3 · On a Roll',
    typeList: [...R(0), ...R(1), ...R(2), ...R(3), ...LONERS], // 4 菜谱 + 12 散装
    orders: 4, fresh: 20, time: 240,
    seeds: [35, 7, 40, 36, 14, 8, 28], // bot 实测 10%~16%
    layout() {
      const pos = [];
      for (const L of [1, 3, 5]) pos.push(...grid(L, 3, 3, 5, 5, 2)); // 75
      for (const L of [2, 4]) pos.push(...grid(L, 4, 4, 4, 4, 2));    // 32
      for (let L = 1; L <= 6; L++) { pos.push({ x: 0, y: 7, layer: L }); pos.push({ x: 14, y: 7, layer: L }); } // 12
      pos.push(...grid(1, 1, 14, 7, 1, 2)); // 7
      return pos; // 126 张
    },
  },
  4: {
    name: "第 4 关 · 地狱后厨", en: "Level 4 · Hell's Kitchen",
    typeList: [...R(0), ...R(1), ...R(2), ...R(3), ...R(4), ...R(5), ...LONERS.slice(0, 10)], // 6 菜谱 + 10 散装
    orders: 5, fresh: 18, time: 300,
    seeds: [40, 12, 24, 1, 4, 8, 28, 36, 41, 43], // bot 实测 1%~4%
    layout() {
      const pos = [];
      for (const L of [1, 3, 5]) pos.push(...grid(L, 3, 3, 5, 5, 2)); // 75
      for (const L of [2, 4, 6]) pos.push(...grid(L, 4, 4, 4, 4, 2)); // 48
      for (let L = 1; L <= 7; L++) { pos.push({ x: 0, y: 7, layer: L }); pos.push({ x: 14, y: 7, layer: L }); } // 14
      pos.push(...grid(1, 0, 14, 8, 1, 2)); // 8
      pos.push(...grid(1, 1, 16, 7, 1, 2)); // 7
      return pos; // 152 张
    },
  },
  5: {
    name: '第 5 关 · 传说灶神', en: 'Level 5 · Kitchen God',
    typeList: [...R(0), ...R(1), ...R(2), ...R(3), ...R(4), ...R(5), ...R(6), ...R(7), ...LONERS], // 8 菜谱 + 12 散装
    orders: 6, fresh: 19, time: 300,
    seeds: [6, 17, 19, 30, 31, 58, 70, 51, 7, 11, 60, 64], // bot 实测 0.3%~1.7%,均 ≥1 胜确认有解
    layout() {
      const pos = [];
      for (const L of [1, 3, 5, 7]) pos.push(...grid(L, 3, 3, 5, 5, 2)); // 100
      for (const L of [2, 4, 6]) pos.push(...grid(L, 4, 4, 4, 4, 2));    // 48
      for (const [px2, py2] of [[0, 3], [14, 3], [0, 11], [14, 11]])      // 四角盲堆,各 6 层
        for (let L = 1; L <= 6; L++) pos.push({ x: px2, y: py2, layer: L }); // 24
      pos.push(...grid(1, 0, 14, 8, 1, 2)); // 8
      pos.push(...grid(1, 1, 16, 8, 1, 2)); // 8
      return pos; // 188 张
    },
  },
};

function evenCounts(total, k) {
  if (total % 2) throw new Error('布局牌数必须为偶数,当前 ' + total);
  const base = Math.max(2, Math.floor(total / k / 2) * 2);
  const counts = Array(k).fill(base);
  let rem = total - base * k, i = 0;
  while (rem > 0) { counts[i % k] += 2; rem -= 2; i++; }
  while (rem < 0) { if (counts[i % k] > 2) { counts[i % k] -= 2; rem += 2; } i++; }
  return counts;
}

const CUSTOMERS = ['🐰', '🐱', '🐻', '🐶', '🦊', '🐼', '🐹', '🐨'];

export function buildLevel(levelId, seed) {
  const cfg = LEVELS[levelId];
  const pos = cfg.layout();
  const rng = mulberry32(seed);
  const counts = evenCounts(pos.length, cfg.typeList.length);
  const types = [];
  counts.forEach((c, i) => { for (let k = 0; k < c; k++) types.push(cfg.typeList[i]); });
  for (let i = types.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [types[i], types[j]] = [types[j], types[i]];
  }
  const game = new Game(pos.map((p, i) => ({ ...p, type: types[i] })));
  game.levelId = levelId;
  game.seed = seed;
  game.freshMax = cfg.fresh;
  // 生成顾客点单:从本关可做的菜谱里抽;份数不超过该菜谱可合成的上限,保证开局可完成
  const cnt = {};
  types.forEach(t => { cnt[t] = (cnt[t] || 0) + 1; });
  const avail = RECIPES.map((_, i) => i).filter(i => cnt[RECIPES[i].a] && cnt[RECIPES[i].b]);
  for (let i = avail.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [avail[i], avail[j]] = [avail[j], avail[i]];
  }
  game.orders = avail.slice(0, cfg.orders).map(ri => {
    const maxDish = Math.min(cnt[RECIPES[ri].a], cnt[RECIPES[ri].b]);
    const need = Math.min(maxDish, rng() < 0.2 + levelId * 0.12 ? 2 : 1);
    return { recipe: ri, need, done: 0, customer: CUSTOMERS[Math.floor(rng() * CUSTOMERS.length)] };
  });
  return game;
}

// ———————————————————————— 游戏状态机 ————————————————————————

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export class Game {
  constructor(tiles) {
    this.tiles = tiles.map((t, i) => ({ id: i, x: t.x, y: t.y, layer: t.layer, type: t.type, state: 'board', fresh: 0 }));
    this.total = this.tiles.length;
    this.slot = [];      // 槽内牌 id,按进入顺序
    this.slotCap = 7;
    this.status = 'playing'; // playing | won | lost
    this.loseReason = null;  // slot(槽满) | spoil(变质) | orders(订单没出齐)
    this.spoiledId = null;
    this.linkCount = 0;
    this.dishes = [];    // 本局做出的菜(菜谱索引,按时间顺序)
    this.orders = [];    // 顾客点单 [{recipe, need, done, customer}]
    this.freshMax = 99;
    this.trackHistory = false;
    this.snapshot = null;
    const xs = this.tiles.map(t => t.x), ys = this.tiles.map(t => t.y);
    this.extent = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
    this.bounds = { minX: this.extent.minX - 2, maxX: this.extent.maxX + 3, minY: this.extent.minY - 2, maxY: this.extent.maxY + 3 };
  }

  boardTiles() { return this.tiles.filter(t => t.state === 'board'); }
  clearedCount() { return this.tiles.filter(t => t.state === 'gone').length; }
  overlaps(a, b) { return a.x < b.x + 2 && b.x < a.x + 2 && a.y < b.y + 2 && b.y < a.y + 2; }
  coverers(t) { return this.boardTiles().filter(o => o.layer > t.layer && this.overlaps(o, t)); }
  isFree(t) { return t.state === 'board' && this.coverers(t).length === 0; }
  freeTiles() { return this.boardTiles().filter(t => this.isFree(t)); }
  ordersDone() { return this.orders.every(o => o.done >= o.need); }

  // —— 连连看连通检测:折角 ≤2;连线飞在两牌较高层之上,只被不低于该层的牌挡住 ——
  linkPath(a, b) {
    if (!a || !b || a === b || !matches(a.type, b.type)) return null;
    if (!this.isFree(a) || !this.isFree(b)) return null;
    const h = Math.max(a.layer, b.layer);
    const blocked = new Set();
    for (const t of this.boardTiles()) {
      if (t === a || t === b || t.layer < h) continue;
      for (let dx = 0; dx < 2; dx++)
        for (let dy = 0; dy < 2; dy++) blocked.add((t.x + dx) + ',' + (t.y + dy));
    }
    const { minX, maxX, minY, maxY } = this.bounds;
    const target = new Set();
    for (let dx = 0; dx < 2; dx++)
      for (let dy = 0; dy < 2; dy++) target.add((b.x + dx) + ',' + (b.y + dy));

    const seen = new Set();
    let states = [];
    for (let dx = 0; dx < 2; dx++)
      for (let dy = 0; dy < 2; dy++)
        for (let d = 0; d < 4; d++) states.push({ x: a.x + dx, y: a.y + dy, d, prev: null });

    for (let turns = 0; turns <= 2; turns++) {
      const next = [];
      const stack = states.slice();
      for (let i = 0; i < stack.length; i++) {
        const s = stack[i];
        const key = s.x + ',' + s.y + ',' + s.d;
        if (seen.has(key)) continue;
        seen.add(key);
        if (target.has(s.x + ',' + s.y)) return this._tracePath(s);
        const nx = s.x + DIRS[s.d][0], ny = s.y + DIRS[s.d][1];
        if (nx >= minX && nx <= maxX && ny >= minY && ny <= maxY && !blocked.has(nx + ',' + ny)) {
          stack.push({ x: nx, y: ny, d: s.d, prev: s });
        }
        if (turns < 2) {
          for (let d2 = 0; d2 < 4; d2++) if (d2 !== s.d) next.push({ x: s.x, y: s.y, d: d2, prev: s.prev });
        }
      }
      states = next;
    }
    return null;
  }

  _tracePath(state) {
    const pts = [];
    for (let s = state; s; s = s.prev) pts.push([s.x, s.y]);
    pts.reverse();
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const [px, py] = out[out.length - 1], [cx, cy] = pts[i], [nx, ny] = pts[i + 1];
      if ((px === cx && cx === nx) || (py === cy && cy === ny)) continue;
      out.push(pts[i]);
    }
    if (pts.length > 1) out.push(pts[pts.length - 1]);
    return out;
  }

  linkablePartners(a) {
    if (!this.isFree(a)) return [];
    return this.freeTiles().filter(b => b !== a && matches(a.type, b.type) && this.linkPath(a, b));
  }

  mark() {
    if (!this.trackHistory) return;
    this.snapshot = {
      states: this.tiles.map(t => t.state),
      types: this.tiles.map(t => t.type),
      pos: this.tiles.map(t => [t.x, t.y, t.layer]),
      fresh: this.tiles.map(t => t.fresh),
      slot: this.slot.slice(),
      status: this.status,
      loseReason: this.loseReason,
      linkCount: this.linkCount,
      dishes: this.dishes.slice(),
      orders: this.orders.map(o => ({ ...o })),
    };
  }

  undo() {
    if (!this.snapshot) return false;
    const s = this.snapshot;
    this.tiles.forEach((t, i) => {
      t.state = s.states[i]; t.type = s.types[i]; t.fresh = s.fresh[i];
      [t.x, t.y, t.layer] = s.pos[i];
    });
    this.slot = s.slot.slice();
    this.status = s.status;
    this.loseReason = s.loseReason;
    this.spoiledId = null;
    this.linkCount = s.linkCount;
    this.dishes = s.dishes.slice();
    this.orders = s.orders.map(o => ({ ...o }));
    this.snapshot = null;
    return true;
  }

  _checkWin() {
    if (this.status !== 'playing') return;
    if (this.tiles.every(t => t.state === 'gone')) {
      if (this.ordersDone()) this.status = 'won';
      else { this.status = 'lost'; this.loseReason = 'orders'; }
    }
  }

  // 出菜:记录 + 核销订单;返回 {order, completed} 或 null(没有对应订单)
  _makeDish(recipeIdx) {
    this.dishes.push(recipeIdx);
    const o = this.orders.find(x => x.recipe === recipeIdx && x.done < x.need);
    if (!o) return null;
    o.done++;
    return { order: o, completed: o.done >= o.need };
  }

  // 每走一步,槽内(本步新进的除外)食材新鲜度 -1;归零即变质判负
  _tickFresh(excludeId) {
    for (const id of this.slot) {
      if (id === excludeId) continue;
      const t = this.tiles[id];
      if (--t.fresh <= 0 && this.status === 'playing') {
        this.status = 'lost';
        this.loseReason = 'spoil';
        this.spoiledId = id;
      }
    }
  }

  // 连线消除;成功返回 { path, recipe, order }
  link(a, b) {
    if (this.status !== 'playing') return null;
    const path = this.linkPath(a, b);
    if (!path) return null;
    this.mark();
    const recipe = a.type !== b.type ? RECIPE_OF[a.type] : null;
    a.state = 'gone'; b.state = 'gone';
    this.linkCount++;
    const order = recipe !== null ? this._makeDish(recipe) : null;
    this._tickFresh(null);
    this._checkWin();
    return { path, recipe, order };
  }

  // 入槽;槽内已有同类或菜谱搭子则立刻消除/合成(不占容量);塞入第 7 张单牌即失败
  sendToSlot(t) {
    if (this.status !== 'playing' || !this.isFree(t)) return null;
    this.mark();
    let mi = this.slot.findIndex(id => this.tiles[id].type === t.type);
    let recipe = null;
    if (mi < 0) {
      mi = this.slot.findIndex(id => PARTNER[this.tiles[id].type] === t.type);
      if (mi >= 0) recipe = RECIPE_OF[t.type];
    }
    if (mi >= 0) {
      const matchId = this.slot[mi];
      this.slot.splice(mi, 1);
      this.tiles[matchId].state = 'gone';
      t.state = 'gone';
      const order = recipe !== null ? this._makeDish(recipe) : null;
      this._tickFresh(null);
      this._checkWin();
      return { paired: true, matchId, recipe, order };
    }
    t.state = 'slot';
    t.fresh = this.freshMax;
    this.slot.push(t.id);
    this._tickFresh(t.id);
    if (this.status === 'playing' && this.slot.length >= this.slotCap) {
      this.status = 'lost';
      this.loseReason = 'slot';
    }
    return { paired: false, recipe: null, order: null };
  }

  // 限时到点:判负(由界面层的倒计时调用)
  timeUp() {
    if (this.status !== 'playing') return;
    this.status = 'lost';
    this.loseReason = 'time';
  }

  shuffle(rng) {
    const ts = this.boardTiles();
    if (!ts.length) return false;
    this.mark();
    const types = ts.map(t => t.type);
    for (let i = types.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [types[i], types[j]] = [types[j], types[i]];
    }
    ts.forEach((t, i) => { t.type = types[i]; });
    return true;
  }

  // 弹出:槽内最早(也最不新鲜)的至多 3 张回到场面最顶层中央,新鲜度重置
  popOut() {
    if (this.status !== 'playing' || !this.slot.length) return false;
    this.mark();
    const n = Math.min(3, this.slot.length);
    const ids = this.slot.splice(0, n);
    const maxL = Math.max(0, ...this.boardTiles().map(t => t.layer)) + 1;
    const cx = Math.round((this.extent.minX + this.extent.maxX) / 2);
    const cy = Math.round((this.extent.minY + this.extent.maxY) / 2);
    ids.forEach((id, i) => {
      const t = this.tiles[id];
      t.state = 'board';
      t.fresh = 0;
      t.x = cx + (i - 1) * 3;
      t.y = cy;
      t.layer = maxL;
    });
    return true;
  }
}

// ———————————————————————— 难度校准 bot ————————————————————————
// 策略:保鲜告急先救 → 与槽内配对/合成(优先核销订单、避免饿死订单)→ 场上自由对 → 挑“搭档最接近露出”的单张
// 不使用道具,水平≈会规划的普通玩家。

function remainingNeed(game, recipeIdx) {
  let n = 0;
  for (const o of game.orders) if (o.recipe === recipeIdx) n += o.need - o.done;
  return n;
}

// 同类消掉 2 张 type 后,是否会让该菜谱的剩余订单做不齐
function starves(game, type) {
  const p = PARTNER[type];
  if (p === undefined) return false;
  const need = remainingNeed(game, RECIPE_OF[type]);
  if (!need) return false;
  let cntT = 0, cntP = 0;
  for (const t of game.tiles) {
    if (t.state === 'gone') continue;
    if (t.type === type) cntT++;
    else if (t.type === p) cntP++;
  }
  return Math.min(cntT - 2, cntP) < need;
}

// 消除动作打分:核销订单的合成 3 > 不饿死订单的同类 2 > 普通合成 1 > 会饿死订单的同类 0
function moveScore(game, ta, tb) {
  if (ta !== tb) return remainingNeed(game, RECIPE_OF[ta]) > 0 ? 3 : 1;
  return starves(game, ta) ? 0 : 2;
}

export function botPlay(game, rng) {
  let guard = 0;
  while (game.status === 'playing' && guard++ < 3000) {
    const free = game.freeTiles();
    if (!free.length) break;
    const slotTiles = game.slot.map(id => game.tiles[id]);

    // 0. 保鲜告急:优先消掉快变质的槽内牌
    const urgent = slotTiles.filter(s => s.fresh <= 4).sort((a, b) => a.fresh - b.fresh);
    let acted = false;
    for (const s of urgent) {
      const m = free.find(f => matches(f.type, s.type));
      if (m) { game.sendToSlot(m); acted = true; break; }
    }
    if (acted) continue;

    // 1. 与槽内配对/合成
    const comps = [];
    for (const f of free) {
      const s = slotTiles.find(s2 => matches(s2.type, f.type));
      if (s) comps.push({ f, score: moveScore(game, s.type, f.type) + rng() * .5 });
    }
    if (comps.length) {
      comps.sort((a, b) => b.score - a.score);
      game.sendToSlot(comps[0].f);
      continue;
    }

    // 2. 场上自由对
    const pairList = [];
    for (let i = 0; i < free.length; i++)
      for (let j = i + 1; j < free.length; j++)
        if (matches(free[i].type, free[j].type))
          pairList.push({ a: free[i], b: free[j], score: moveScore(game, free[i].type, free[j].type) + rng() * .5 });
    if (pairList.length) {
      pairList.sort((x, y) => y.score - x.score);
      if (game.slot.length <= 5) { game.sendToSlot(pairList[0].a); continue; }
      let linked = false; // 槽已 6:入单张即死,只能试连线
      for (const { a, b } of pairList) {
        if (game.link(a, b)) { linked = true; break; }
      }
      if (linked) continue;
    }

    // 3. 挑“搭档最接近露出”的单张
    let bestT = null, bestS = Infinity;
    for (const t of free) {
      const partners = game.boardTiles().filter(u => u !== t && matches(u.type, t.type));
      let d = Infinity;
      for (const u of partners) d = Math.min(d, game.coverers(u).length);
      const s = d * 2 - t.layer * 0.3 + rng() * 1.5;
      if (s < bestS) { bestS = s; bestT = t; }
    }
    game.sendToSlot(bestT || pick(rng, free));
  }
  return game.status;
}
