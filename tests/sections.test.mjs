import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FAMILIES, family, kgPerMetre } from '../src/js/sections.js';

const kgm = (key, des) => {
  const f = family(key);
  return kgPerMetre(f.shape, f.sizes.find((s) => s.designation === des));
};
const near = (got, want, tol) => assert.ok(Math.abs(got - want) <= tol, `${got} vs ${want}`);

test('section weights match the published EN 10365 / EN 10056 tables', () => {
  near(kgm('ipe', 'IPE 200'), 22.4, 0.1);
  near(kgm('ipe', 'IPE 300'), 42.2, 0.2);
  near(kgm('hea', 'HEA 200'), 42.3, 0.1);
  near(kgm('heb', 'HEB 200'), 61.3, 0.1);
  near(kgm('angle_equal', 'L 50x50x5'), 3.77, 0.02);
  near(kgm('rebar', 'Ø16'), 1.578, 0.001);
});

test('hollow sections: exact subtracts the bore, quick runs heavier, too-thick wall is invalid', () => {
  near(kgPerMetre('pipe', { od: 60.3, t: 3.6 }), 5.03, 0.01);
  assert.ok(kgPerMetre('pipe', { od: 60.3, t: 3.6 }, true) > kgPerMetre('pipe', { od: 60.3, t: 3.6 }));
  near(kgPerMetre('tube', { w: 100, h: 100, t: 4 }), 12.06, 0.01);
  assert.ok(Number.isNaN(kgPerMetre('pipe', { od: 20, t: 12 })));
});

test('every listed size has a positive weight', () => {
  for (const f of FAMILIES.filter((x) => x.sizes)) {
    for (const s of f.sizes) assert.ok(kgPerMetre(f.shape, s) > 0, `${f.key} ${s.designation}`);
  }
});
