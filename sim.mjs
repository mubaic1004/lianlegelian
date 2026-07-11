// 难度模拟:node sim.mjs <level> <seedFrom> <seedTo> <runs>
// 用启发式 bot 批量试玩,估计每个布局种子的通关率,用于筛选关卡种子
import { buildLevel, botPlay, mulberry32 } from './engine.js';

const [, , level = '2', seedFrom = '1', seedTo = '30', runs = '300'] = process.argv;
const t0 = Date.now();
const results = [];
for (let seed = +seedFrom; seed <= +seedTo; seed++) {
  let wins = 0;
  for (let r = 0; r < +runs; r++) {
    const g = buildLevel(+level, seed);
    if (botPlay(g, mulberry32(seed * 100003 + r * 7919 + 1)) === 'won') wins++;
  }
  results.push({ seed, wins });
  console.log(`level ${level} seed ${String(seed).padStart(3)}: ${String(wins).padStart(3)}/${runs} = ${(wins / +runs * 100).toFixed(1)}%`);
}
console.log(`--- ${((Date.now() - t0) / 1000).toFixed(1)}s`);
const sorted = results.slice().sort((a, b) => a.wins - b.wins);
console.log('最难(但≥1胜=有解):', sorted.filter(r => r.wins >= 1).slice(0, 12).map(r => `${r.seed}(${r.wins})`).join(' '));
