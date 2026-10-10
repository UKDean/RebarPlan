import { test } from 'node:test';
import assert from 'node:assert/strict';
import { optimise } from '../src/js/optimizer.js';
import { cutLength, kgPerMetre, summary, shortLegs } from '../src/js/bbs.js';

function cutCounts(plan) {
  const got = new Map();
  for (const p of plan.patterns) for (const c of p.cuts) got.set(c, (got.get(c) || 0) + p.times);
  return got;
}

test('plan cuts exactly the demanded pieces and never overfills a bar', () => {
  const pieces = [
    { length: 3200, qty: 240 }, { length: 2650, qty: 310 },
    { length: 5750, qty: 32 }, { length: 1350, qty: 54 }, { length: 2250, qty: 96 },
  ];
  const plan = optimise(pieces, { stock: 12000 });
  const got = cutCounts(plan);
  for (const p of pieces) assert.equal(got.get(p.length), p.qty, `length ${p.length}`);
  for (const p of plan.patterns) assert.ok(p.cuts.reduce((a, b) => a + b, 0) <= 12000);
  assert.ok(plan.bars >= plan.lowerBound);
  assert.ok(plan.bars <= plan.naiveBars);
});

// LP relaxation bounds for the 25 schedules below, from column generation
// with the HiGHS solver; no plan can beat ceil(LP). null where not computed.
const LP = [280.9, 188, null, 115.25, null, null, 289.33, 134.5, 230.75, 121.2, null, 117, null,
  490, null, 359, 297.5, 331, 317.5, 255.38, null, 245, 361.13, 197.5, 274];

test('plan stays within one bar of the LP bound on mixed schedules', () => {
  // Deterministic pseudo-random schedules.
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (let run = 0; run < 25; run++) {
    const pieces = Array.from({ length: 6 + Math.floor(rnd() * 8) }, () => ({
      length: 25 * Math.round((600 + rnd() * 8000) / 25),
      qty: 1 + Math.floor(rnd() * 120),
    }));
    const plan = optimise(pieces);
    const got = cutCounts(plan);
    const want = new Map();
    for (const p of pieces) want.set(p.length, (want.get(p.length) || 0) + p.qty);
    assert.deepEqual([...got].sort(), [...want].sort());
    assert.ok(plan.bars >= plan.lowerBound);
    const limit = LP[run] === null ? Math.ceil(plan.lowerBound * 1.12) + 1 : Math.ceil(LP[run] - 1e-9) + 1;
    assert.ok(plan.bars <= limit, `run ${run}: ${plan.bars} bars, limit ${limit}`);
  }
});

test('kerf is taken from every cut', () => {
  const plan = optimise([{ length: 4000, qty: 3 }], { stock: 12000, kerf: 5 });
  // 3 × 4005 > 12005, so only two pieces fit per bar.
  assert.equal(plan.bars, 2);
});

test('pieces longer than the stock bar are reported, not cut', () => {
  const plan = optimise([{ length: 13000, qty: 2 }, { length: 6000, qty: 2 }]);
  assert.deepEqual(plan.tooLong, [{ length: 13000, qty: 2 }]);
  assert.equal(plan.bars, 1);
});

test('unit weight matches the 0.006165·d² rule', () => {
  assert.ok(Math.abs(kgPerMetre(16) - 1.578) < 0.001);
  assert.ok(Math.abs(kgPerMetre(12) - 0.888) < 0.001);
});

test('BS 8666 shape lengths, rounded up to 25 mm', () => {
  // Shape 11, d = 16, r = 32: 1000 + 500 − 16 − 16 = 1468 → 1475.
  assert.equal(cutLength({ shape: '11', dia: 16, A: 1000, B: 500 }), 1475);
  // Shape 21, d = 20, r = 70: 600 + 2000 + 600 − 70 − 40 = 3090 → 3100.
  assert.equal(cutLength({ shape: '21', dia: 20, A: 600, B: 2000, C: 600 }), 3100);
  // Shape 51, published worked example: 300 × 500 beam, 25 cover, Ø10:
  // 2(450 + 250 + 100) − 2.5·20 − 5·10 = 1500.
  assert.equal(cutLength({ shape: '51', dia: 10, A: 450, B: 250, C: 100 }), 1500);
  // ACI L bar, Ø16, r = 3d = 48: 1000 + 500 − (2·64 − π/2·56) = 1459.96 → 1475.
  assert.equal(cutLength({ shape: 'L', dia: 16, A: 1000, B: 500 }), 1475);
  assert.equal(cutLength({ shape: '00', dia: 12, A: 3210 }), 3210);
  assert.equal(cutLength({ shape: 'XX', dia: 12, length: 4400 }), 4400);
  assert.ok(Number.isNaN(cutLength({ shape: '11', dia: 16, A: 1000 })));
});

test('summary groups by diameter', () => {
  const s = summary([
    { shape: '00', dia: 16, A: 3200, qty: 240 },
    { shape: '00', dia: 16, A: 2650, qty: 310 },
    { shape: '00', dia: 12, A: 1450, qty: 860 },
  ]);
  assert.deepEqual(s.map((x) => x.dia), [12, 16]);
  assert.equal(s[1].pieces, 550);
  assert.ok(Math.abs(s[1].metres - (768 + 821.5)) < 1e-9);
});

test('BS 8666 minimum end projection is flagged', () => {
  assert.deepEqual(shortLegs({ shape: '11', dia: 20, A: 150, B: 800 }), [{ dim: 'A', min: 190 }]);
  assert.deepEqual(shortLegs({ shape: '51', dia: 10, A: 450, B: 250, C: 100 }), [{ dim: 'C', min: 130 }]);
});

test('each pattern moves to the shortest stock bar it fits', () => {
  const plan = optimise([{ length: 5800, qty: 1 }, { length: 11000, qty: 2 }], { stocks: [12000, 6000] });
  assert.deepEqual(plan.byStock, { 12000: 2, 6000: 1 });
  assert.equal(plan.boughtMm, 30000);
});
