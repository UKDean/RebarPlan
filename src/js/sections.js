// Weight per metre of rebar and structural steel sections. The area formulas
// are the ones the SteelCalc app and mashharawi.com/steelcalc use, so the three
// give the same figure for the same section.

import DATA from '../data/sections.js';
import { DIAMETERS, kgPerMetre as rebarKgPerMetre } from './bbs.js';

export const RHO = 7850; // kg/m3

// Areas in mm². Fillets and toe radii follow EN 10365 / EN 10056.
const AREA = {
  ibeam: (d) => 2 * d.b * d.tf + (d.h - 2 * d.tf) * d.tw + (4 - Math.PI) * d.r * d.r,
  channel: (d) => 2 * d.b * d.tf + (d.h - 2 * d.tf) * d.tw + ((4 - Math.PI) / 2) * d.r * d.r,
  angle: (d) => d.t * (d.a + d.b - d.t) + ((4 - Math.PI) / 4) * d.r1 * d.r1 - ((4 - Math.PI) / 2) * d.r2 * d.r2,
  round: (d) => (Math.PI * d.d * d.d) / 4,
  square: (d) => d.s * d.s,
  hex: (d) => (Math.sqrt(3) / 2) * d.w * d.w,
  flat: (d) => d.width * d.thickness,
  // Hollow sections: "exact" subtracts the bore; "quick" is outer perimeter ×
  // wall, the simplified formula many supplier calculators use (runs heavier).
  pipe: (d, quick) => {
    if (quick) return Math.PI * d.od * d.t;
    const bore = d.od - 2 * d.t;
    return bore > 0 ? (Math.PI / 4) * (d.od * d.od - bore * bore) : NaN;
  },
  tube: (d, quick) => {
    if (quick) return 2 * (d.w + d.h) * d.t;
    const iw = d.w - 2 * d.t, ih = d.h - 2 * d.t;
    return iw > 0 && ih > 0 ? d.w * d.h - iw * ih : NaN;
  },
};

// Families in the order the calculator lists them. Rebar comes first: it is
// what RebarPlan users weigh most. Pipe and tube take entered dimensions.
export const FAMILIES = [
  { key: 'rebar', shape: 'rebar', standard: 'BS 4449 / ASTM A615', sizes: DIAMETERS.map((d) => ({ designation: `Ø${d}`, d, verified: true })) },
  ...DATA.families.map((f) => ({ ...f, standard: f.standard || '' })),
  { key: 'pipe', shape: 'pipe', standard: '', manual: [['od', 60.3], ['t', 3.6]] },
  { key: 'tube', shape: 'tube', standard: '', manual: [['w', 60], ['h', 60], ['t', 3]] },
];

export const family = (key) => FAMILIES.find((f) => f.key === key) || FAMILIES[0];

export function areaMm2(shape, dims, quick = false) {
  if (shape === 'rebar') return (Math.PI * dims.d * dims.d) / 4;
  const fn = AREA[shape];
  return fn ? fn(dims, quick) : NaN;
}

export function kgPerMetre(shape, dims, quick = false) {
  if (shape === 'rebar') return rebarKgPerMetre(dims.d);
  const a = areaMm2(shape, dims, quick);
  return Number.isFinite(a) && a > 0 ? a * 1e-6 * RHO : NaN;
}

export function designation(fam, dims) {
  if (fam.key === 'pipe') return `Ø${dims.od} × ${dims.t}`;
  if (fam.key === 'tube') return `${dims.w}×${dims.h}×${dims.t}`;
  return dims.designation;
}

// Cross-section as an SVG path in millimetres centred on the origin, with the
// overall width and height so the caller can scale it into a fixed box.
export function outline(shape, d) {
  const r = (x, y, w, h) => `M${x} ${y}h${w}v${h}h${-w}Z`;
  const circle = (rad) => `M${-rad} 0a${rad} ${rad} 0 1 0 ${2 * rad} 0a${rad} ${rad} 0 1 0 ${-2 * rad} 0Z`;
  switch (shape) {
    case 'ibeam': {
      const o = (d.b - d.tw) / 2, web = d.h - 2 * d.tf;
      return { w: d.b, h: d.h, d: `M${-d.b / 2} ${-d.h / 2}h${d.b}v${d.tf}h${-o}v${web}h${o}v${d.tf}h${-d.b}v${-d.tf}h${o}v${-web}h${-o}Z` };
    }
    case 'channel': {
      const o = d.b - d.tw, web = d.h - 2 * d.tf;
      return { w: d.b, h: d.h, d: `M${-d.b / 2} ${-d.h / 2}h${d.b}v${d.tf}h${-o}v${web}h${o}v${d.tf}h${-d.b}Z` };
    }
    case 'angle':
      return { w: d.b, h: d.a, d: `M${-d.b / 2} ${-d.a / 2}h${d.t}v${d.a - d.t}h${d.b - d.t}v${d.t}h${-d.b}Z` };
    case 'rebar':
    case 'round':
      return { w: d.d, h: d.d, d: circle(d.d / 2) };
    case 'square':
      return { w: d.s, h: d.s, d: r(-d.s / 2, -d.s / 2, d.s, d.s) };
    case 'hex': {
      const a = d.w / Math.sqrt(3);
      const pts = [0, 1, 2, 3, 4, 5].map((i) => `${(a * Math.cos((Math.PI / 3) * i)).toFixed(2)} ${(a * Math.sin((Math.PI / 3) * i)).toFixed(2)}`);
      return { w: 2 * a, h: d.w, d: `M${pts.join('L')}Z` };
    }
    case 'flat':
      return { w: d.width, h: d.thickness, d: r(-d.width / 2, -d.thickness / 2, d.width, d.thickness) };
    case 'pipe': {
      const ri = d.od / 2 - d.t;
      return { w: d.od, h: d.od, d: circle(d.od / 2) + (ri > 0 ? circle(ri) : '') };
    }
    case 'tube': {
      const inner = d.w - 2 * d.t > 0 && d.h - 2 * d.t > 0 ? r(-d.w / 2 + d.t, -d.h / 2 + d.t, d.w - 2 * d.t, d.h - 2 * d.t) : '';
      return { w: d.w, h: d.h, d: r(-d.w / 2, -d.h / 2, d.w, d.h) + inner };
    }
    default:
      return { w: 1, h: 1, d: '' };
  }
}
