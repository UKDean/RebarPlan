// Bar bending schedule: shapes, cut lengths and weights. Lengths in mm.
//
// Two scheduling standards:
//  * BS 8666:2005: shape codes and length formulas from Table 4, minimum
//    radius r and end projection P from Table 2. Formula lengths are
//    rounded up to the next 25 mm.
//  * ACI 318 / SBC 304 (the Saudi code follows ACI 318): out-to-out leg
//    dimensions; the cut length is the bar's centreline length, worked out
//    from the bend geometry with the ACI minimum bend diameters (Table
//    25.3.1: 6d up to Ø25, 8d for Ø28–Ø36, 10d above). Rounded up to 25 mm.

export const DIAMETERS = [6, 8, 10, 12, 14, 16, 18, 20, 22, 25, 28, 32, 36, 40];

// Steel density 7850 kg/m³: kg per metre = π/4 · d² · 7850e-6 ≈ 0.006165 · d².
export function kgPerMetre(d) {
  return (Math.PI / 4) * d * d * 7850e-6;
}

// BS 8666 Table 2 (B500): minimum scheduling radius r = 2d up to Ø16, 3.5d
// above; minimum end projection P, general and for links bent to 150° or less.
const P_TABLE = { 6: [110, 110], 8: [115, 115], 10: [120, 130], 12: [125, 160], 16: [130, 210], 20: [190, 290], 25: [240, 365], 32: [305, 465], 40: [380, 580] };
export function bsRadius(d) {
  return d <= 16 ? 2 * d : 3.5 * d;
}
// Sizes missing from the table (14, 18, 22, 28, 36) use the next size up.
export function bsMinProjection(d, link = false) {
  const size = Object.keys(P_TABLE).map(Number).find((s) => s >= d) ?? 40;
  return P_TABLE[size][link ? 1 : 0];
}

// ACI 318 inside bend diameter for standard hooks and bends.
export function aciBendDiameter(d) {
  return d <= 25 ? 6 * d : d <= 36 ? 8 * d : 10 * d;
}

// Centreline length lost at a bend of `deg` degrees when the legs are given
// out-to-out: 2(r + d)·tan(θ/2) − θ(r + d/2), with r the inside radius.
export function bendDeduction(deg, r, d) {
  const th = (deg * Math.PI) / 180;
  return 2 * (r + d) * Math.tan(th / 2) - th * (r + d / 2);
}

export const SHAPES = {
  // BS 8666
  '00': { std: 'BS', dims: ['A'], formula: 'L = A', calc: ({ A }) => A },
  '11': { std: 'BS', dims: ['A', 'B'], formula: 'L = A + B − 0.5r − d', min: ['A', 'B'],
    calc: ({ A, B }, d) => A + B - 0.5 * bsRadius(d) - d },
  '21': { std: 'BS', dims: ['A', 'B', 'C'], formula: 'L = A + B + C − r − 2d', min: ['A', 'C'],
    calc: ({ A, B, C }, d) => A + B + C - bsRadius(d) - 2 * d },
  '51': { std: 'BS', dims: ['A', 'B', 'C'], formula: 'L = 2(A + B + C) − 2.5r − 5d', min: ['C'], link: true,
    calc: ({ A, B, C }, d) => 2 * (A + B + C) - 2.5 * bsRadius(d) - 5 * d },
  // ACI 318 / SBC 304, out-to-out legs
  'S': { std: 'ACI', dims: ['A'], formula: 'L = A', calc: ({ A }) => A },
  'L': { std: 'ACI', dims: ['A', 'B'], formula: 'L = A + B − Δ90',
    calc: ({ A, B }, d) => A + B - bendDeduction(90, aciBendDiameter(d) / 2, d) },
  'U': { std: 'ACI', dims: ['A', 'B', 'C'], formula: 'L = A + B + C − 2Δ90',
    calc: ({ A, B, C }, d) => A + B + C - 2 * bendDeduction(90, aciBendDiameter(d) / 2, d) },
  // Any standard
  'XX': { std: '*', dims: [], formula: 'L', calc: null },
};

export const shapesFor = (std) => Object.keys(SHAPES).filter((k) => SHAPES[k].std === std || SHAPES[k].std === '*');

const roundUp25 = (mm) => Math.ceil(mm / 25 - 1e-9) * 25;

// Cut length of one bar in mm, or NaN when the row is incomplete.
export function cutLength(row) {
  const shape = SHAPES[row.shape] || SHAPES['00'];
  const d = Number(row.dia);
  if (!shape.calc) return Number(row.length) > 0 ? Number(row.length) : NaN;
  const dims = {};
  for (const k of shape.dims) {
    const v = Number(row[k]);
    if (!(v > 0)) return NaN;
    dims[k] = v;
  }
  const L = shape.calc(dims, d);
  if (!(L > 0)) return NaN;
  return shape.dims.length === 1 ? L : roundUp25(L);
}

// Dimensions shorter than the BS 8666 minimum end projection.
export function shortLegs(row) {
  const shape = SHAPES[row.shape];
  if (!shape || !shape.min) return [];
  const p = bsMinProjection(Number(row.dia), shape.link);
  return shape.min.filter((k) => Number(row[k]) > 0 && Number(row[k]) < p).map((k) => ({ dim: k, min: p }));
}

export function rowTotals(row) {
  const L = cutLength(row);
  const n = Math.max(0, Math.floor(Number(row.qty) || 0));
  if (!Number.isFinite(L) || !n) return { cut: L, count: n, metres: 0, kg: 0 };
  const metres = (L / 1000) * n;
  return { cut: L, count: n, metres, kg: metres * kgPerMetre(Number(row.dia)) };
}

// Totals per diameter, sorted by diameter.
export function summary(rows) {
  const byDia = new Map();
  for (const row of rows) {
    const t = rowTotals(row);
    if (!t.metres) continue;
    const d = Number(row.dia);
    const s = byDia.get(d) || { dia: d, pieces: 0, metres: 0, kg: 0 };
    s.pieces += t.count;
    s.metres += t.metres;
    s.kg += t.kg;
    byDia.set(d, s);
  }
  return [...byDia.values()].sort((a, b) => a.dia - b.dia);
}
