// Excel import and export, using the bundled SheetJS build (window.XLSX).

import { SHAPES, DIAMETERS, rowTotals, summary } from './bbs.js';
import { t, getLang } from './i18n.js';

const HEADERS = {
  mark: ['bar mark', 'mark', 'العلامة', 'علامة', 'رمز', '编号'],
  member: ['member', 'element', 'العنصر', 'عنصر', '构件'],
  dia: ['diameter', 'dia', 'size', 'ø', 'القطر', 'قطر', '直径'],
  shape: ['shape code', 'shape', 'الشكل', 'شكل', '形状'],
  length: ['cut length', 'length', 'طول القص', 'الطول', 'طول', '下料长度', '长度'],
  qty: ['quantity', 'total no', 'qty', 'no.', 'number', 'العدد', 'عدد', 'الكمية', '数量'],
  A: ['a'], B: ['b'], C: ['c'],
};

const norm = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const toNum = (v) => {
  const n = parseFloat(String(v ?? '').replace(/[^\d.,-]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};

function findColumns(row) {
  const cols = {};
  row.forEach((cell, i) => {
    const c = norm(cell);
    if (!c) return;
    for (const [key, words] of Object.entries(HEADERS)) {
      if (cols[key] !== undefined) continue;
      const short = key.length === 1;
      if (words.some((w) => (short ? c === w : c === w || c.includes(w)))) { cols[key] = i; break; }
    }
  });
  return cols;
}

// Reads the first sheet that has diameter, quantity and a length (or shape
// dimensions). Lengths under 50 are taken as metres.
export function importSchedule(bytes) {
  const wb = window.XLSX.read(bytes, { type: 'array' });
  for (const name of wb.SheetNames) {
    const grid = window.XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, blankrows: false, defval: '' });
    for (let h = 0; h < Math.min(grid.length, 15); h++) {
      const cols = findColumns(grid[h]);
      if (cols.dia === undefined || cols.qty === undefined || (cols.length === undefined && cols.A === undefined)) continue;
      const rows = [];
      for (const r of grid.slice(h + 1)) {
        const dia = toNum(r[cols.dia]);
        const qty = Math.floor(toNum(r[cols.qty]));
        if (!DIAMETERS.includes(dia) || !(qty > 0)) continue;
        const row = { mark: String(r[cols.mark] ?? '').trim(), member: String(r[cols.member] ?? '').trim(), dia, qty };
        const code = String(r[cols.shape] ?? '').trim().padStart(2, '0');
        const dims = { A: toNum(r[cols.A]), B: toNum(r[cols.B]), C: toNum(r[cols.C]) };
        let len = toNum(r[cols.length]);
        if (len > 0 && len < 50) len = Math.round(len * 1000);
        if (SHAPES[code] && SHAPES[code].calc && SHAPES[code].dims.every((k) => dims[k] > 0)) {
          Object.assign(row, { shape: code }, Object.fromEntries(SHAPES[code].dims.map((k) => [k, dims[k]])));
        } else if (len > 0) {
          Object.assign(row, { shape: 'XX', length: Math.round(len) });
        } else continue;
        rows.push(row);
      }
      if (rows.length) return rows;
    }
  }
  return [];
}

function sheet(aoa, widths) {
  const ws = window.XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = widths.map((w) => ({ wch: w }));
  return ws;
}

const patternName = (i) => String.fromCharCode(65 + (i % 26)) + (i >= 26 ? Math.floor(i / 26) : '');
// Sheet names: at most 31 characters, none of : \ / ? * [ ]
const sheetName = (s) => s.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31);

export function exportWorkbook(project, plans) {
  const XLSX = window.XLSX;
  const wb = XLSX.utils.book_new();
  const r1 = (n) => Math.round(n * 10) / 10;

  const bbs = [[t('colMark'), t('colMember'), t('colDia'), t('colShape'), 'A', 'B', 'C', t('colCut'), t('colQty'), t('colWeight')]];
  for (const row of project.rows) {
    const tot = rowTotals(row);
    bbs.push([row.mark, row.member || '', row.dia, row.shape === 'XX' ? t('shapeXX') : row.shape,
      row.A || '', row.B || '', row.C || '', Number.isFinite(tot.cut) ? tot.cut : '', tot.count, r1(tot.kg)]);
  }
  XLSX.utils.book_append_sheet(wb, sheet(bbs, [10, 14, 7, 10, 8, 8, 8, 14, 8, 12]), 'BBS');

  const sum = [[t('diameter'), t('colQty'), `${t('totalLength')} (m)`, t('colWeight'), t('kpiBars')]];
  let kg = 0;
  for (const s of summary(project.rows)) {
    kg += s.kg;
    sum.push([`Ø${s.dia}`, s.pieces, r1(s.metres), r1(s.kg), plans[s.dia] ? plans[s.dia].bars : '']);
  }
  sum.push(['Σ', '', '', r1(kg), Object.values(plans).reduce((a, p) => a + p.bars, 0)]);
  XLSX.utils.book_append_sheet(wb, sheet(sum, [10, 10, 16, 14, 14]), sheetName(t('byDia')));

  const cut = [[t('diameter'), t('pattern'), t('kpiBars'), `${t('workshopFrom')} (mm)`, t('colCut'), `${t('offcut')} (mm)`]];
  for (const [dia, plan] of Object.entries(plans)) {
    plan.patterns.forEach((p, i) => cut.push([`Ø${dia}`, patternName(i), p.times, p.stock, p.cuts.join(' + '), p.offcut]));
  }
  XLSX.utils.book_append_sheet(wb, sheet(cut, [10, 8, 10, 14, 46, 12]), sheetName(t('navCutting')));

  wb.Workbook = { Views: [{ RTL: getLang() === 'ar' }] };
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
}

export function templateWorkbook() {
  const XLSX = window.XLSX;
  const wb = XLSX.utils.book_new();
  const head = [['Mark', 'Member', 'Diameter', 'Shape code', 'A', 'B', 'C', 'Cut length (mm)', 'Quantity'],
    ['C1-01', 'Column C1', 16, '00', 3200, '', '', '', 240],
    ['C1-02', 'Column C1', 10, '51', 300, 500, '', '', 860],
    ['B2-04', 'Beam B2', 20, '', '', '', '', 5800, 96]];
  XLSX.utils.book_append_sheet(wb, sheet(head, [10, 14, 10, 12, 8, 8, 8, 16, 10]), 'BBS');
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
}

// The rebar weight list: one line per diameter, length and count.
export function weightsWorkbook(lines) {
  const XLSX = window.XLSX;
  const wb = XLSX.utils.book_new();
  const r2 = (n) => Math.round(n * 100) / 100;
  const aoa = [[t('diameter'), t('colMark'), t('wLength'), t('wQty'), t('kgm'), t('colWeight')]];
  let kg = 0;
  for (const l of lines) {
    kg += l.kg;
    aoa.push([`Ø${l.dia}`, l.mark || '', l.length, l.qty, Math.round(l.kgm * 1000) / 1000, r2(l.kg)]);
  }
  aoa.push(['Σ', '', '', '', '', r2(kg)]);
  XLSX.utils.book_append_sheet(wb, sheet(aoa, [18, 18, 12, 10, 10, 14]), sheetName(t('wSheet')));
  wb.Workbook = { Views: [{ RTL: getLang() === 'ar' }] };
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
}

export { patternName };
