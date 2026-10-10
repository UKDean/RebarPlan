// One-dimensional cutting plan for stock bars (default 12 m).
//
// Sequential heuristic: repeatedly pick the best cutting pattern for one
// stock bar (a bounded knapsack over the remaining demand), run it as many
// times as the demand allows, and repeat. Scoring pieces by length^p rather
// than plain length makes the early patterns place the long pieces first,
// which keeps short pieces in hand to fill the gaps later. A few values of p
// plus best-fit decreasing are tried and the plan with the fewest bars wins.
//
// Lengths are integers in mm. Each cut consumes `kerf` mm of the bar.
// With several stock lengths (e.g. 12 m and 6 m) the plan is built on the
// longest, then each pattern moves to the shortest stock bar it fits in.

const WEIGHTS = [1.1, 1.25, 1.5, 2];

export function optimise(pieces, { stock = 12000, stocks, kerf = 0, minReuse = 1000 } = {}) {
  const lengths = [...new Set((stocks && stocks.length ? stocks : [stock]).map(Number).filter((s) => s > 0))].sort((a, b) => b - a);
  stock = lengths[0];
  const demand = new Map();
  const tooLong = [];
  for (const p of pieces) {
    const len = Math.round(Number(p.length));
    const qty = Math.floor(Number(p.qty));
    if (!(len > 0) || !(qty > 0)) continue;
    if (len > stock) { tooLong.push({ length: len, qty }); continue; }
    demand.set(len, (demand.get(len) || 0) + qty);
  }

  let best = bestFitDecreasing(demand, stock, kerf);
  for (const p of WEIGHTS) {
    const plan = sequential(demand, stock, kerf, p);
    if (barCount(plan) < barCount(best) || (barCount(plan) === barCount(best) && plan.length < best.length)) best = plan;
  }
  for (const p of best) {
    const need = used(p.cuts, kerf) - kerf;
    p.stock = lengths.filter((s) => s >= need).pop();
    p.offcut = p.stock - need;
  }
  return report(best, pieces, { stock, kerf, minReuse, tooLong });
}

const barCount = (patterns) => patterns.reduce((s, p) => s + p.times, 0);
const used = (cuts, kerf) => cuts.reduce((s, c) => s + c, 0) + kerf * cuts.length;

function sequential(initial, stock, kerf, p) {
  const demand = new Map(initial);
  const patterns = [];
  while ([...demand.values()].some((q) => q > 0)) {
    const use = bestPattern(demand, stock, kerf, p);
    let times = Infinity;
    for (const [len, k] of use) times = Math.min(times, Math.floor(demand.get(len) / k));
    for (const [len, k] of use) demand.set(len, demand.get(len) - k * times);
    patterns.push(pattern(use, times, stock, kerf));
  }
  return patterns;
}

// Bounded knapsack maximising Σ length^p within one bar.
function bestPattern(demand, stock, kerf, p) {
  const cap = stock + kerf; // the last cut needs no kerf after it
  const items = [];
  for (const [len, qty] of demand) {
    if (qty <= 0) continue;
    const w = len + kerf;
    const fit = Math.min(qty, Math.floor(cap / w));
    // Binary splitting turns the bounded problem into 0/1 items.
    for (let k = 1, left = fit; left > 0; k *= 2) {
      const take = Math.min(k, left);
      items.push({ len, count: take, w: w * take, v: take * Math.pow(len, p) });
      left -= take;
    }
  }
  let value = new Float64Array(cap + 1).fill(-Infinity);
  value[0] = 0;
  const took = [];
  for (const it of items) {
    const next = Float64Array.from(value);
    const mark = new Uint8Array(cap + 1);
    for (let c = it.w; c <= cap; c++) {
      if (value[c - it.w] + it.v > next[c]) { next[c] = value[c - it.w] + it.v; mark[c] = 1; }
    }
    took.push(mark);
    value = next;
  }
  let c = 0;
  for (let x = 1; x <= cap; x++) if (value[x] > value[c]) c = x;
  const use = new Map();
  for (let i = items.length - 1; i >= 0; i--) {
    if (took[i][c]) {
      use.set(items[i].len, (use.get(items[i].len) || 0) + items[i].count);
      c -= items[i].w;
    }
  }
  return use;
}

function bestFitDecreasing(demand, stock, kerf) {
  const cap = stock + kerf;
  const lengths = [...demand].flatMap(([len, qty]) => Array(qty).fill(len)).sort((a, b) => b - a);
  const bins = [];
  for (const len of lengths) {
    let best = -1;
    for (let i = 0; i < bins.length; i++) {
      const room = cap - bins[i].fill;
      if (room >= len + kerf && (best < 0 || room < cap - bins[best].fill)) best = i;
    }
    if (best < 0) bins.push({ fill: 0, cuts: [] }), (best = bins.length - 1);
    bins[best].fill += len + kerf;
    bins[best].cuts.push(len);
  }
  // Group identical bars into repeated patterns.
  const groups = new Map();
  for (const b of bins) {
    const key = b.cuts.join(',');
    groups.set(key, (groups.get(key) || 0) + 1);
  }
  return [...groups].map(([key, times]) => {
    const use = new Map();
    for (const len of key.split(',').map(Number)) use.set(len, (use.get(len) || 0) + 1);
    return pattern(use, times, stock, kerf);
  });
}

function pattern(use, times, stock, kerf) {
  const cuts = [...use].flatMap(([len, k]) => Array(k).fill(len)).sort((a, b) => b - a);
  return { cuts, times, offcut: Math.max(0, stock - used(cuts, kerf) + kerf) };
}

// Martello–Toth L2 bound: no plan can use fewer bars than this.
function lowerBound(patterns, stock, kerf) {
  const cap = stock + kerf;
  const count = new Map();
  for (const p of patterns) for (const c of p.cuts) count.set(c + kerf, (count.get(c + kerf) || 0) + p.times);
  const sizes = [...count].sort((a, b) => a[0] - b[0]);
  const total = sizes.reduce((s, [w, n]) => s + w * n, 0);
  let best = Math.ceil(total / cap);
  for (const K of [0, ...sizes.map(([w]) => w).filter((w) => w <= cap / 2)]) {
    let big = 0, mid = 0, midRoom = 0, small = 0;
    for (const [w, n] of sizes) {
      if (w > cap - K) big += n;
      else if (w > cap / 2) { mid += n; midRoom += n * (cap - w); }
      else if (w >= K) small += n * w;
    }
    best = Math.max(best, big + mid + Math.max(0, Math.ceil((small - midRoom) / cap)));
  }
  return best;
}

function report(patterns, pieces, { stock, kerf, minReuse, tooLong }) {
  const bars = barCount(patterns);
  const bought = patterns.reduce((s, p) => s + p.times * p.stock, 0);
  const byStock = {};
  for (const p of patterns) byStock[p.stock] = (byStock[p.stock] || 0) + p.times;
  const steel = patterns.reduce((s, p) => s + p.times * p.cuts.reduce((a, b) => a + b, 0), 0);
  const offcuts = patterns.reduce((s, p) => s + p.times * p.offcut, 0);
  const reusable = patterns.filter((p) => p.offcut >= minReuse).reduce((s, p) => s + p.times, 0);

  // What cutting each mark on its own would take: whole pieces per bar, no mixing.
  let naive = 0;
  for (const p of pieces) {
    const len = Math.round(Number(p.length));
    const qty = Math.floor(Number(p.qty));
    if (!(len > 0) || !(qty > 0) || len > stock) continue;
    naive += Math.ceil(qty / Math.floor((stock + kerf) / (len + kerf)));
  }

  return {
    patterns: patterns.sort((a, b) => b.times - a.times || a.offcut - b.offcut),
    bars,
    byStock,
    boughtMm: bought,
    lowerBound: lowerBound(patterns, stock, kerf),
    naiveBars: naive,
    steelMm: steel,
    offcutMm: offcuts,
    reusableOffcuts: reusable,
    wastePct: bought ? (100 * (bought - steel)) / bought : 0,
    tooLong,
  };
}
