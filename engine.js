// 「连了个连」核心引擎 —— 纯逻辑,无 DOM,浏览器与 Node 通用
// 规则:多层牌堆(羊了个羊式遮挡)× 连连看(两折内连线消除)× 7 格卡槽配对

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

export const EMOJIS = [
  '🥕', '🍓', '🧶', '🐟', '🌽', '🍄', '🫐', '🌸', '🎈', '🐝',
  '🧀', '🍩', '☘️', '🌙', '🍑', '🐣', '🍙', '🎀', '🧊', '🌈',
];

// ———————————————————————— 关卡布局 ————————————————————————
// 坐标为“细格”:一张牌占 2×2 细格,层间可错半张牌(1 细格)

function grid(layer, x0, y0, cols, rows, step) {
  const out = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      out.push({ x: x0 + c * step, y: y0 + r * step, layer });
  return out;
}

export const LEVELS = {
  1: {
    name: '第 1 关 · 热热身',
    types: 6,
    seeds: [7], // 固定布局,保证新手体验
    layout() {
      return [
        ...grid(1, 1, 3, 5, 4, 3), // 5×4,彼此留 1 格空隙,好连
        { x: 2, y: 4, layer: 2 }, { x: 10, y: 4, layer: 2 },
        { x: 2, y: 10, layer: 2 }, { x: 10, y: 10, layer: 2 },
      ];
    },
  },
  2: {
    name: '第 2 关 · 传说中的地狱',
    types: 20,
    // sim.mjs 实测筛选:每个种子 bot 通关率 0.3%~4%(300 局中 1~12 胜,≥1 胜即确认有解)
    seeds: [18, 30, 60, 29, 43, 5, 2, 42, 48, 65, 40, 31, 51, 69],
    layout() {
      const pos = [];
      for (const L of [1, 3, 5]) pos.push(...grid(L, 3, 3, 5, 5, 2)); // 紧贴的 5×5
      for (const L of [2, 4, 6]) pos.push(...grid(L, 4, 4, 4, 4, 2)); // 错半格的 4×4
      for (let L = 1; L <= 7; L++) { // 左右两摞“盲堆”,只见最上一张
        pos.push({ x: 0, y: 7, layer: L });
        pos.push({ x: 14, y: 7, layer: L });
      }
      pos.push(...grid(1, 0, 14, 8, 1, 2)); // 底部连连看排 ×2(紧贴,只能借外围绕线)
      pos.push(...grid(1, 1, 16, 7, 1, 2));
      return pos; // 共 152 张
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

export function buildLevel(levelId, seed) {
  const cfg = LEVELS[levelId];
  const pos = cfg.layout();
  const rng = mulberry32(seed);
  const counts = evenCounts(pos.length, cfg.types);
  const types = [];
  counts.forEach((c, i) => { for (let k = 0; k < c; k++) types.push(i); });
  for (let i = types.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [types[i], types[j]] = [types[j], types[i]];
  }
  const game = new Game(pos.map((p, i) => ({ ...p, type: types[i] })));
  game.levelId = levelId;
  game.seed = seed;
  return game;
}

// ———————————————————————— 游戏状态机 ————————————————————————

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export class Game {
  constructor(tiles) {
    this.tiles = tiles.map((t, i) => ({ id: i, x: t.x, y: t.y, layer: t.layer, type: t.type, state: 'board' }));
    this.total = this.tiles.length;
    this.slot = [];      // 槽内牌 id,按进入顺序
    this.slotCap = 7;
    this.status = 'playing'; // playing | won | lost
    this.linkCount = 0;  // 连线消除次数(统计用)
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

  // —— 连连看连通检测:折角 ≤2;连线飞在两牌较高层之上,只被不低于该层的牌挡住 ——
  linkPath(a, b) {
    if (!a || !b || a === b || a.type !== b.type) return null;
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
    // 去掉共线中间点,只留折角
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
    return this.freeTiles().filter(b => b !== a && b.type === a.type && this.linkPath(a, b));
  }

  mark() {
    if (!this.trackHistory) return;
    this.snapshot = {
      states: this.tiles.map(t => t.state),
      types: this.tiles.map(t => t.type),
      pos: this.tiles.map(t => [t.x, t.y, t.layer]),
      slot: this.slot.slice(),
      status: this.status,
      linkCount: this.linkCount,
    };
  }

  undo() {
    if (!this.snapshot) return false;
    const s = this.snapshot;
    this.tiles.forEach((t, i) => {
      t.state = s.states[i]; t.type = s.types[i];
      [t.x, t.y, t.layer] = s.pos[i];
    });
    this.slot = s.slot.slice();
    this.status = s.status;
    this.linkCount = s.linkCount;
    this.snapshot = null;
    return true;
  }

  _checkWin() {
    if (this.tiles.every(t => t.state === 'gone')) this.status = 'won';
  }

  // 连线消除,成功返回路径(细格坐标点列)
  link(a, b) {
    if (this.status !== 'playing') return null;
    const path = this.linkPath(a, b);
    if (!path) return null;
    this.mark();
    a.state = 'gone'; b.state = 'gone';
    this.linkCount++;
    this._checkWin();
    return path;
  }

  // 入槽;槽内已有同类则立刻配对消除(不占容量);塞入第 7 张单牌即失败
  sendToSlot(t) {
    if (this.status !== 'playing' || !this.isFree(t)) return null;
    this.mark();
    const mi = this.slot.findIndex(id => this.tiles[id].type === t.type);
    if (mi >= 0) {
      const matchId = this.slot[mi];
      this.slot.splice(mi, 1);
      this.tiles[matchId].state = 'gone';
      t.state = 'gone';
      this._checkWin();
      return { paired: true, matchId };
    }
    t.state = 'slot';
    this.slot.push(t.id);
    if (this.slot.length >= this.slotCap) this.status = 'lost';
    return { paired: false };
  }

  // 洗牌:重排场上剩余牌的图案(位置不变)
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

  // 弹出:槽内最早的至多 3 张回到场面最顶层中央
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
      t.x = cx + (i - 1) * 3;
      t.y = cy;
      t.layer = maxL;
    });
    return true;
  }
}

// ———————————————————————— 难度校准 bot ————————————————————————
// 策略:优先补槽内配对 → 场上自由对(槽紧时才被迫连线)→ 挑“搭档最接近露出”的单张
// 不使用道具,水平≈会规划的普通玩家,用于批量模拟估计通关率

export function botPlay(game, rng) {
  let guard = 0;
  while (game.status === 'playing' && guard++ < 3000) {
    const free = game.freeTiles();
    if (!free.length) break;

    const slotTypes = new Set(game.slot.map(id => game.tiles[id].type));
    const comp = free.filter(t => slotTypes.has(t.type));
    if (comp.length) { game.sendToSlot(pick(rng, comp)); continue; }

    const byType = new Map();
    for (const t of free) {
      if (!byType.has(t.type)) byType.set(t.type, []);
      byType.get(t.type).push(t);
    }
    const pairs = [...byType.values()].filter(l => l.length >= 2);
    if (pairs.length) {
      if (game.slot.length <= 5) { game.sendToSlot(pick(rng, pairs)[0]); continue; }
      let linked = false; // 槽已 6:入单张即死,只能试连线
      for (const lst of pairs) {
        for (let i = 0; i < lst.length && !linked; i++)
          for (let j = i + 1; j < lst.length && !linked; j++)
            if (game.link(lst[i], lst[j])) linked = true;
        if (linked) break;
      }
      if (linked) continue;
    }

    let bestT = null, bestS = Infinity;
    for (const t of free) {
      const partners = game.boardTiles().filter(u => u !== t && u.type === t.type);
      let d = Infinity;
      for (const u of partners) d = Math.min(d, game.coverers(u).length);
      const s = d * 2 - t.layer * 0.3 + rng() * 1.5;
      if (s < bestS) { bestS = s; bestT = t; }
    }
    game.sendToSlot(bestT || pick(rng, free));
  }
  return game.status;
}
